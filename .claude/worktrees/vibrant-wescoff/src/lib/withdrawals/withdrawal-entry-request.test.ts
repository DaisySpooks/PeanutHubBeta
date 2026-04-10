import assert from "node:assert/strict";
import test from "node:test";
import {
  assertWithdrawalsEnabled,
  parseWithdrawalRequestedAmountAtomic,
} from "./withdrawal-entry-request";
import { WithdrawalValidationError } from "./withdrawal-validation-error";

test("reports the same disabled error for entry paths when withdrawals are turned off", () => {
  assert.throws(
    () => assertWithdrawalsEnabled(false),
    (error: unknown) =>
      error instanceof WithdrawalValidationError &&
      error.message === "Withdrawals are currently disabled by system configuration.",
  );
});

test("allows entry paths to continue when withdrawals are enabled", () => {
  assert.doesNotThrow(() => assertWithdrawalsEnabled(true));
});

test("reports the same malformed amount error for entry paths", () => {
  assert.throws(
    () =>
      parseWithdrawalRequestedAmountAtomic({
        requestedAmount: "bad-input",
        peanutTokenDecimals: 9,
      }),
    (error: unknown) =>
      error instanceof WithdrawalValidationError &&
      error.message === "Enter a valid withdrawal amount.",
  );
});

test("parses a valid requested amount for create-style entry paths", () => {
  const amount = parseWithdrawalRequestedAmountAtomic({
    requestedAmount: "1.25",
    peanutTokenDecimals: 9,
  });

  assert.equal(amount, BigInt(1_250_000_000));
});
