import assert from "node:assert/strict";
import test from "node:test";
import { runIssueNutshellRewardsAction } from "./issue-rewards-action";

function redirectError(path: string) {
  const error = new Error(path);
  error.name = "NEXT_REDIRECT";
  return error;
}

test("posts to the existing internal rewards route and redirects on success", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let revalidatedPath: string | null = null;

  await assert.rejects(
    () =>
      runIssueNutshellRewardsAction({
        adminApiKey: "x".repeat(32),
        walletAddress: "wallet-1",
        amount: "250",
        reason: "ADMIN_CREDIT",
        note: "Manual reward",
        appUrl: "http://localhost:3000",
        deps: {
          enforceRateLimit: async () => undefined,
          fetch: async (url, init) => {
            calls.push({ url: String(url), init });
            return new Response(JSON.stringify({ issuance: { walletAddress: "wallet-1" } }), {
              status: 201,
              headers: { "content-type": "application/json" },
            });
          },
          revalidatePath: (path) => {
            revalidatedPath = path;
          },
          redirect: (path) => {
            throw redirectError(path);
          },
        },
      }),
    (error: unknown) => {
      assert.equal((error as Error).message, "/internal/admin/settlements?flash=issue-success");
      return true;
    },
  );

  assert.equal(revalidatedPath, "/internal/admin/settlements");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "http://localhost:3000/api/internal/rewards/issue");
  assert.equal((calls[0]?.init?.headers as Record<string, string>)["x-internal-admin-key"], "x".repeat(32));
});

test("redirects with issue-error when the issuance route returns a business failure", async () => {
  await assert.rejects(
    () =>
      runIssueNutshellRewardsAction({
        adminApiKey: "x".repeat(32),
        walletAddress: "wallet-1",
        amount: "250",
        reason: "ADMIN_CREDIT",
        note: "",
        appUrl: "http://localhost:3000",
        deps: {
          enforceRateLimit: async () => undefined,
          fetch: async () =>
            new Response(
              JSON.stringify({
                error: "Issuing 250 Nutshells would exceed the total cap of 21,000,000.",
              }),
              {
                status: 400,
                headers: { "content-type": "application/json" },
              },
            ),
          revalidatePath: () => undefined,
          redirect: (path) => {
            throw redirectError(path);
          },
        },
      }),
    (error: unknown) => {
      assert.match(String((error as Error).message), /flash=issue-error&detail=Issuing%20250%20Nutshells/i);
      return true;
    },
  );
});

test("redirects with action-error when rate limiting or transport fails", async () => {
  await assert.rejects(
    () =>
      runIssueNutshellRewardsAction({
        adminApiKey: "x".repeat(32),
        walletAddress: "wallet-1",
        amount: "250",
        reason: "ADMIN_CREDIT",
        note: "",
        appUrl: "http://localhost:3000",
        deps: {
          enforceRateLimit: async () => {
            throw new Error("Too many requests");
          },
          fetch: async () => {
            throw new Error("should not fetch");
          },
          revalidatePath: () => undefined,
          redirect: (path) => {
            throw redirectError(path);
          },
        },
      }),
    (error: unknown) => {
      assert.equal((error as Error).message, "/internal/admin/settlements?flash=action-error");
      return true;
    },
  );
});
