import assert from "node:assert/strict";
import test from "node:test";
import {
  assertWithdrawalEntryEligibility,
  assertWithdrawalEntryVestingAccess,
} from "./withdrawal-entry-validation";
import { WithdrawalValidationError } from "./withdrawal-validation-error";

test("reports the same not-found error when the entry vesting position is missing", () => {
  assert.throws(
    () =>
      assertWithdrawalEntryVestingAccess({
        vestingPosition: null,
        actorWalletAddress: "wallet-1",
      }),
    (error: unknown) =>
      error instanceof WithdrawalValidationError &&
      error.message === "Vesting position not found for this account.",
  );
});

test("reports the same ownership error when the entry vesting position belongs to another wallet", () => {
  assert.throws(
    () =>
      assertWithdrawalEntryVestingAccess({
        vestingPosition: {
          walletAddress: "wallet-2",
        },
        actorWalletAddress: "wallet-1",
      }),
    (error: unknown) =>
      error instanceof WithdrawalValidationError &&
      error.message === "Vesting position does not belong to this wallet.",
  );
});

test("reports the same over-limit error when the requested amount exceeds the remaining vested balance", () => {
  assert.throws(
    () =>
      assertWithdrawalEntryEligibility({
        requestedAmountAtomic: BigInt(2_000_000_000),
        eligibility: {
          isUnlocked: true,
          remainingAmount: BigInt(1_500_000_000),
          canWithdraw: true,
        },
      }),
    (error: unknown) =>
      error instanceof WithdrawalValidationError &&
      error.message === "Requested amount exceeds the remaining vested balance.",
  );
});

test("allows entry validation to continue when ownership and requested amount are both valid", () => {
  assert.doesNotThrow(() =>
    assertWithdrawalEntryVestingAccess({
      vestingPosition: {
        walletAddress: "wallet-1",
      },
      actorWalletAddress: "wallet-1",
    }),
  );

  assert.doesNotThrow(() =>
    assertWithdrawalEntryEligibility({
      requestedAmountAtomic: BigInt(1_000_000_000),
      eligibility: {
        isUnlocked: true,
        remainingAmount: BigInt(1_500_000_000),
        canWithdraw: true,
      },
    }),
  );
});
