import { verify } from "@octokit/webhooks-methods";

export async function verifyGithubSignature(
  body: string,
  signature: string | null,
): Promise<boolean> {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  try {
    return await verify(secret, body, signature);
  } catch {
    return false;
  }
}
