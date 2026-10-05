/**
 * Creates the Lumi GitHub App with GitHub's manifest flow, then saves its
 * credentials to .env and github-app.pem.
 *
 *   pnpm setup:github-app               create the app (opens your browser)
 *   pnpm setup:github-app --webhook     point the existing app's webhook at LUMI_PUBLIC_URL
 *
 * You click "Create GitHub App" once on github.com, then install it on the demo repo.
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { App, Octokit } from "octokit";

const ROOT = resolve(import.meta.dirname, "..");
const ENV_PATH = resolve(ROOT, ".env");
const PORT = 3999;

function readEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(ENV_PATH, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*?)(\s+#.*)?$/.exec(line);
    if (m) out[m[1]!] = m[2]!.trim();
  }
  return out;
}

function writeEnv(updates: Record<string, string>): void {
  let text = readFileSync(ENV_PATH, "utf8");
  for (const [key, value] of Object.entries(updates)) {
    const re = new RegExp(`^${key}=.*$`, "m");
    text = re.test(text)
      ? text.replace(re, `${key}=${value}`)
      : `${text.trimEnd()}\n${key}=${value}\n`;
  }
  writeFileSync(ENV_PATH, text);
}

function publicUrl(env: Record<string, string>): string | null {
  const url = env.LUMI_PUBLIC_URL;
  return url && !url.includes("localhost") ? url.replace(/\/$/, "") : null;
}

async function updateWebhook(): Promise<void> {
  const env = readEnv();
  const url = publicUrl(env);
  if (!url) throw new Error("Set LUMI_PUBLIC_URL to your ngrok domain (https://…) in .env first.");
  const app = new App({
    appId: env.GITHUB_APP_ID!,
    privateKey: readFileSync(resolve(ROOT, env.GITHUB_APP_PRIVATE_KEY_PATH!), "utf8"),
  });
  // Webhook config belongs to the app itself, so authenticate with the app's JWT, not an installation.
  const { token } = (await app.octokit.auth({ type: "app" })) as { token: string };
  const octokit = new Octokit({ auth: token });
  // The body goes in `data`: a top-level `url` would be taken as the request URL.
  await octokit.request("PATCH /app/hook/config", {
    data: {
      url: `${url}/api/webhooks/github`,
      content_type: "json",
      secret: env.GITHUB_WEBHOOK_SECRET!,
      insecure_ssl: "0",
    },
  });
  console.log(`Webhook now points at ${url}/api/webhooks/github`);
}

async function createApp(): Promise<void> {
  const env = readEnv();
  const login = execFileSync("gh", ["api", "user", "--jq", ".login"], { encoding: "utf8" }).trim();
  const url = publicUrl(env);
  const state = randomBytes(16).toString("hex");
  const manifest = {
    name: `Lumi Review (${login})`.slice(0, 34),
    url: url ?? "https://github.com",
    description: "Lumi turns what coding agents did into evidence-backed video reviews.",
    hook_attributes: {
      // Placeholder until a public URL exists; `--webhook` repoints it later.
      url: `${url ?? "https://example.invalid"}/api/webhooks/github`,
      active: true,
    },
    redirect_url: `http://localhost:${PORT}/callback`,
    callback_urls: [
      "http://localhost:3000/api/auth/callback/github",
      ...(url ? [`${url}/api/auth/callback/github`] : []),
    ],
    public: false,
    default_permissions: {
      actions: "read",
      checks: "read",
      contents: "write",
      deployments: "read",
      issues: "write",
      metadata: "read",
      pull_requests: "write",
    },
    default_events: [
      "check_run",
      "check_suite",
      "deployment",
      "deployment_status",
      "pull_request",
      "pull_request_review",
      "push",
      "workflow_run",
    ],
  };

  const done = new Promise<void>((resolveDone, reject) => {
    const server = createServer(async (req, res) => {
      const reqUrl = new URL(req.url ?? "/", `http://localhost:${PORT}`);
      if (reqUrl.pathname === "/") {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<!doctype html><html><body style="font-family:system-ui;padding:48px">
<h2>Create the Lumi GitHub App</h2><p>You'll be taken to GitHub to confirm. Nothing is installed yet.</p>
<form action="https://github.com/settings/apps/new?state=${state}" method="post">
<input type="hidden" name="manifest" value='${JSON.stringify(manifest).replace(/'/g, "&#39;")}'>
<button style="font-size:16px;padding:10px 18px">Continue to GitHub</button></form>
<script>document.forms[0].submit()</script></body></html>`);
        return;
      }
      if (reqUrl.pathname === "/callback") {
        try {
          if (reqUrl.searchParams.get("state") !== state) throw new Error("State mismatch");
          const code = reqUrl.searchParams.get("code");
          if (!code) throw new Error("Missing code");
          const r = await fetch(`https://api.github.com/app-manifests/${code}/conversions`, {
            method: "POST",
            headers: { accept: "application/vnd.github+json" },
          });
          if (!r.ok) throw new Error(`Conversion failed: ${r.status} ${await r.text()}`);
          const app = (await r.json()) as {
            id: number;
            slug: string;
            pem: string;
            webhook_secret: string;
            client_id: string;
            client_secret: string;
            html_url: string;
          };
          writeFileSync(resolve(ROOT, "github-app.pem"), app.pem, { mode: 0o600 });
          writeEnv({
            GITHUB_APP_ID: String(app.id),
            GITHUB_APP_SLUG: app.slug,
            GITHUB_APP_PRIVATE_KEY_PATH: "./github-app.pem",
            GITHUB_WEBHOOK_SECRET: app.webhook_secret,
            GITHUB_CLIENT_ID: app.client_id,
            GITHUB_CLIENT_SECRET: app.client_secret,
          });
          const install = `https://github.com/apps/${app.slug}/installations/new`;
          res.writeHead(302, { location: install });
          res.end();
          console.log(
            `\n✓ Created ${app.html_url}\n  Credentials saved to .env and github-app.pem`,
          );
          console.log(
            `  Next: install it on ${env.LUMI_DEMO_REPO ?? "the demo repo"} (browser opened): ${install}\n`,
          );
          server.close();
          resolveDone();
        } catch (err) {
          res.writeHead(500, { "content-type": "text/plain" });
          res.end(String(err));
          server.close();
          reject(err);
        }
        return;
      }
      res.writeHead(404);
      res.end();
    });
    server.listen(PORT, () => {
      console.log(`Opening http://localhost:${PORT} …`);
      execFileSync("open", [`http://localhost:${PORT}`]);
    });
  });
  await done;
}

if (process.argv.includes("--webhook")) await updateWebhook();
else await createApp();
