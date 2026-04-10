import assert from "node:assert/strict";
import test from "node:test";
import { WithdrawalStatus } from "@prisma/client";
import { recordProcessingSubmission } from "./withdrawal-settlement-record-submission";

class TestSettlementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TestSettlementError";
  }
}

test("treats recording the exact same submitted transaction as idempotent", async () => {
  let updateCalled = false;

  const result = await recordProcessingSubmission({
    withdrawalId: "withdrawal-1",
    currentStatus: WithdrawalStatus.PROCESSING,
    currentJobId: "job-1",
    expectedJobId: "job-1",
    currentSolanaTxSignature: "sig-1",
    currentSolanaTxBlockhash: "blockhash-1",
    currentSolanaTxLastValidBlockHeight: BigInt(100),
    solanaTxSignature: "sig-1",
    solanaTxBlockhash: "blockhash-1",
    solanaTxLastValidBlockHeight: BigInt(100),
    async updateSubmission() {
      updateCalled = true;
      return 1;
    },
    createError(message) {
      return new TestSettlementError(message);
    },
  });

  assert.equal(updateCalled, false);
  assert.equal(result.id, "withdrawal-1");
  assert.equal(result.solanaTxSignature, "sig-1");
  assert.equal(result.solanaTxBlockhash, "blockhash-1");
  assert.equal(result.solanaTxLastValidBlockHeight, "100");
});

test("refuses recording a different submitted transaction when one already exists", async () => {
  let updateCalled = false;

  await assert.rejects(
    () =>
      recordProcessingSubmission({
        withdrawalId: "withdrawal-2",
        currentStatus: WithdrawalStatus.PROCESSING,
        currentJobId: "job-2",
        expectedJobId: "job-2",
        currentSolanaTxSignature: "sig-current",
        currentSolanaTxBlockhash: "blockhash-current",
        currentSolanaTxLastValidBlockHeight: BigInt(200),
        solanaTxSignature: "sig-new",
        solanaTxBlockhash: "blockhash-new",
        solanaTxLastValidBlockHeight: BigInt(201),
        async updateSubmission() {
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
        /already has a different submitted Solana transaction/i,
      );
      return true;
    },
  );

  assert.equal(updateCalled, false);
});

test("writes the first submitted transaction only when no prior signature exists", async () => {
  let updateCount = 0;

  const result = await recordProcessingSubmission({
    withdrawalId: "withdrawal-3",
    currentStatus: WithdrawalStatus.PROCESSING,
    currentJobId: "job-3",
    expectedJobId: "job-3",
    currentSolanaTxSignature: null,
    currentSolanaTxBlockhash: null,
    currentSolanaTxLastValidBlockHeight: null,
    solanaTxSignature: "sig-first",
    solanaTxBlockhash: "blockhash-first",
    solanaTxLastValidBlockHeight: BigInt(300),
    async updateSubmission() {
      updateCount += 1;
      return 1;
    },
    createError(message) {
      return new TestSettlementError(message);
    },
  });

  assert.equal(updateCount, 1);
  assert.equal(result.solanaTxSignature, "sig-first");
  assert.equal(result.solanaTxBlockhash, "blockhash-first");
  assert.equal(result.solanaTxLastValidBlockHeight, "300");
});
