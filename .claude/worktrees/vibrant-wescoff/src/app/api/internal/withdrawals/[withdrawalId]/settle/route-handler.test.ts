import assert from "node:assert/strict";
import test from "node:test";
import { runInternalSettlementRoute } from "./route-handler";

class NamedError extends Error {
  constructor(name: string, message: string) {
    super(message);
    this.name = name;
  }
}

function buildRequest(body: unknown) {
  return new Request("http://localhost/api/internal/withdrawals/withdrawal-1/settle", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "127.0.0.1",
    },
    body: JSON.stringify(body),
  });
}

function buildDeps(overrides?: Partial<Parameters<typeof runInternalSettlementRoute>[0]["deps"]>) {
  const calls: string[] = [];

  return {
    deps: {
      isAuthorizedInternalAdminRequest: () => true,
      getInternalSettlementActor: () => "internal-admin-api",
      getClientIpFromHeaders: () => "127.0.0.1",
      enforceRateLimit: async () => {
        calls.push("rate-limit");
      },
      beginWithdrawalProcessing: async () => {
        calls.push("begin");
        return { id: "withdrawal-1", status: "PROCESSING" };
      },
      confirmStoredWithdrawalPayout: async () => {
        calls.push("confirm");
        return {
          solanaTxSignature: "sig-123",
          solanaConfirmedAt: new Date("2026-04-03T20:00:00.000Z"),
        };
      },
      completeWithdrawalProcessing: async () => {
        calls.push("complete");
        return { id: "withdrawal-1", status: "COMPLETED" };
      },
      failWithdrawalProcessing: async () => {
        calls.push("fail");
        return { id: "withdrawal-1", status: "FAILED" };
      },
      isMultisigPayoutEnabled: () => true,
      reconcileAwaitingSignaturesWithdrawal: async () => {
        calls.push("reconcile-awaiting");
        return { id: "withdrawal-1", status: "SUBMITTED" };
      },
      reconcileSubmittedWithdrawal: async () => {
        calls.push("reconcile-submitted");
        return { id: "withdrawal-1", status: "COMPLETED" };
      },
      logWithdrawalPayoutAttempt: async () => {
        calls.push("log");
      },
      ...overrides,
    },
    calls,
  };
}

test("returns 401 for unauthorized internal settlement requests", async () => {
  const { deps, calls } = buildDeps({
    isAuthorizedInternalAdminRequest: () => false,
  });

  const response = await runInternalSettlementRoute({
    request: buildRequest({ action: "begin", jobId: "job-1" }),
    withdrawalId: "withdrawal-1",
    deps,
  });

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    error: "Unauthorized internal admin request.",
  });
  assert.deepEqual(calls, []);
});

test("returns settlement payload for successful complete actions and logs the completion", async () => {
  const { deps, calls } = buildDeps();

  const response = await runInternalSettlementRoute({
    request: buildRequest({
      action: "complete",
      jobId: "job-1",
      solanaTxSignature: "sig-expected",
    }),
    withdrawalId: "withdrawal-1",
    deps,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    settlement: {
      id: "withdrawal-1",
      status: "COMPLETED",
    },
  });
  assert.deepEqual(calls, ["rate-limit", "confirm", "complete", "log"]);
});

test("returns 400 when complete action hits payout confirmation guardrails", async () => {
  const { deps, calls } = buildDeps({
    confirmStoredWithdrawalPayout: async () => {
      calls.push("confirm");
      throw new NamedError("WithdrawalPayoutError", "Stored payout confirmation failed.");
    },
  });

  const response = await runInternalSettlementRoute({
    request: buildRequest({
      action: "complete",
      jobId: "job-1",
      solanaTxSignature: "sig-expected",
    }),
    withdrawalId: "withdrawal-1",
    deps,
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "Stored payout confirmation failed.",
  });
  assert.deepEqual(calls, ["rate-limit", "confirm"]);
});

test("returns 400 when reconcile is requested while multisig payout is disabled", async () => {
  const { deps, calls } = buildDeps({
    isMultisigPayoutEnabled: () => false,
  });

  const response = await runInternalSettlementRoute({
    request: buildRequest({
      action: "reconcile",
      status: "AWAITING_SIGNATURES",
    }),
    withdrawalId: "withdrawal-1",
    deps,
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "Multisig payout flow is disabled.",
  });
  assert.deepEqual(calls, ["rate-limit"]);
});

test("returns 409 when reconcile finds the withdrawal already claimed by another worker", async () => {
  const { deps, calls } = buildDeps({
    reconcileAwaitingSignaturesWithdrawal: async () => {
      calls.push("reconcile-awaiting");
      return null;
    },
  });

  const response = await runInternalSettlementRoute({
    request: buildRequest({
      action: "reconcile",
      status: "AWAITING_SIGNATURES",
    }),
    withdrawalId: "withdrawal-1",
    deps,
  });

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: "Withdrawal is already being reconciled by another worker.",
  });
  assert.deepEqual(calls, ["rate-limit", "reconcile-awaiting"]);
});

test("returns 429 for internal settlement route rate-limit failures", async () => {
  const { deps, calls } = buildDeps({
    enforceRateLimit: async () => {
      calls.push("rate-limit");
      throw new NamedError("RateLimitError", "Too many internal settlement requests.");
    },
  });

  const response = await runInternalSettlementRoute({
    request: buildRequest({ action: "begin", jobId: "job-1" }),
    withdrawalId: "withdrawal-1",
    deps,
  });

  assert.equal(response.status, 429);
  assert.deepEqual(await response.json(), {
    error: "Too many internal settlement requests.",
  });
  assert.deepEqual(calls, ["rate-limit"]);
});
