import { setDefaultResultOrder } from "node:dns";
import { resolve } from "node:path";
import { closeDb } from "@lumi/db";
import { runMigrations } from "@lumi/db/migrate";
import { log, startWorkers, stopBoss } from "@lumi/pipeline";

process.env.LUMI_ROOT ??= resolve(import.meta.dirname, "../../..");
// Prefer IPv4. On macOS, Node's built-in fetch can crash the process with
// "setTypeOfService EINVAL" on an IPv6 socket (seen during a demo reset, 1 Oct 2026).
setDefaultResultOrder("ipv4first");

await runMigrations();
await startWorkers();
log.info("Lumi worker ready");

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    if (stopping) return;
    stopping = true;
    log.info({ signal }, "shutting down");
    await stopBoss();
    await closeDb();
    process.exit(0);
  });
}
