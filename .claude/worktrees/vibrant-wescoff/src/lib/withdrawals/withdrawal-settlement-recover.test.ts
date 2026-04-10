import assert from "node:assert/strict";
import test from "node:test";
import { WithdrawalStatus } from "@prisma/client";
import { recoverStaleProcessingTransition } from "./withdrawal-settlement-recover";

class TestSettlementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TestSettlementError";
  }
}

test("refuses stale recovery when a submitted payout already exists, before update or audit", async () => {
  let updateCalled = false;
  let auditCalled = false;

  await assert.rejects(
    () =>
      recoverStaleProcessingTransition({
        withdrawalId: "withdrawal-1",
        currentStatus: WithdrawalStatus.PROCESSING,
        currentJobId: "job-1",
        expectedJobId: "job-1",
        solanaTxSignature: "sig-1",
        reason: "worker timed out",
        async updateRecovery() {
          updateCalled = true;
          return 1;
        },
        async recordTransitionAudit() {
          auditCalled = true;
        },
        createError(message) {
          return new TestSettlementError(message);
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof TestSettlementError);
      assert.match(
        String((error as Error).message),
        /already has a submitted payout and cannot be reset to PENDING/i,
      );
      return true;
    },
  );

  assert.equal(updateCalled, false);
  assert.equal(auditCalled, false);
});

test("refuses stale recovery when the processing claim changed and does not write audit", async () => {
  let auditCalled = false;

  await assert.rejects(
    () =>
      recoverStaleProcessingTransition({
        withdrawalId: "withdrawal-2",
        currentStatus: WithdrawalStatus.PROCESSING,
        currentJobId: "job-2",
        expectedJobId: "job-2",
        solanaTxSignature: null,
        reason: "worker timed out",
        async updateRecovery() {
          return 0;
        },
        async recordTransitionAudit() {
          auditCalled = true;
        },
        createError(message) {
          return new TestSettlementError(message);
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof TestSettlementError);
      assert.match(
        String((error as Error).message),
        /could not be recovered because its processing claim changed/i,
      );
      return true;
    },
  );

  assert.equal(auditCalled, false);
});

test("recovers stale processing only after update succeeds and then writes audit", async () => {
  const calls: string[] = [];

  const result = await recoverStaleProcessingTransition({
    withdrawalId: "withdrawal-3",
    currentStatus: WithdrawalStatus.PROCESSING,
    currentJobId: "job-3",
    expectedJobId: "job-3",
    solanaTxSignature: null,
    reason: "worker timed out",
    async updateRecovery() {
      calls.push("update");
      return 1;
    },
    async recordTransitionAudit() {
      calls.push("audit");
    },
    createError(message) {
      return new TestSettlementError(message);
    },
  });

  assert.equal(result.status, WithdrawalStatus.PENDING);
  assert.deepEqual(calls, ["update", "audit"]);
});
