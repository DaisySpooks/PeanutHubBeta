import assert from "node:assert/strict";
import test from "node:test";
import { VestingStatus } from "@prisma/client";
import {
  deriveSettlementRollback,
  WithdrawalSettlementRollbackError,
} from "./withdrawal-settlement-rollback";

test("refuses rollback when it would make withdrawnAmount negative", () => {
  assert.throws(
    () =>
      deriveSettlementRollback({
        currentStatus: VestingStatus.LOCKED,
        unlockAt: new Date("2026-05-01T00:00:00.000Z"),
        totalAmount: BigInt(10),
        withdrawnAmount: BigInt(2),
        rollbackAmount: BigInt(3),
      }),
    (error: unknown) => {
      assert.ok(error instanceof WithdrawalSettlementRollbackError);
      assert.match(
        String((error as Error).message),
        /rollback would make withdrawnAmount negative/i,
      );
      return true;
    },
  );
});

test("restores a locked vesting position after rolling back a reserved withdrawal before unlock", () => {
  const result = deriveSettlementRollback({
    currentStatus: VestingStatus.LOCKED,
    unlockAt: new Date("2099-05-01T00:00:00.000Z"),
    totalAmount: BigInt(100),
    withdrawnAmount: BigInt(25),
    rollbackAmount: BigInt(25),
  });

  assert.equal(result.nextWithdrawnAmount, BigInt(0));
  assert.equal(result.nextStatus, VestingStatus.LOCKED);
});

test("restores an unlocked vesting position after rolling back a reserved withdrawal after unlock", () => {
  const result = deriveSettlementRollback({
    currentStatus: VestingStatus.UNLOCKED,
    unlockAt: new Date("2020-05-01T00:00:00.000Z"),
    totalAmount: BigInt(100),
    withdrawnAmount: BigInt(40),
    rollbackAmount: BigInt(10),
  });

  assert.equal(result.nextWithdrawnAmount, BigInt(30));
  assert.equal(result.nextStatus, VestingStatus.UNLOCKED);
});
