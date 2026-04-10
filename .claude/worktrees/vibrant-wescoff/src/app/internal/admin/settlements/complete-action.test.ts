import assert from "node:assert/strict";
import test from "node:test";
import { runCompleteSettlementAction } from "./complete-action";

class RedirectSignal extends Error {
  constructor(readonly location: string) {
    super(location);
    this.name = "RedirectSignal";
  }
}

class FakeWithdrawalPayoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WithdrawalPayoutError";
  }
}

class FakeWithdrawalSettlementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WithdrawalSettlementError";
  }
}

function buildDeps(
  overrides?: Partial<Parameters<typeof runCompleteSettlementAction>[0]["deps"]>,
) {
  const calls: string[] = [];
  const confirmedAt = new Date("2026-04-03T20:00:00.000Z");

  const deps = {
    enforceRateLimit: async () => {
      calls.push("rate-limit");
    },
    confirmStoredWithdrawalPayout: async () => {
      calls.push("confirm");
      return {
        solanaTxSignature: "sig-123",
        solanaConfirmedAt: confirmedAt,
      };
    },
    completeWithdrawalProcessing: async () => {
      calls.push("complete");
    },
    logWithdrawalPayoutAttempt: async () => {
      calls.push("log");
    },
    revalidatePath: () => {
      calls.push("revalidate");
    },
    redirect: (location: string) => {
      throw new RedirectSignal(location);
    },
    ...overrides,
  };

  return { deps, calls, confirmedAt };
}

test("complete action redirects to success and revalidates only after payout confirmation, completion, and audit", async () => {
  const { deps, calls } = buildDeps();

  await assert.rejects(
    () =>
      runCompleteSettlementAction({
        actor: "internal-admin",
        withdrawalId: "withdrawal-1",
        jobId: "job-1",
        solanaTxSignature: "sig-123",
        deps,
      }),
    (error: unknown) =>
      error instanceof RedirectSignal &&
      error.location === "/internal/admin/settlements?flash=complete-success",
  );

  assert.deepEqual(calls, ["rate-limit", "confirm", "complete", "log", "revalidate"]);
});

test("complete action redirects to complete-error on payout confirmation failures without false success work", async () => {
  const { deps, calls } = buildDeps({
    confirmStoredWithdrawalPayout: async () => {
      calls.push("confirm");
      throw new FakeWithdrawalPayoutError("missing payout");
    },
  });

  await assert.rejects(
    () =>
      runCompleteSettlementAction({
        actor: "internal-admin",
        withdrawalId: "withdrawal-1",
        jobId: "job-1",
        solanaTxSignature: "sig-123",
        deps,
      }),
    (error: unknown) =>
      error instanceof RedirectSignal &&
      error.location === "/internal/admin/settlements?flash=complete-error",
  );

  assert.deepEqual(calls, ["rate-limit", "confirm"]);
});

test("complete action redirects to complete-error on settlement failures after confirmation", async () => {
  const { deps, calls } = buildDeps({
    completeWithdrawalProcessing: async () => {
      calls.push("complete");
      throw new FakeWithdrawalSettlementError("claim changed");
    },
  });

  await assert.rejects(
    () =>
      runCompleteSettlementAction({
        actor: "internal-admin",
        withdrawalId: "withdrawal-1",
        jobId: "job-1",
        solanaTxSignature: "sig-123",
        deps,
      }),
    (error: unknown) =>
      error instanceof RedirectSignal &&
      error.location === "/internal/admin/settlements?flash=complete-error",
  );

  assert.deepEqual(calls, ["rate-limit", "confirm", "complete"]);
});

test("complete action redirects to action-error on non-settlement failures", async () => {
  const { deps, calls } = buildDeps({
    enforceRateLimit: async () => {
      calls.push("rate-limit");
      throw new Error("unexpected");
    },
  });

  await assert.rejects(
    () =>
      runCompleteSettlementAction({
        actor: "internal-admin",
        withdrawalId: "withdrawal-1",
        jobId: "job-1",
        solanaTxSignature: "sig-123",
        deps,
      }),
    (error: unknown) =>
      error instanceof RedirectSignal &&
      error.location === "/internal/admin/settlements?flash=action-error",
  );

  assert.deepEqual(calls, ["rate-limit"]);
});

test("complete action passes the expected signature through payout confirmation and audit logging", async () => {
  let expectedSignature: string | undefined;
  let loggedSignature = "";
  const { deps, confirmedAt } = buildDeps({
    confirmStoredWithdrawalPayout: async (params) => {
      expectedSignature = params.expectedSolanaTxSignature;
      return {
        solanaTxSignature: "sig-confirmed",
        solanaConfirmedAt: confirmedAt,
      };
    },
    logWithdrawalPayoutAttempt: async (params) => {
      loggedSignature = params.solanaTxSignature;
    },
  });

  await assert.rejects(
    () =>
      runCompleteSettlementAction({
        actor: "internal-admin",
        withdrawalId: "withdrawal-1",
        jobId: "job-1",
        solanaTxSignature: "sig-expected",
        deps,
      }),
    (error: unknown) =>
      error instanceof RedirectSignal &&
      error.location === "/internal/admin/settlements?flash=complete-success",
  );

  assert.equal(expectedSignature, "sig-expected");
  assert.equal(loggedSignature, "sig-confirmed");
});
