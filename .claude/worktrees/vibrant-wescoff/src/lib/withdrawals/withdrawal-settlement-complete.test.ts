import assert from "node:assert/strict";
import test from "node:test";
import { WithdrawalStatus } from "@prisma/client";
import { completeProcessingSettlementTransition } from "./withdrawal-settlement-complete";

class TestSettlementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TestSettlementError";
  }
}

test("refuses completion from a non-processing state before update or audit", async () => {
  let updateCalled = false;
  let auditCalled = false;

  await assert.rejects(
    () =>
      completeProcessingSettlementTransition({
        withdrawalId: "withdrawal-1",
        currentStatus: WithdrawalStatus.PENDING,
        currentJobId: "job-1",
        expectedJobId: "job-1",
        solanaTxSignature: "sig-1",
        solanaConfirmedAt: new Date("2026-04-03T10:00:00.000Z"),
        triggeredBy: "test-actor",
        async updateCompletion() {
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
      assert.match(String((error as Error).message), /cannot move to COMPLETED from PENDING/i);
      return true;
    },
  );

  assert.equal(updateCalled, false);
  assert.equal(auditCalled, false);
});

test("refuses completion for the wrong processing job before update or audit", async () => {
  let updateCalled = false;
  let auditCalled = false;

  await assert.rejects(
    () =>
      completeProcessingSettlementTransition({
        withdrawalId: "withdrawal-2",
        currentStatus: WithdrawalStatus.PROCESSING,
        currentJobId: "job-1",
        expectedJobId: "job-2",
        solanaTxSignature: "sig-2",
        solanaConfirmedAt: new Date("2026-04-03T10:05:00.000Z"),
        triggeredBy: "test-actor",
        async updateCompletion() {
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
      assert.match(String((error as Error).message), /owned by a different processing job/i);
      return true;
    },
  );

  assert.equal(updateCalled, false);
  assert.equal(auditCalled, false);
});

test("refuses completion when the processing claim changed and does not write audit", async () => {
  let auditCalled = false;

  await assert.rejects(
    () =>
      completeProcessingSettlementTransition({
        withdrawalId: "withdrawal-3",
        currentStatus: WithdrawalStatus.PROCESSING,
        currentJobId: "job-3",
        expectedJobId: "job-3",
        solanaTxSignature: "sig-3",
        solanaConfirmedAt: new Date("2026-04-03T10:10:00.000Z"),
        triggeredBy: "test-actor",
        async updateCompletion() {
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
        /could not be completed because its processing claim changed/i,
      );
      return true;
    },
  );

  assert.equal(auditCalled, false);
});

test("completes successfully and records audit only after the update succeeds", async () => {
  const calls: string[] = [];

  const result = await completeProcessingSettlementTransition({
    withdrawalId: "withdrawal-4",
    currentStatus: WithdrawalStatus.PROCESSING,
    currentJobId: "job-4",
    expectedJobId: "job-4",
    solanaTxSignature: "sig-4",
    solanaConfirmedAt: new Date("2026-04-03T10:15:00.000Z"),
    triggeredBy: "test-actor",
    async updateCompletion() {
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

  assert.deepEqual(calls, ["update", "audit"]);
  assert.equal(result.status, WithdrawalStatus.COMPLETED);
  assert.equal(result.jobId, "job-4");
  assert.equal(result.solanaTxSignature, "sig-4");
  assert.equal(result.solanaConfirmedAt, "2026-04-03T10:15:00.000Z");
});
