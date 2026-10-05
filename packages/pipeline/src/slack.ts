/**
 * Slack delivery via the Web API (chat.postMessage). Switched on by
 * SLACK_BOT_TOKEN; until then everything is available in the app.
 */
async function slack(
  method: string,
  body: object,
): Promise<{ ok: boolean; ts?: string; error?: string }> {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
      authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  return (await res.json()) as { ok: boolean; ts?: string; error?: string };
}

function appUrl(path: string): string {
  return `${(process.env.LUMI_PUBLIC_URL ?? "http://localhost:3000").replace(/\/$/, "")}${path}`;
}

export function digestBlocks(input: { digestId: string; repo: string; headline: string }) {
  return [
    {
      type: "section",
      text: { type: "mrkdwn", text: `*Lumi daily digest* · ${input.repo}\n${input.headline}` },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Watch the digest" },
          url: appUrl(`/digest/${input.digestId}`),
        },
      ],
    },
  ];
}

export async function postDigestToSlack(input: {
  digestId: string;
  repo: string;
  headline: string;
}): Promise<string | null> {
  const r = await slack("chat.postMessage", {
    channel: process.env.SLACK_CHANNEL ?? "#lumi",
    text: `Lumi daily digest: ${input.headline}`,
    blocks: digestBlocks(input),
    unfurl_links: false,
  });
  if (!r.ok) throw new Error(`Slack: ${r.error}`);
  return r.ts ?? null;
}

/** Incident alert with the actions the on-call engineer can take straight from Slack. */
export async function postIncidentToSlack(incidentId: string): Promise<string | null> {
  const { getDb, incidents, tasks } = await import("@lumi/db");
  const { eq } = await import("drizzle-orm");
  const { PERSONAS } = await import("@lumi/core");
  const db = getDb();
  const inc = await db.query.incidents.findFirst({ where: eq(incidents.id, incidentId) });
  if (!inc) return null;
  const suspect = inc.suspects[0];
  const task = suspect
    ? await db.query.tasks.findFirst({ where: eq(tasks.id, suspect.taskId) })
    : null;
  const likely = task
    ? `*Likely cause* (${suspect!.confidence} confidence): ${PERSONAS[task.agent].name}'s <${task.prUrl}|PR #${task.prNumber}> "${task.title}"\n${suspect!.reasons.map((r) => `• ${r}`).join("\n")}`
    : "*Likely cause:* no recent agent change matches.";
  const r = await slack("chat.postMessage", {
    channel: process.env.SLACK_CHANNEL ?? "#lumi",
    text: `${inc.severity.toUpperCase()}: ${inc.title}`,
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: `*${inc.severity.toUpperCase()}* · ${inc.title}` },
      },
      { type: "section", text: { type: "mrkdwn", text: likely } },
      {
        type: "actions",
        elements: [
          ...(task
            ? [
                {
                  type: "button",
                  style: "danger",
                  text: { type: "plain_text", text: "Roll back" },
                  action_id: "rollback",
                  value: incidentId,
                },
              ]
            : []),
          ...(task
            ? [
                {
                  type: "button",
                  text: { type: "plain_text", text: `Pause ${PERSONAS[task.agent].name}` },
                  action_id: "pause_agent",
                  value: `${incidentId}:${task.agent}`,
                },
              ]
            : []),
          {
            type: "button",
            text: { type: "plain_text", text: "Open in Lumi" },
            url: appUrl(`/incidents/${incidentId}`),
          },
        ],
      },
    ],
  });
  if (!r.ok) throw new Error(`Slack: ${r.error}`);
  return r.ts ?? null;
}
