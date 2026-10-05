import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildDigestScript, type DigestTaskBrief } from "@lumi/ai";
import {
  type DigestSection,
  digestHeadline,
  digestNarration,
  PERSONAS,
  type TaskScript,
  toWebVtt,
} from "@lumi/core";
import {
  dataDir,
  decisions,
  digests,
  ensureDir,
  evidence,
  getDb,
  outcomes,
  type RepoSettings,
  renders,
  repos,
  scripts,
  tasks,
  triageResults,
} from "@lumi/db";
import { renderDigestVideo } from "@lumi/video";
import { buildVoiceover } from "@lumi/voice";
import { and, desc, eq, inArray } from "drizzle-orm";
import { publish } from "./events";
import { log } from "./log";
import { assets } from "./review";
import { DEFAULT_SETTINGS, expiryDate } from "./store";

const MAX_HIGHLIGHTS = 2;
const MAX_ITEMS = 4;
const MAX_WINDOW_DAYS = 7;

interface Picked {
  taskId: string;
  section: DigestSection;
  task: typeof tasks.$inferSelect;
  script: TaskScript | null;
  route: string | null;
  defects: string[];
  decidedAs: string | null;
  durationMs: number | null;
  request: DigestTaskBrief["request"];
}

/**
 * Chooses what the digest covers. Everything still waiting on the reviewer is
 * included however old it is; finished work only from the digest window.
 */
async function pick(repoId: string, since: Date, repoSettings: RepoSettings): Promise<Picked[]> {
  const db = getDb();
  const rows = await db.select().from(tasks).where(eq(tasks.repoId, repoId));
  const ids = rows.map((t) => t.id);
  if (!ids.length) return [];
  const [tri, dec, scr, outc, rend, req] = await Promise.all([
    db
      .select()
      .from(triageResults)
      .where(inArray(triageResults.taskId, ids))
      .orderBy(desc(triageResults.createdAt)),
    db
      .select()
      .from(decisions)
      .where(inArray(decisions.taskId, ids))
      .orderBy(desc(decisions.createdAt)),
    db
      .select()
      .from(scripts)
      .where(and(inArray(scripts.subjectId, ids), eq(scripts.subjectType, "task")))
      .orderBy(desc(scripts.version)),
    db.select().from(outcomes).where(inArray(outcomes.taskId, ids)),
    db
      .select()
      .from(renders)
      .where(and(inArray(renders.subjectId, ids), eq(renders.status, "ready")))
      .orderBy(desc(renders.createdAt)),
    db
      .select({ taskId: evidence.taskId, ref: evidence.ref, payload: evidence.payload })
      .from(evidence)
      .where(and(inArray(evidence.taskId, ids), eq(evidence.kind, "task")))
      .orderBy(evidence.ref),
  ]);
  const firstBy = <T>(list: T[], key: (t: T) => string) => {
    const m = new Map<string, T>();
    for (const x of list) if (!m.has(key(x))) m.set(key(x), x);
    return m;
  };
  const triBy = firstBy(tri, (t) => t.taskId);
  const decBy = firstBy(dec, (d) => d.taskId);
  const scrBy = firstBy(scr, (s) => s.subjectId);
  const rendBy = firstBy(rend, (r) => r.subjectId);
  const reqBy = firstBy(req, (r) => r.taskId);
  const requestOf = (taskId: string): DigestTaskBrief["request"] => {
    const r = reqBy.get(taskId);
    if (r?.payload.kind !== "task") return null;
    return {
      ref: r.ref,
      number: Number(r.ref.slice("task:".length)),
      title: r.payload.title,
      excerpt: r.payload.body.replace(/\s+/g, " ").trim().slice(0, 300),
      requestedBy: r.payload.requestedBy ?? null,
      requestedByName: r.payload.requestedByName ?? null,
    };
  };

  const picked: Picked[] = [];
  const done: Picked[] = [];
  for (const task of rows) {
    if (!["ready", "decided"].includes(task.status)) continue;
    // A rollback isn't news on its own; it shows on the change it reverted.
    if (task.revertOf) continue;
    const t = triBy.get(task.id);
    const d = decBy.get(task.id);
    const mine = outc.filter((o) => o.taskId === task.id);
    const kinds = mine.map((o) => o.kind);
    const open = task.prState === "open";
    // Stalled agent work is worth the owner's attention: changes were asked for and nothing came back.
    const heldOnAgent =
      open &&
      d?.kind === "request_changes" &&
      mine.some((o) => o.kind === "held_up" && o.ref === "agent");
    const base = {
      taskId: task.id,
      task,
      script: (scrBy.get(task.id)?.body as TaskScript) ?? null,
      route: t?.route ?? null,
      defects: (t?.suspectedDefects ?? [])
        .filter((x) => x.severity !== "low")
        .map((x) => x.summary),
      decidedAs: d
        ? decidedLabel(d, {
            overBlock: !open && t?.route === "block",
            heldUpDays: heldOnAgent ? (repoSettings.heldUpDays ?? 3) : null,
          })
        : null,
      durationMs: rendBy.get(task.id)?.durationMs ?? null,
      request: requestOf(task.id),
    };
    // Shipped over a triage block: the rubber-stamping Lumi exists to catch.
    const shippedDespiteBlock = !open && t?.route === "block" && d?.kind === "approve";
    const problem =
      kinds.includes("incident_linked") ||
      kinds.includes("reverted") ||
      d?.kind === "reject" ||
      (open && !d && t?.route === "block") ||
      shippedDespiteBlock ||
      heldOnAgent;
    if (problem) picked.push({ ...base, section: "problems" });
    else if (open && !d) picked.push({ ...base, section: "decisions" });
    else if ((task.mergedAt ?? d?.createdAt ?? task.occurredAt) >= since)
      done.push({ ...base, section: "highlights" });
  }
  // Notable finished work leads; routine changes go in one line.
  done.sort((a, b) => Number(b.route === "needs_human") - Number(a.route === "needs_human"));
  // Keep the digest within 60–90 seconds: at most four spoken items in total.
  const highlightSlots = Math.max(0, Math.min(MAX_HIGHLIGHTS, MAX_ITEMS - picked.length));
  done.forEach((p, i) => {
    picked.push({
      ...p,
      section: i < highlightSlots && p.route !== "auto_pass" ? "highlights" : "routine",
    });
  });
  return picked;
}

/** How a decided task reads in the digest brief, e.g. "Changes requested by @ada". */
function decidedLabel(
  d: { kind: string; decidedBy: string },
  opts: { overBlock: boolean; heldUpDays: number | null },
): string {
  const verb =
    d.kind === "approve" ? "Approved" : d.kind === "reject" ? "Rejected" : "Changes requested";
  let label = `${verb} by @${d.decidedBy}`;
  if (opts.overBlock && d.kind === "approve") label += ", though Lumi had blocked it";
  if (opts.heldUpDays !== null)
    label += `; the agent hasn't pushed anything in ${opts.heldUpDays} days since`;
  return label;
}

function brief(p: Picked): DigestTaskBrief {
  return {
    taskId: p.taskId,
    section: p.section,
    agent: PERSONAS[p.task.agent].name,
    prNumber: p.task.prNumber,
    title: p.task.title,
    headline: p.script?.headline ?? p.task.title,
    summaryTechnical: p.script?.summary.technical ?? "",
    summaryPlain: p.script?.summary.plain ?? "",
    businessImpact: p.script?.businessImpact ?? "",
    recommendation: p.script?.decision.recommendation ?? "needs_discussion",
    recommendationReason: p.script?.decision.reason ?? "",
    defects: p.defects,
    decidedAs: p.decidedAs,
    request: p.request,
  };
}

/** The small line above an item's headline in the video: who asked, and for what. */
function requestLabel(r: DigestTaskBrief["request"]): string {
  if (!r) return "No linked request";
  return `${r.requestedBy ? `Asked by @${r.requestedBy} · ` : ""}Issue #${r.number}, ${r.title}`;
}

/** Builds, voices and renders one repo's daily digest. */
export async function buildDigest(input: {
  repoId: string;
  now?: Date;
}): Promise<{ digestId: string; durationMs: number }> {
  const db = getDb();
  const repo = await db.query.repos.findFirst({ where: eq(repos.id, input.repoId) });
  if (!repo) throw new Error(`Repo ${input.repoId} not found`);
  const now = input.now ?? new Date();
  const previous = await db.query.digests.findFirst({
    where: eq(digests.repoId, repo.id),
    orderBy: desc(digests.createdAt),
  });
  const floor = new Date(now.getTime() - MAX_WINDOW_DAYS * 86_400_000);
  const since = previous && previous.createdAt > floor ? previous.createdAt : floor;

  const picked = await pick(repo.id, since, repo.settings ?? DEFAULT_SETTINGS);
  const counts = {
    decisions: picked.filter((p) => p.section === "decisions").length,
    problems: picked.filter((p) => p.section === "problems").length,
    done: picked.filter((p) => p.section === "highlights" || p.section === "routine").length,
  };
  const dateLabel = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const quiet = counts.decisions + counts.problems === 0;
  const intro = quiet
    ? {
        technical: `Nothing needs you today. Your agents finished ${counts.done} task${counts.done === 1 ? "" : "s"}.`,
        plain: `Nothing needs you today. Your agents finished ${counts.done} task${counts.done === 1 ? "" : "s"}.`,
      }
    : (() => {
        const line = `Today: ${digestHeadline(counts)}.`;
        return { technical: line, plain: line };
      })();

  const { script, issues, attempts } = await buildDigestScript({
    dateLabel,
    tasks: picked.map(brief),
  });
  const narration = digestNarration(
    script,
    intro,
    new Map(picked.flatMap((p) => (p.request ? [[p.taskId, p.request.ref] as const] : []))),
  );
  // Every task in the digest, routine included, so the page can list them under their requests.
  const taskList = picked.map((p) => ({
    taskId: p.taskId,
    section: p.section,
    agent: p.task.agent,
    prNumber: p.task.prNumber,
    title: p.task.title,
    request: p.request
      ? {
          ref: p.request.ref,
          number: p.request.number,
          title: p.request.title,
          requestedBy: p.request.requestedBy,
        }
      : null,
  }));

  const [digest] = await db
    .insert(digests)
    .values({ repoId: repo.id, day: now.toISOString().slice(0, 10), counts })
    .returning({ id: digests.id });
  const digestId = digest!.id;
  await db.insert(scripts).values({
    subjectType: "digest",
    subjectId: digestId,
    body: { script, narration, counts, dateLabel, tasks: taskList },
    validation: { ok: issues.length === 0, issues },
    attempts,
    model: "digest",
  });
  const expiresAt = expiryDate(repo.settings ?? DEFAULT_SETTINGS);
  const [render] = await db
    .insert(renders)
    .values({ subjectType: "digest", subjectId: digestId, status: "voicing", expiresAt })
    .returning({ id: renders.id });
  const outDir = ensureDir(dataDir("renders", "digests", digestId));

  try {
    const voice = await buildVoiceover(narration, "unknown", outDir);
    const server = await assets();
    const result = await renderDigestVideo(
      {
        timeline: voice.timeline,
        audioSrc: server.url(voice.audioPath),
        meta: { dateLabel, repo: repo.fullName, counts },
        items: picked
          .filter((p) => p.section !== "routine")
          .map((p) => ({
            taskId: p.taskId,
            section: p.section as "decisions" | "problems" | "highlights",
            agentName: PERSONAS[p.task.agent].name,
            agentColor: PERSONAS[p.task.agent].color,
            prNumber: p.task.prNumber,
            headline: p.script?.headline ?? p.task.title,
            recommendation:
              p.decidedAs ??
              `Lumi recommends ${(p.script?.decision.recommendation ?? "needs_discussion").replace("_", " ")}`,
            reviewDurationMs: p.durationMs,
            request: { label: requestLabel(p.request), linked: p.request !== null },
          })),
        routine: picked
          .filter((p) => p.section === "routine")
          .map((p) => ({ agentName: PERSONAS[p.task.agent].name, title: p.task.title })),
      },
      outDir,
    );
    const vtt = toWebVtt(voice.timeline, () => "Lumi");
    writeFileSync(join(outDir, "captions.vtt"), vtt);
    await db
      .update(renders)
      .set({
        status: "ready",
        progress: 1,
        videoPath: result.videoPath,
        posterPath: result.posterPath,
        timeline: voice.timeline,
        captionsVtt: vtt,
        durationMs: result.durationMs,
      })
      .where(eq(renders.id, render!.id));
    await publish({ type: "digest.ready", digestId });
    log.info(
      {
        digestId,
        repo: repo.fullName,
        counts,
        seconds: result.durationMs / 1000,
        issues: issues.length,
      },
      "digest ready",
    );
    await deliverDigest(digestId, repo.fullName, digestHeadline(counts));
    return { digestId, durationMs: result.durationMs };
  } catch (err) {
    await db
      .update(renders)
      .set({ status: "failed", error: String(err).slice(0, 2000) })
      .where(eq(renders.id, render!.id));
    throw err;
  }
}

/** Posts the digest link to Slack once a bot token is configured; otherwise it lives in the app. */
async function deliverDigest(digestId: string, repo: string, headline: string): Promise<void> {
  if (!process.env.SLACK_BOT_TOKEN) {
    log.info({ digestId }, "Slack not configured; digest available in the app at /digest");
    return;
  }
  const { postDigestToSlack } = await import("./slack");
  await postDigestToSlack({ digestId, repo, headline });
}

export async function buildAllDigests(now?: Date): Promise<void> {
  const all = await getDb().select({ id: repos.id }).from(repos);
  for (const r of all) await buildDigest({ repoId: r.id, now });
}
