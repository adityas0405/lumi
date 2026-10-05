import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  "not-allowed": "That GitHub account isn't on this workspace's list.",
  state: "Sign-in expired. Try again.",
  token: "GitHub didn't complete sign-in. Try again.",
  user: "Couldn't read your GitHub profile.",
};

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await currentUser()) redirect("/");
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <div className="kicker">Lumi</div>
      <h1 className="mt-4 font-semibold text-[22px] leading-tight">Review what your agents did.</h1>
      <p className="mt-4 text-stone">
        Sign in with the GitHub account that owns the repositories your agents work in.
      </p>
      {error && (
        <p className="mt-6 border-l border-oxide pl-3 text-sm text-oxide">
          {ERRORS[error] ?? "Sign-in failed."}
        </p>
      )}
      <a
        href="/api/auth/github"
        className="mt-8 inline-flex w-fit items-center border border-text px-5 py-2.5 text-sm font-medium hover:bg-text hover:text-bg"
      >
        Sign in with GitHub
      </a>
    </main>
  );
}
