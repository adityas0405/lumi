import { nextVisit, sinceLastVisit } from "@lumi/core";
import { getDb, userVisits } from "@lumi/db";
import { eq } from "drizzle-orm";

/**
 * Records a page view and returns where "since your last visit" starts for this person.
 * Called by server pages; a gap of over 30 minutes starts a new visit.
 */
export async function touchVisit(
  login: string,
  now = new Date(),
): Promise<{ since: Date; firstVisit: boolean }> {
  const db = getDb();
  const row = await db.query.userVisits.findFirst({ where: eq(userVisits.login, login) });
  const next = nextVisit(row ?? null, now);
  await db
    .insert(userVisits)
    .values({ login, ...next })
    .onConflictDoUpdate({ target: userVisits.login, set: next });
  return { since: sinceLastVisit(next, now), firstVisit: next.previousVisitAt === null };
}
