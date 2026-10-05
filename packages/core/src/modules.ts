import { isGeneratedFile, isTestFile } from "./files";

export interface ModuleNode {
  id: string;
  files: number;
  changed: boolean;
  changedLines: number;
}

export interface ModuleMap {
  modules: ModuleNode[];
  edges: { from: string; to: string }[];
}

const IMPORT_RE =
  /(?:import|export)\s+(?:[^'"`]*?\sfrom\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|require\(\s*["']([^"']+)["']\s*\)/g;
const SOURCE_RE = /\.(tsx?|jsx?|mjs|cjs)$/;

/** A file's module: its directory, e.g. "src/checkout". Top-level files belong to their own name. */
export function moduleOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? path : path.slice(0, i);
}

function resolveImport(fromFile: string, spec: string, known: Set<string>): string | null {
  if (!spec.startsWith(".")) return null; // packages aren't part of the map
  const parts = moduleOf(fromFile).split("/");
  for (const seg of spec.split("/")) {
    if (seg === "." || seg === "") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  const base = parts.join("/");
  const candidates = [
    base,
    ...[".ts", ".tsx", ".js", ".jsx", ".mjs"].map((e) => base + e),
    `${base}/index.ts`,
    `${base}/index.tsx`,
    `${base}/index.js`,
  ];
  return candidates.find((c) => known.has(c)) ?? null;
}

/**
 * Builds the module map around a change from real imports: which modules exist,
 * which changed, and which depend on which. Tests and generated files are left out.
 * Keeps changed modules, their direct neighbours, and nothing else, so the map stays
 * readable.
 */
export function buildModuleMap(
  files: { path: string; content: string }[],
  changedLines: Map<string, number>,
  maxModules = 9,
): ModuleMap {
  const source = files.filter(
    (f) => SOURCE_RE.test(f.path) && !isTestFile(f.path) && !isGeneratedFile(f.path),
  );
  const known = new Set(source.map((f) => f.path));
  const counts = new Map<string, { files: number; changedLines: number }>();
  for (const f of source) {
    const m = moduleOf(f.path);
    const c = counts.get(m) ?? { files: 0, changedLines: 0 };
    c.files += 1;
    c.changedLines += changedLines.get(f.path) ?? 0;
    counts.set(m, c);
  }
  const edgeSet = new Set<string>();
  for (const f of source) {
    for (const m of f.content.matchAll(IMPORT_RE)) {
      const target = resolveImport(f.path, m[1] ?? m[2] ?? m[3] ?? "", known);
      if (!target) continue;
      const from = moduleOf(f.path);
      const to = moduleOf(target);
      if (from !== to) edgeSet.add(`${from}→${to}`);
    }
  }
  const edges = [...edgeSet].map((e) => {
    const [from, to] = e.split("→") as [string, string];
    return { from, to };
  });

  const changed = [...counts].filter(([, c]) => c.changedLines > 0).map(([id]) => id);
  const keep = new Set(changed);
  for (const e of edges) {
    if (keep.size >= maxModules) break;
    if (changed.includes(e.from)) keep.add(e.to);
    if (changed.includes(e.to)) keep.add(e.from);
  }
  const modules = [...keep]
    .map((id) => ({
      id,
      files: counts.get(id)?.files ?? 0,
      changed: (counts.get(id)?.changedLines ?? 0) > 0,
      changedLines: counts.get(id)?.changedLines ?? 0,
    }))
    .sort((a, b) => Number(b.changed) - Number(a.changed) || a.id.localeCompare(b.id))
    .slice(0, maxModules);
  const ids = new Set(modules.map((m) => m.id));
  return { modules, edges: edges.filter((e) => ids.has(e.from) && ids.has(e.to)) };
}
