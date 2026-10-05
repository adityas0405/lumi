import { describe, expect, it } from "vitest";
import { toSpeech } from "../src/speech";

describe("toSpeech", () => {
  it("speaks operators and code punctuation", () => {
    expect(toSpeech("The guard now uses >= instead of >, so a == b fails.")).toBe(
      "The guard now uses greater than or equal to instead of greater than, so a equals b fails.",
    );
    expect(toSpeech("restore > semantics")).toBe("restore greater than semantics");
    expect(toSpeech("It was disabled with it.skip in PR #23.")).toBe(
      "It was disabled with it dot skip in P.R. number 23.",
    );
    expect(toSpeech("`refund()` && CI")).toBe("refund() and C.I.");
  });
});
