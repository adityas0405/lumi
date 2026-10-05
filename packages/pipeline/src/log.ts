import pino from "pino";

/** Structured logger. Secret-bearing fields are redacted as a second line of defence. */
export const log = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "*.token",
      "*.authorization",
      "*.password",
      "*.secret",
      "*.privateKey",
      "headers.authorization",
    ],
    censor: "[redacted]",
  },
  transport: process.stdout.isTTY
    ? { target: "pino-pretty", options: { colorize: true } }
    : undefined,
});
