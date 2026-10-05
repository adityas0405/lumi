/**
 * Secret redaction. Applied when evidence is created, so narration, video,
 * prompts and logs never see a secret value. Findings are kept (with the value
 * masked) because a leaked secret is itself a triage signal.
 */

export interface SecretFinding {
  kind: string;
  /** Masked preview, e.g. "ghp_…9f2a". Never the full value. */
  preview: string;
}

interface Pattern {
  kind: string;
  re: RegExp;
  /** Capture group holding the secret value; 0 = whole match. */
  group?: number;
}

const PATTERNS: Pattern[] = [
  {
    kind: "private-key",
    re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  },
  { kind: "aws-access-key", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { kind: "github-token", re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/g },
  { kind: "github-pat", re: /\bgithub_pat_[A-Za-z0-9_]{60,}\b/g },
  { kind: "slack-token", re: /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/g },
  { kind: "slack-webhook", re: /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/]+/g },
  { kind: "anthropic-key", re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
  { kind: "openai-key", re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/g },
  { kind: "stripe-key", re: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g },
  { kind: "google-api-key", re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { kind: "jwt", re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  {
    kind: "connection-string-password",
    re: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s:/@]+:([^\s@]{4,})@/g,
    group: 1,
  },
  {
    // key = "value" style assignments with secret-looking names and a long value.
    kind: "assigned-secret",
    re: /\b[A-Za-z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|API_?KEY|PRIVATE_?KEY|ACCESS_?KEY)[A-Za-z0-9_]*["']?\s*[:=]\s*["']([^"'\s]{12,})["']/gi,
    group: 1,
  },
];

export const REDACTED = "[redacted]";

function mask(value: string): string {
  if (value.length <= 8) return "…";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export function redact(text: string): { text: string; findings: SecretFinding[] } {
  const findings: SecretFinding[] = [];
  let out = text;
  for (const { kind, re, group = 0 } of PATTERNS) {
    out = out.replace(re, (...args: unknown[]) => {
      const match = args[0] as string;
      const value = (args[group] as string | undefined) ?? match;
      // Skip obvious placeholders so examples in docs don't trip the block rule.
      if (
        /^(x+|\*+|<[^>]+>|\$\{[^}]+\}|your[-_].*|changeme|example.*|placeholder.*)$/i.test(value)
      ) {
        return match;
      }
      findings.push({ kind, preview: mask(value) });
      return group === 0 ? REDACTED : match.replace(value, REDACTED);
    });
  }
  return { text: out, findings };
}

/** Files whose content Lumi never reads into evidence, whatever they contain. */
export function isSecretFile(path: string): boolean {
  const name = path.split("/").pop() ?? path;
  return (
    (/^\.env(\..*)?$/.test(name) && !/\.(example|sample|template)$/.test(name)) ||
    /\.(pem|key|p12|pfx|keystore|jks)$/i.test(name) ||
    /^id_(rsa|ed25519|ecdsa)$/.test(name)
  );
}

/**
 * Redacts a list of lines without changing how many there are, so diff line
 * numbers stay valid. Lines inside a private-key block are replaced wholesale.
 */
export function redactLines(lines: string[]): { lines: string[]; findings: SecretFinding[] } {
  const findings: SecretFinding[] = [];
  let inKey = false;
  const out = lines.map((line) => {
    if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(line)) {
      inKey = true;
      findings.push({ kind: "private-key", preview: "-----BEGIN…" });
    }
    if (inKey) {
      if (/-----END [A-Z ]*PRIVATE KEY-----/.test(line)) inKey = false;
      return REDACTED;
    }
    const r = redact(line);
    findings.push(...r.findings);
    return r.text;
  });
  return { lines: out, findings };
}
