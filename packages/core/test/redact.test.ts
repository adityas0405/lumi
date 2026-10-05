import { describe, expect, it } from "vitest";
import { isSecretFile, REDACTED, redact, redactLines } from "../src/redact";

// Assembled at runtime so no literal secret-shaped strings sit in the source.
const gh = `ghp_${"a1B2c3D4e5".repeat(4)}`;
const aws = `AKIA${"ABCDEFGH12345678"}`;
const slack = `xoxb-${"1234567890"}-abcdefghij`;

describe("redact", () => {
  it("removes common token formats and reports masked findings", () => {
    const { text, findings } = redact(`token=${gh}\naws ${aws}\nslack ${slack}`);
    expect(text).not.toContain(gh);
    expect(text).not.toContain(aws);
    expect(text).not.toContain(slack);
    expect(findings.map((f) => f.kind).sort()).toEqual([
      "aws-access-key",
      "github-token",
      "slack-token",
    ]);
    expect(findings.every((f) => f.preview.includes("…"))).toBe(true);
  });

  it("redacts only the value of secret-named assignments", () => {
    const { text } = redact(`const STRIPE_API_KEY = "live_${"x9".repeat(10)}";`);
    expect(text).toBe(`const STRIPE_API_KEY = "${REDACTED}";`);
  });

  it("redacts passwords in connection strings", () => {
    const { text } = redact("DATABASE_URL=postgres://app:s3cretpass@db:5432/app");
    expect(text).toBe(`DATABASE_URL=postgres://app:${REDACTED}@db:5432/app`);
  });

  it("leaves placeholders and normal code alone", () => {
    const src = 'const API_KEY = "your-api-key-here";\nconst total = cents * rate;';
    expect(redact(src)).toEqual({ text: src, findings: [] });
  });

  it("flags secret files", () => {
    expect(isSecretFile(".env")).toBe(true);
    expect(isSecretFile("config/.env.production")).toBe(true);
    expect(isSecretFile(".env.example")).toBe(false);
    expect(isSecretFile("certs/server.pem")).toBe(true);
    expect(isSecretFile("src/env.ts")).toBe(false);
  });
});

describe("redactLines", () => {
  it("keeps the line count and blanks private-key blocks", () => {
    const input = [
      "const a = 1;",
      "-----BEGIN RSA PRIVATE KEY-----",
      "MIIEow",
      "-----END RSA PRIVATE KEY-----",
      `t = "${gh}"`,
    ];
    const { lines, findings } = redactLines(input);
    expect(lines).toHaveLength(5);
    expect(lines.slice(1, 4)).toEqual([REDACTED, REDACTED, REDACTED]);
    expect(lines[4]).not.toContain(gh);
    expect(findings.map((f) => f.kind)).toEqual(["private-key", "github-token"]);
  });
});
