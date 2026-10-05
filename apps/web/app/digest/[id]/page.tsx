import { notFound } from "next/navigation";
import { DigestPlayer } from "@/components/digest/DigestPlayer";
import { GenerateDigest } from "@/components/digest/GenerateDigest";
import { Header } from "@/components/Header";
import { getDigest } from "@/lib/digests";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function DigestPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const digest = await getDigest(id);
  if (!digest) notFound();
  return (
    <>
      <Header user={user} active="digest" />
      <DigestPlayer digest={digest} />
      <div className="mx-auto max-w-5xl px-4 pb-16 sm:px-8">
        <GenerateDigest quiet />
      </div>
    </>
  );
}
