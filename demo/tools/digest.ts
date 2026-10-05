/** Dev tool: build today's digest for every repo now. npx tsx --env-file=.env demo/tools/digest.ts */
import { closeDb } from "@lumi/db";
import { runMigrations } from "@lumi/db/migrate";
import { buildAllDigests, stopBoss } from "@lumi/pipeline";

await runMigrations();
const t0 = Date.now();
await buildAllDigests();
console.log(`digest built in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
await stopBoss();
await closeDb();
process.exit(0);
