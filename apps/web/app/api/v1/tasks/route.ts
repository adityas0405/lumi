import { acceptSdkReport, SdkReport } from "@lumi/pipeline";
import { checkApiKey } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** `lumi.report(task, evidence)`: an agent hands a finished task to Lumi for review. */
export async function POST(req: Request) {
  if (!checkApiKey(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const parsed = SdkReport.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid report", issues: parsed.error.issues }, { status: 400 });
  }
  const { taskId, created, attachedTo } = await acceptSdkReport(parsed.data);
  const base = process.env.LUMI_PUBLIC_URL ?? "http://localhost:3000";
  return Response.json(
    { taskId, attachedTo, url: taskId ? `${base}/tasks/${taskId}` : undefined },
    { status: created ? 201 : 200 },
  );
}
