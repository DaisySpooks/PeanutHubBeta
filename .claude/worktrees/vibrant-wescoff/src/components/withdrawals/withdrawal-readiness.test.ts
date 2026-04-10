import assert from "node:assert/strict";
import test from "node:test";
import { getWithdrawalReadinessSummary } from "./withdrawal-readiness";

test("reports ready when the position can be withdrawn now", () => {
  const result = getWithdrawalReadinessSummary({
    unlockAt: new Date("2026-04-01T00:00:00.000Z").toISOString(),
    canWithdraw: true,
    isUnlocked: true,
    remainingAmount: "1000",
  });

  assert.equal(result.title, "Ready for withdrawal");
  assert.equal(result.badge, "Withdrawable");
});

test("reports unlocking soon when the unlock date is within a week", () => {
  const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
  const result = getWithdrawalReadinessSummary({
    unlockAt: soon,
    canWithdraw: false,
    isUnlocked: false,
    remainingAmount: "1000",
  });

  assert.equal(result.title, "Unlocking soon");
  assert.equal(result.badge, "Unlocking soon");
});

test("reports no balance remaining once the position is unlocked and empty", () => {
  const result = getWithdrawalReadinessSummary({
    unlockAt: new Date("2026-04-01T00:00:00.000Z").toISOString(),
    canWithdraw: false,
    isUnlocked: true,
    remainingAmount: "0",
  });

  assert.equal(result.title, "No balance remaining");
  assert.equal(result.badge, "Fully used");
});
