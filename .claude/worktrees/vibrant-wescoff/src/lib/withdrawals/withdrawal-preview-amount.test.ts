import test from "node:test";
import assert from "node:assert/strict";
import { resolveWithdrawalPreviewAmountAtomic } from "./withdrawal-preview-amount";
import { WithdrawalValidationError } from "./withdrawal-validation-error";

test("defaults a blank preview amount to the remaining vested amount when the position is withdrawable", () => {
  const amount = resolveWithdrawalPreviewAmountAtomic({
    requestedAmount: "   ",
    peanutTokenDecimals: 9,
    eligibility: {
      isUnlocked: true,
      remainingAmount: BigInt(1_500_000_000),
      canWithdraw: true,
    },
  });

  assert.equal(amount, BigInt(1_500_000_000));
});

test("reports a locked vesting position before defaulting a blank preview amount", () => {
  assert.throws(
    () =>
      resolveWithdrawalPreviewAmountAtomic({
        requestedAmount: undefined,
        peanutTokenDecimals: 9,
        eligibility: {
          isUnlocked: false,
          remainingAmount: BigInt(1_500_000_000),
          canWithdraw: false,
        },
      }),
    (error: unknown) =>
      error instanceof WithdrawalValidationError &&
      /still locked/i.test(error.message),
  );
});

test("reports an exhausted vesting position instead of an invalid amount when preview amount is blank", () => {
  assert.throws(
    () =>
      resolveWithdrawalPreviewAmountAtomic({
        requestedAmount: "",
        peanutTokenDecimals: 9,
        eligibility: {
          isUnlocked: true,
          remainingAmount: BigInt(0),
          canWithdraw: false,
        },
      }),
    (error: unknown) =>
      error instanceof WithdrawalValidationError &&
      /no withdrawable amount remains/i.test(error.message),
  );
});

test("rejects malformed explicit preview amounts", () => {
  assert.throws(
    () =>
      resolveWithdrawalPreviewAmountAtomic({
        requestedAmount: "nope",
        peanutTokenDecimals: 9,
        eligibility: {
          isUnlocked: true,
          remainingAmount: BigInt(1_500_000_000),
          canWithdraw: true,
        },
      }),
    (error: unknown) =>
      error instanceof WithdrawalValidationError &&
      /enter a valid withdrawal amount/i.test(error.message),
  );
});
