import { redirect } from "next/navigation";
import { GenerateDigest } from "@/components/digest/GenerateDigest";
import { Header } from "@/components/Header";
import { LiveRefresh } from "@/components/LiveRefresh";
import { latestDigestId } from "@/lib/digests";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function DigestIndex() {
  const user = await requireUser();
  const id = await latestDigestId();
  if (id) redirect(`/digest/${id}`);
  return (
    <>
      <Header user={user} active="digest" />
      <LiveRefresh />
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-8">
        <div className="kicker">Daily digest</div>
        <h1 className="mt-3 font-semibold text-[22px] leading-tight">No digest yet.</h1>
        <p className="mt-3 text-stone">Lumi builds one every morning. You can build today's now.</p>
        <div className="mt-8">
          <GenerateDigest />
        </div>
      </main>
    </>
  );
}
