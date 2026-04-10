import assert from "node:assert/strict";
import test from "node:test";
import { WithdrawalStatus } from "@prisma/client";
import { replaceProcessingSubmissionRecord } from "./withdrawal-settlement-replace-submission";

class TestSettlementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TestSettlementError";
  }
}

test("refuses replacement when the current submitted signature does not match the expected prior signature", async () => {
  let updateCalled = false;

  await assert.rejects(
    () =>
      replaceProcessingSubmissionRecord({
        withdrawalId: "withdrawal-1",
        currentStatus: WithdrawalStatus.PROCESSING,
        currentJobId: "job-1",
        expectedJobId: "job-1",
        currentSolanaTxSignature: "sig-current",
        previousSolanaTxSignature: "sig-expected",
        nextSolanaTxSignature: "sig-next",
        nextSolanaTxBlockhash: "blockhash-next",
        nextSolanaTxLastValidBlockHeight: BigInt(123),
        async updateReplacement() {
          updateCalled = true;
          return 1;
        },
        createError(message) {
          return new TestSettlementError(message);
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof TestSettlementError);
      assert.match(
        String((error as Error).message),
        /no longer has the expected submitted Solana transaction/i,
      );
      return true;
    },
  );

  assert.equal(updateCalled, false);
});

test("refuses replacement when the processing claim changes during the update", async () => {
  await assert.rejects(
    () =>
      replaceProcessingSubmissionRecord({
        withdrawalId: "withdrawal-2",
        currentStatus: WithdrawalStatus.PROCESSING,
        currentJobId: "job-2",
        expectedJobId: "job-2",
        currentSolanaTxSignature: "sig-old",
        previousSolanaTxSignature: "sig-old",
        nextSolanaTxSignature: "sig-new",
        nextSolanaTxBlockhash: "blockhash-new",
        nextSolanaTxLastValidBlockHeight: BigInt(456),
        async updateReplacement() {
          return 0;
        },
        createError(message) {
          return new TestSettlementError(message);
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof TestSettlementError);
      assert.match(
        String((error as Error).message),
        /could not replace its payout submission because its processing claim changed/i,
      );
      return true;
    },
  );
});

test("replaces the submitted transaction only when the expected prior signature still matches", async () => {
  const result = await replaceProcessingSubmissionRecord({
    withdrawalId: "withdrawal-3",
    currentStatus: WithdrawalStatus.PROCESSING,
    currentJobId: "job-3",
    expectedJobId: "job-3",
    currentSolanaTxSignature: "sig-old",
    previousSolanaTxSignature: "sig-old",
    nextSolanaTxSignature: "sig-new",
    nextSolanaTxBlockhash: "blockhash-new",
    nextSolanaTxLastValidBlockHeight: BigInt(789),
    async updateReplacement() {
      return 1;
    },
    createError(message) {
      return new TestSettlementError(message);
    },
  });

  assert.equal(result.id, "withdrawal-3");
  assert.equal(result.solanaTxSignature, "sig-new");
  assert.equal(result.solanaTxBlockhash, "blockhash-new");
  assert.equal(result.solanaTxLastValidBlockHeight, "789");
});
