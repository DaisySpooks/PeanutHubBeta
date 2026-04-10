import assert from "node:assert/strict";
import test from "node:test";
import { runReconcileMultisigSettlementAction } from "./reconcile-action";

class RedirectSignal extends Error {
  constructor(readonly location: string) {
    super(location);
    this.name = "RedirectSignal";
  }
}

class FakeRecoverableMultisigFlowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecoverableMultisigFlowError";
  }
}

function buildDeps(
  overrides?: Partial<Parameters<typeof runReconcileMultisigSettlementAction>[0]["deps"]>,
) {
  const calls: string[] = [];

  const deps = {
    enforceRateLimit: async () => {
      calls.push("rate-limit");
    },
    isMultisigPayoutEnabled: () => true,
    reconcileAwaitingSignaturesWithdrawal: async () => {
      calls.push("reconcile-awaiting");
      return { id: "withdrawal-1" };
    },
    reconcileSubmittedWithdrawal: async () => {
      calls.push("reconcile-submitted");
      return { id: "withdrawal-1" };
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

test("reconcile action redirects to success and revalidates after awaiting-signatures reconciliation succeeds", async () => {
  const { deps, calls } = buildDeps();

  await assert.rejects(
    () =>
      runReconcileMultisigSettlementAction({
        actor: "internal-admin",
        withdrawalId: "withdrawal-1",
        status: "AWAITING_SIGNATURES",
        deps,
      }),
    (error: unknown) =>
      error instanceof RedirectSignal &&
      error.location === "/internal/admin/settlements?flash=reconcile-success",
  );

  assert.deepEqual(calls, ["rate-limit", "reconcile-awaiting", "revalidate"]);
});

test("reconcile action uses the submitted branch and redirects to success on success", async () => {
  const { deps, calls } = buildDeps();

  await assert.rejects(
    () =>
      runReconcileMultisigSettlementAction({
        actor: "internal-admin",
        withdrawalId: "withdrawal-1",
        status: "SUBMITTED",
        deps,
      }),
    (error: unknown) =>
      error instanceof RedirectSignal &&
      error.location === "/internal/admin/settlements?flash=reconcile-success",
  );

  assert.deepEqual(calls, ["rate-limit", "reconcile-submitted", "revalidate"]);
});

test("reconcile action redirects to reconcile-error when multisig payout is disabled", async () => {
  const { deps, calls } = buildDeps({
    isMultisigPayoutEnabled: () => false,
  });

  await assert.rejects(
    () =>
      runReconcileMultisigSettlementAction({
        actor: "internal-admin",
        withdrawalId: "withdrawal-1",
        status: "AWAITING_SIGNATURES",
        deps,
      }),
    (error: unknown) =>
      error instanceof RedirectSignal &&
      error.location === "/internal/admin/settlements?flash=reconcile-error",
  );

  assert.deepEqual(calls, ["rate-limit"]);
});

test("reconcile action redirects to reconcile-error when status is invalid", async () => {
  const { deps, calls } = buildDeps();

  await assert.rejects(
    () =>
      runReconcileMultisigSettlementAction({
        actor: "internal-admin",
        withdrawalId: "withdrawal-1",
        status: "PROCESSING",
        deps,
      }),
    (error: unknown) =>
      error instanceof RedirectSignal &&
      error.location === "/internal/admin/settlements?flash=reconcile-error",
  );

  assert.deepEqual(calls, ["rate-limit"]);
});

test("reconcile action redirects to reconcile-error when another worker already claimed the awaiting-signatures reconciliation", async () => {
  const { deps, calls } = buildDeps({
    reconcileAwaitingSignaturesWithdrawal: async () => {
      calls.push("reconcile-awaiting");
      return null;
    },
  });

  await assert.rejects(
    () =>
      runReconcileMultisigSettlementAction({
        actor: "internal-admin",
        withdrawalId: "withdrawal-1",
        status: "AWAITING_SIGNATURES",
        deps,
      }),
    (error: unknown) =>
      error instanceof RedirectSignal &&
      error.location === "/internal/admin/settlements?flash=reconcile-error",
  );

  assert.deepEqual(calls, ["rate-limit", "reconcile-awaiting"]);
});

test("reconcile action redirects to reconcile-error on recoverable multisig flow failures", async () => {
  const { deps, calls } = buildDeps({
    reconcileSubmittedWithdrawal: async () => {
      calls.push("reconcile-submitted");
      throw new FakeRecoverableMultisigFlowError("ambiguous match");
    },
  });

  await assert.rejects(
    () =>
      runReconcileMultisigSettlementAction({
        actor: "internal-admin",
        withdrawalId: "withdrawal-1",
        status: "SUBMITTED",
        deps,
      }),
    (error: unknown) =>
      error instanceof RedirectSignal &&
      error.location === "/internal/admin/settlements?flash=reconcile-error",
  );

  assert.deepEqual(calls, ["rate-limit", "reconcile-submitted"]);
});

test("reconcile action redirects to action-error on unexpected failures", async () => {
  const { deps, calls } = buildDeps({
    enforceRateLimit: async () => {
      calls.push("rate-limit");
      throw new Error("unexpected");
    },
  });

  await assert.rejects(
    () =>
      runReconcileMultisigSettlementAction({
        actor: "internal-admin",
        withdrawalId: "withdrawal-1",
        status: "AWAITING_SIGNATURES",
        deps,
      }),
    (error: unknown) =>
      error instanceof RedirectSignal &&
      error.location === "/internal/admin/settlements?flash=action-error",
  );

  assert.deepEqual(calls, ["rate-limit"]);
});
