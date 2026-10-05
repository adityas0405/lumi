import type { TestCaseResult } from "@lumi/core";
import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  isArray: (name) => name === "testsuite" || name === "testcase",
});

interface RawCase {
  name: string;
  classname?: string;
  time?: string;
  skipped?: unknown;
  failure?: { message?: string; "#text"?: string } | string;
  error?: { message?: string; "#text"?: string } | string;
}

function message(v: RawCase["failure"]): string | null {
  if (v === undefined) return null;
  if (typeof v === "string") return v.trim().slice(0, 2000) || null;
  return (v.message ?? v["#text"] ?? "").trim().slice(0, 2000) || null;
}

/** Parses JUnit XML (Vitest, Jest, pytest) into test case results. */
export function parseJunit(xml: string): TestCaseResult[] {
  const doc = parser.parse(xml) as {
    testsuites?: { testsuite?: { name?: string; testcase?: RawCase[] }[] };
    testsuite?: { name?: string; testcase?: RawCase[] }[];
  };
  const suites = doc.testsuites?.testsuite ?? doc.testsuite ?? [];
  const out: TestCaseResult[] = [];
  for (const suite of suites) {
    for (const c of suite.testcase ?? []) {
      const failure = message(c.failure) ?? message(c.error);
      out.push({
        name: String(c.name),
        suite: c.classname ?? suite.name ?? null,
        status:
          failure !== null || c.failure !== undefined || c.error !== undefined
            ? "failed"
            : c.skipped !== undefined
              ? "skipped"
              : "passed",
        durationMs: c.time ? Math.round(Number(c.time) * 1000) : null,
        message: failure,
      });
    }
  }
  return out;
}
