import { describe, expect, it } from "vitest";
import { Lumi, LumiError } from "../src/index";

function fakeFetch(status: number, body: unknown, seen: { url?: string; init?: RequestInit }) {
  return (async (url: string, init?: RequestInit) => {
    seen.url = url;
    seen.init = init;
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
}

describe("Lumi.report", () => {
  it("posts the task with a bearer key", async () => {
    const seen: { url?: string; init?: RequestInit } = {};
    const lumi = new Lumi({
      baseUrl: "https://lumi.test/",
      apiKey: "k",
      fetch: fakeFetch(201, { taskId: "t1" }, seen),
    });
    const r = await lumi.report({
      task: { id: "1", title: "t", agent: "claude-code", repo: "a/b" },
    });
    expect(r.taskId).toBe("t1");
    expect(seen.url).toBe("https://lumi.test/api/v1/tasks");
    expect((seen.init!.headers as Record<string, string>).authorization).toBe("Bearer k");
    expect(JSON.parse(seen.init!.body as string).evidence).toEqual([]);
  });

  it("raises LumiError with the server's reasons", async () => {
    const lumi = new Lumi({
      baseUrl: "https://lumi.test",
      apiKey: "k",
      fetch: fakeFetch(400, { error: "invalid report" }, {}),
    });
    await expect(
      lumi.report({ task: { id: "1", title: "t", agent: "x", repo: "bad" } }),
    ).rejects.toBeInstanceOf(LumiError);
  });
});
