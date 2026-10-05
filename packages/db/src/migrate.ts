import { fileURLToPath } from "node:url";
import { PERSONAS } from "@lumi/core";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { agents, closeDb, getDb } from "./index";

/** Applies migrations and upserts the built-in agent personas. */
export async function runMigrations(): Promise<void> {
  const db = getDb();
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
  for (const p of Object.values(PERSONAS)) {
    await db
      .insert(agents)
      .values({ key: p.key, name: p.name, color: p.color, modelFamily: p.modelFamily })
      .onConflictDoUpdate({
        target: agents.key,
        set: {
          name: sql`excluded.name`,
          color: sql`excluded.color`,
          modelFamily: sql`excluded.model_family`,
        },
      });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(() => console.log("migrations applied"))
    .finally(closeDb);
}
