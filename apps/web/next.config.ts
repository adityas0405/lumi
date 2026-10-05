import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { NextConfig } from "next";

// One .env at the repo root serves the web app, the worker and the scripts.
const rootEnv = resolve(import.meta.dirname, "../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);
process.env.LUMI_ROOT ??= resolve(import.meta.dirname, "../..");

const config: NextConfig = {
  transpilePackages: ["@lumi/ai", "@lumi/core", "@lumi/db", "@lumi/github", "@lumi/pipeline"],
  serverExternalPackages: [
    "pg",
    "pg-boss",
    "pino",
    "pino-pretty",
    "@remotion/renderer",
    "@remotion/bundler",
    "playwright",
    "shiki",
  ],
  typedRoutes: true,
};

export default config;
