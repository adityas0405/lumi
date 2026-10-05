import { describe, expect, it } from "vitest";
import { correlate, fromDatadog, fromSentry, type IncidentInput } from "../src/incident";

const now = new Date("2026-09-29T15:00:00Z");
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);

const deploys = [
  { id: "d1", sha: "a", deployedAt: minutesAgo(60 * 30), taskIds: ["old"] },
  { id: "d2", sha: "b", deployedAt: minutesAgo(60 * 20), taskIds: ["cta", "datefns"] },
  { id: "d3", sha: "c", deployedAt: minutesAgo(12), taskIds: ["zones"] },
];
const tasks = [
  {
    id: "zones",
    title: "Zone-based express shipping",
    agent: "cursor",
    route: "block" as const,
    changes: [
      { path: "src/checkout/shipping.ts", start: 7, end: 32 },
      { path: "src/checkout/totals.ts", start: 20, end: 20 },
    ],
  },
  {
    id: "cta",
    title: "Checkout button",
    agent: "cursor",
    route: "needs_human" as const,
    changes: [{ path: "src/ui/CartSummary.tsx", start: 60, end: 75 }],
  },
];

const sentryBody = {
  data: {
    event: {
      title: "TypeError: Cannot read properties of undefined (reading 'zone')",
      environment: "production",
      datetime: now.toISOString(),
      tags: [
        ["region", "NY"],
        ["service", "checkout-web"],
      ],
      exception: {
        values: [
          {
            stacktrace: {
              frames: [
                {
                  filename: "node_modules/react-dom/index.js",
                  lineno: 1,
                  function: "render",
                  in_app: false,
                },
                {
                  filename: "./src/checkout/totals.ts",
                  lineno: 20,
                  function: "computeTotals",
                  in_app: true,
                },
                {
                  filename: "./src/checkout/shipping.ts",
                  lineno: 18,
                  function: "zoneFor",
                  in_app: true,
                },
              ],
            },
          },
        ],
      },
    },
  },
  lumi: { events: 1240, users: 380, windowMinutes: 5, baselineEvents: 3 },
};

describe("fromSentry", () => {
  it("normalizes the event, innermost in-app frame first", () => {
    const i = fromSentry(sentryBody);
    expect(i.frames[0]).toEqual({ file: "./src/checkout/shipping.ts", line: 18, fn: "zoneFor" });
    expect(i.frames).toHaveLength(2);
    expect(i.severity).toBe("sev1");
    expect(i.service).toBe("checkout-web");
    expect(i.tags.region).toBe("NY");
  });
});

describe("correlate", () => {
  const incident: IncidentInput = fromSentry(sentryBody);

  it("blames the change whose changed lines are in the stack trace, from the latest deploy", () => {
    const c = correlate(incident, deploys, tasks);
    expect(c.deploy?.id).toBe("d3");
    expect(c.minutesSinceDeploy).toBe(12);
    expect(c.suspects[0]).toMatchObject({ taskId: "zones", confidence: "high" });
    expect(c.suspects[0]!.reasons.join(" ")).toContain("src/checkout/shipping.ts:18 in zoneFor");
    expect(c.suspects[0]!.reasons.join(" ")).toContain("triage had blocked");
  });

  it("finds nothing when no deploy precedes the spike within the window", () => {
    const early = { ...incident, startedAt: minutesAgo(60 * 40).toISOString() };
    expect(correlate(early, deploys, tasks).suspects).toEqual([]);
  });

  it("falls back to low confidence without stack frames", () => {
    const noFrames = { ...incident, frames: [] };
    const c = correlate(noFrames, deploys, tasks);
    expect(c.suspects[0]).toMatchObject({ taskId: "zones", confidence: "low" });
  });
});

describe("fromDatadog", () => {
  it("maps priority to severity and parses tags", () => {
    const i = fromDatadog({
      title: "Error rate high on checkout",
      priority: "P1",
      tags: "service:checkout-web,env:production",
      date: now.getTime(),
    });
    expect(i).toMatchObject({
      severity: "sev1",
      service: "checkout-web",
      environment: "production",
      frames: [],
    });
  });
});
