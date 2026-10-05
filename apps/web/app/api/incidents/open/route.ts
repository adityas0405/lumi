import { getDb, incidents } from "@lumi/db";
import { desc, ne } from "drizzle-orm";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await currentUser())) return Response.json({ error: "unauthorized" }, { status: 401 });
  const rows = await getDb()
    .select()
    .from(incidents)
    .where(ne(incidents.status, "resolved"))
    .orderBy(desc(incidents.startedAt))
    .limit(3);
  return Response.json(
    rows
      .filter((r) => r.severity !== "sev3")
      .map((r) => ({
        id: r.id,
        title: r.title,
        severity: r.severity,
        status: r.status,
        startedAt: r.startedAt,
      })),
  );
}
