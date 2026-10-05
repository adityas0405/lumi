import { getPool } from "@lumi/db";
import { EVENTS_CHANNEL } from "@lumi/pipeline";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Server-sent events relayed from Postgres NOTIFY: live task progress and new incidents. */
export async function GET(req: Request) {
  if (!(await currentUser())) return new Response("unauthorized", { status: 401 });
  const client = await getPool().connect();
  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: string) => {
        if (!closed) controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      };
      client.on("notification", (msg) => msg.payload && send(msg.payload));
      await client.query(`LISTEN ${EVENTS_CHANNEL}`);
      send(JSON.stringify({ type: "hello" }));
      const ping = setInterval(
        () => !closed && controller.enqueue(encoder.encode(": ping\n\n")),
        20_000,
      );
      req.signal.addEventListener("abort", async () => {
        closed = true;
        clearInterval(ping);
        await client.query(`UNLISTEN ${EVENTS_CHANNEL}`).catch(() => undefined);
        client.release();
        controller.close();
      });
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
