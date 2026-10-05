/** Files that are machine-generated: shown in the file list, excluded from review size and narration. */
export function isGeneratedFile(path: string): boolean {
  const name = path.split("/").pop() ?? path;
  return (
    /^(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|Cargo\.lock|poetry\.lock|go\.sum|Gemfile\.lock|composer\.lock)$/.test(
      name,
    ) ||
    /(^|\/)(dist|build|vendor|node_modules|__generated__|\.next)\//.test(path) ||
    /\.(min\.(js|css)|map|snap)$/.test(name) ||
    /\.gen\.[a-z]+$/.test(name)
  );
}

export function isTestFile(path: string): boolean {
  return (
    /(^|\/)(__tests__|tests?)\//.test(path) ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(path) ||
    /(^|\/)test_[^/]+\.py$|_test\.(py|go)$/.test(path)
  );
}
