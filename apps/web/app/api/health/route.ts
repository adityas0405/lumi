import { getPool } from "@lumi/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await getPool().query("select 1");
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ ok: false, error: String(err) }, { status: 503 });
  }
}
