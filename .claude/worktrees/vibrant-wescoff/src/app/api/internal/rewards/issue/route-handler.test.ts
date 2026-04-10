import assert from "node:assert/strict";
import test from "node:test";
import { runInternalRewardsIssueRoute, type InternalRewardsIssueRouteDeps } from "./route-handler";

function createDeps(overrides: Partial<InternalRewardsIssueRouteDeps> = {}): InternalRewardsIssueRouteDeps {
  return {
    isAuthorizedInternalAdminRequest: () => true,
    getInternalSettlementActor: () => "internal-admin-api",
    getClientIpFromHeaders: () => "127.0.0.1",
    enforceRateLimit: async () => undefined,
    issueNutshellReward: async () => ({
      ledgerEntryId: "ledger-1",
      walletAddress: "wallet-1",
      userId: "user-1",
      amount: 25,
      reason: "ADMIN_CREDIT",
      note: "Issued 25 Nutshells.",
      issuedSupply: 25,
      remainingSupply: 20_999_975,
      userBalance: 25,
      createdAt: "2026-04-05T12:00:00.000Z",
    }),
    ...overrides,
  };
}

test("returns 401 for unauthorized internal reward issuance requests", async () => {
  const response = await runInternalRewardsIssueRoute({
    request: new Request("http://localhost/api/internal/rewards/issue", {
      method: "POST",
      body: JSON.stringify({ walletAddress: "wallet-1", amount: 25 }),
      headers: { "content-type": "application/json" },
    }),
    deps: createDeps({
      isAuthorizedInternalAdminRequest: () => false,
    }),
  });

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Unauthorized internal admin request." });
});

test("returns 201 with issuance payload on successful reward issuance", async () => {
  const response = await runInternalRewardsIssueRoute({
    request: new Request("http://localhost/api/internal/rewards/issue", {
      method: "POST",
      body: JSON.stringify({ walletAddress: "wallet-1", amount: 25, reason: "ADMIN_CREDIT" }),
      headers: { "content-type": "application/json" },
    }),
    deps: createDeps(),
  });

  assert.equal(response.status, 201);
  const data = (await response.json()) as { issuance: { issuedSupply: number; userBalance: number } };
  assert.equal(data.issuance.issuedSupply, 25);
  assert.equal(data.issuance.userBalance, 25);
});

test("returns 400 when reward issuance would exceed the global cap", async () => {
  const response = await runInternalRewardsIssueRoute({
    request: new Request("http://localhost/api/internal/rewards/issue", {
      method: "POST",
      body: JSON.stringify({ walletAddress: "wallet-1", amount: 25, reason: "ADMIN_CREDIT" }),
      headers: { "content-type": "application/json" },
    }),
    deps: createDeps({
      issueNutshellReward: async () => {
        const error = new Error("Issuing 25 Nutshells would exceed the total cap of 21,000,000.");
        error.name = "NutshellSupplyCapExceededError";
        throw error;
      },
    }),
  });

  assert.equal(response.status, 400);
  assert.match(String((await response.json() as { error: string }).error), /exceed the total cap/i);
});

test("returns 404 when the target wallet does not belong to a user", async () => {
  const response = await runInternalRewardsIssueRoute({
    request: new Request("http://localhost/api/internal/rewards/issue", {
      method: "POST",
      body: JSON.stringify({ walletAddress: "missing-wallet", amount: 25, reason: "DISCORD_REWARD" }),
      headers: { "content-type": "application/json" },
    }),
    deps: createDeps({
      issueNutshellReward: async () => {
        const error = new Error("No user exists for wallet missing-wallet.");
        error.name = "NutshellIssuanceUserNotFoundError";
        throw error;
      },
    }),
  });

  assert.equal(response.status, 404);
  assert.match(String((await response.json() as { error: string }).error), /No user exists/i);
});

test("returns 429 when the internal reward issuance route is rate limited", async () => {
  const response = await runInternalRewardsIssueRoute({
    request: new Request("http://localhost/api/internal/rewards/issue", {
      method: "POST",
      body: JSON.stringify({ walletAddress: "wallet-1", amount: 25 }),
      headers: { "content-type": "application/json" },
    }),
    deps: createDeps({
      enforceRateLimit: async () => {
        const error = new Error("Too many requests.");
        error.name = "RateLimitError";
        throw error;
      },
    }),
  });

  assert.equal(response.status, 429);
  assert.equal((await response.json() as { error: string }).error, "Too many requests.");
});

test("returns 400 for malformed reward issuance requests", async () => {
  const response = await runInternalRewardsIssueRoute({
    request: new Request("http://localhost/api/internal/rewards/issue", {
      method: "POST",
      body: JSON.stringify({ walletAddress: "wallet-1", amount: "bad" }),
      headers: { "content-type": "application/json" },
    }),
    deps: createDeps(),
  });

  assert.equal(response.status, 400);
  assert.match(String((await response.json() as { error: string }).error), /expected number/i);
});
