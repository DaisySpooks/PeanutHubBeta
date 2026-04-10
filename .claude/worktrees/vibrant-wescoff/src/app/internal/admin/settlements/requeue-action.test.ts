import assert from "node:assert/strict";
import test from "node:test";
import { runRequeueFailedSettlementAction } from "./requeue-action";

class RedirectSignal extends Error {
  constructor(readonly location: string) {
    super(location);
    this.name = "RedirectSignal";
  }
}

class FakeWithdrawalSettlementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WithdrawalSettlementError";
  }
}

function buildDeps(overrides?: Partial<Parameters<typeof runRequeueFailedSettlementAction>[0]["deps"]>) {
  const calls: string[] = [];

  const deps = {
    enforceRateLimit: async () => {
      calls.push("rate-limit");
    },
    requeueFailedWithdrawalForRetry: async () => {
      calls.push("requeue");
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

  return { deps, calls };
}

test("requeue action redirects to success and revalidates only after successful retry + audit", async () => {
  const { deps, calls } = buildDeps();

  await assert.rejects(
    () =>
      runRequeueFailedSettlementAction({
        actor: "internal-admin",
        withdrawalId: "withdrawal-1",
        note: "",
        deps,
      }),
    (error: unknown) => error instanceof RedirectSignal && error.location === "/internal/admin/settlements?flash=requeue-success",
  );

  assert.deepEqual(calls, ["rate-limit", "requeue", "log", "revalidate"]);
});

test("requeue action redirects to requeue-error on settlement validation failures without false success work", async () => {
  const { deps, calls } = buildDeps({
    requeueFailedWithdrawalForRetry: async () => {
      calls.push("requeue");
      throw new FakeWithdrawalSettlementError("cannot requeue");
    },
  });

  await assert.rejects(
    () =>
      runRequeueFailedSettlementAction({
        actor: "internal-admin",
        withdrawalId: "withdrawal-1",
        note: "retry",
        deps,
      }),
    (error: unknown) => error instanceof RedirectSignal && error.location === "/internal/admin/settlements?flash=requeue-error",
  );

  assert.deepEqual(calls, ["rate-limit", "requeue"]);
});

test("requeue action redirects to action-error on non-settlement failures", async () => {
  const { deps, calls } = buildDeps({
    enforceRateLimit: async () => {
      calls.push("rate-limit");
      throw new Error("rate limited unexpectedly");
    },
  });

  await assert.rejects(
    () =>
      runRequeueFailedSettlementAction({
        actor: "internal-admin",
        withdrawalId: "withdrawal-1",
        note: "retry",
        deps,
      }),
    (error: unknown) => error instanceof RedirectSignal && error.location === "/internal/admin/settlements?flash=action-error",
  );

  assert.deepEqual(calls, ["rate-limit"]);
});

test("requeue action uses the default audit note when no note is provided", async () => {
  let loggedMessage = "";
  const { deps } = buildDeps({
    logWithdrawalPayoutAttempt: async (params) => {
      loggedMessage = params.message;
    },
  });

  await assert.rejects(
    () =>
      runRequeueFailedSettlementAction({
        actor: "internal-admin",
        withdrawalId: "withdrawal-1",
        note: "   ",
        deps,
      }),
    (error: unknown) => error instanceof RedirectSignal && error.location === "/internal/admin/settlements?flash=requeue-success",
  );

  assert.equal(loggedMessage, "Internal admin requeued the failed withdrawal for a controlled retry.");
});
