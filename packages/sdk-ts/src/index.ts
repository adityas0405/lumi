/**
 * Lumi SDK: hand finished agent work to Lumi for human review.
 *
 *   const lumi = new Lumi({ baseUrl: "https://lumi.example.com", apiKey: process.env.LUMI_API_KEY! });
 *   await lumi.report({
 *     task: { id: "run-42", title: "Fix refund rounding", agent: "claude-code", repo: "acme/checkout", pullRequest: 24 },
 *     evidence: [{ kind: "decision", title: "Rounding mode", chosen: "Half-even", alternatives: ["Half-up"], rationale: "Matches the processor" }],
 *   });
 */

export type Evidence =
  | { kind: "diff"; file: string; patch: string; status?: "added" | "modified" | "removed" }
  | {
      kind: "test";
      name: string;
      status: "passed" | "failed" | "skipped";
      suite?: string;
      message?: string;
    }
  | {
      kind: "ci";
      name: string;
      conclusion:
        | "success"
        | "failure"
        | "neutral"
        | "cancelled"
        | "skipped"
        | "timed_out"
        | "pending";
      url?: string;
      summary?: string;
    }
  | { kind: "log"; source: string; text: string }
  | { kind: "decision"; title: string; chosen: string; alternatives?: string[]; rationale: string }
  | { kind: "artifact"; type: "video" | "image" | "link"; url: string; label: string };

export interface TaskInput {
  /** Your stable id for this piece of work (idempotent: reporting again updates it). */
  id: string;
  title: string;
  /** "claude-code", "cursor", "devin", or your agent's name. */
  agent: string;
  /** "owner/name". */
  repo: string;
  /** What the agent says it did. Lumi treats this as a claim to verify, not as fact. */
  description?: string;
  url?: string;
  branch?: string;
  occurredAt?: string;
  /** Attach this evidence to an existing pull request's review. */
  pullRequest?: number;
}

export interface ReportResult {
  taskId: string | null;
  url?: string;
}

export class LumiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "LumiError";
  }
}

export class Lumi {
  private readonly baseUrl: string;

  constructor(
    private readonly opts: {
      baseUrl: string;
      apiKey: string;
      fetch?: typeof fetch;
      timeoutMs?: number;
    },
  ) {
    if (!opts.apiKey) throw new Error("Lumi: apiKey is required");
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
  }

  /** Sends finished work (or extra evidence for a pull request) for review. */
  async report(input: { task: TaskInput; evidence?: Evidence[] }): Promise<ReportResult> {
    const f = this.opts.fetch ?? fetch;
    const res = await f(`${this.baseUrl}/api/v1/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.opts.apiKey}` },
      body: JSON.stringify({ task: input.task, evidence: input.evidence ?? [] }),
      signal: AbortSignal.timeout(this.opts.timeoutMs ?? 30_000),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new LumiError(`Lumi rejected the report (${res.status})`, res.status, body);
    return body as ReportResult;
  }
}
