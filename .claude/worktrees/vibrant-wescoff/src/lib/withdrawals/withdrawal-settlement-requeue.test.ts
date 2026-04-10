import assert from "node:assert/strict";
import test from "node:test";
import { VestingStatus, WithdrawalStatus } from "@prisma/client";
import { requeueFailedWithdrawal } from "./withdrawal-settlement-requeue";

class TestSettlementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TestSettlementError";
  }
}

test("refuses requeue when the failed withdrawal no longer has enough available vesting balance", async () => {
  let vestingUpdated = false;
  let withdrawalReset = false;
  let auditWritten = false;

  await assert.rejects(
    () =>
      requeueFailedWithdrawal({
        withdrawalId: "withdrawal-1",
        currentStatus: WithdrawalStatus.FAILED,
        solanaTxSignature: null,
        submittedTxSignature: null,
        grossAmount: BigInt(50),
        currentVestingStatus: VestingStatus.LOCKED,
        unlockAt: new Date("2099-01-01T00:00:00.000Z"),
        totalAmount: BigInt(100),
        withdrawnAmount: BigInt(60),
        async resetWithdrawal() {
          withdrawalReset = true;
          return 1;
        },
        async updateVesting() {
          vestingUpdated = true;
        },
        async recordTransitionAudit() {
          auditWritten = true;
        },
        createError(message) {
          return new TestSettlementError(message);
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof TestSettlementError);
      assert.match(
        String((error as Error).message),
        /no longer has enough available balance/i,
      );
      return true;
    },
  );

  assert.equal(vestingUpdated, false);
  assert.equal(withdrawalReset, false);
  assert.equal(auditWritten, false);
});

test("refuses requeue when an on-chain submitted payout already exists", async () => {
  let vestingUpdated = false;
  let withdrawalReset = false;

  await assert.rejects(
    () =>
      requeueFailedWithdrawal({
        withdrawalId: "withdrawal-2",
        currentStatus: WithdrawalStatus.FAILED,
        solanaTxSignature: "sig-1",
        submittedTxSignature: null,
        grossAmount: BigInt(10),
        currentVestingStatus: VestingStatus.UNLOCKED,
        unlockAt: new Date("2020-01-01T00:00:00.000Z"),
        totalAmount: BigInt(100),
        withdrawnAmount: BigInt(20),
        async resetWithdrawal() {
          withdrawalReset = true;
          return 1;
        },
        async updateVesting() {
          vestingUpdated = true;
        },
        async recordTransitionAudit() {},
        createError(message) {
          return new TestSettlementError(message);
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof TestSettlementError);
      assert.match(
        String((error as Error).message),
        /already has a submitted payout and cannot be retried automatically/i,
      );
      return true;
    },
  );

  assert.equal(vestingUpdated, false);
  assert.equal(withdrawalReset, false);
});

test("requeues a failed withdrawal only after reserving the amount again and then writing audit", async () => {
  const calls: string[] = [];

  const result = await requeueFailedWithdrawal({
    withdrawalId: "withdrawal-3",
    currentStatus: WithdrawalStatus.FAILED,
    solanaTxSignature: null,
    submittedTxSignature: null,
    grossAmount: BigInt(25),
    currentVestingStatus: VestingStatus.UNLOCKED,
    unlockAt: new Date("2020-01-01T00:00:00.000Z"),
    totalAmount: BigInt(100),
    withdrawnAmount: BigInt(25),
    async resetWithdrawal() {
      calls.push("reset");
      return 1;
    },
    async updateVesting(params) {
      calls.push(`vesting:${params.nextWithdrawnAmount.toString()}:${params.nextStatus}`);
    },
    async recordTransitionAudit() {
      calls.push("audit");
    },
    createError(message) {
      return new TestSettlementError(message);
    },
  });

  assert.equal(result.status, WithdrawalStatus.PENDING);
  assert.deepEqual(calls, ["vesting:50:UNLOCKED", "reset", "audit"]);
});
