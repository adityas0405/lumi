import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { App, type Octokit } from "octokit";

let app: App | null = null;

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set. Run \`pnpm setup:github-app\` first.`);
  return v;
}

export function githubAppConfigured(): boolean {
  return Boolean(process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY_PATH);
}

export function getApp(): App {
  if (app) return app;
  const keyPath = resolve(
    process.env.LUMI_ROOT ?? process.cwd(),
    required("GITHUB_APP_PRIVATE_KEY_PATH"),
  );
  app = new App({
    appId: required("GITHUB_APP_ID"),
    privateKey: readFileSync(keyPath, "utf8"),
    webhooks: { secret: process.env.GITHUB_WEBHOOK_SECRET ?? "unset" },
    oauth: {
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
    },
  });
  return app;
}

const installationCache = new Map<string, number>();

/** Octokit authenticated as the Lumi app's installation on a repo. */
export async function repoOctokit(
  fullName: string,
  installationId?: number | null,
): Promise<{ octokit: Octokit; installationId: number }> {
  const a = getApp();
  let id = installationId ?? installationCache.get(fullName);
  if (!id) {
    const [owner, repo] = fullName.split("/") as [string, string];
    const { data } = await a.octokit.request("GET /repos/{owner}/{repo}/installation", {
      owner,
      repo,
    });
    id = data.id;
  }
  installationCache.set(fullName, id);
  return { octokit: await a.getInstallationOctokit(id), installationId: id };
}

export function splitRepo(fullName: string): { owner: string; repo: string } {
  const [owner, repo] = fullName.split("/");
  if (!owner || !repo) throw new Error(`Bad repo name: ${fullName}`);
  return { owner, repo };
}
