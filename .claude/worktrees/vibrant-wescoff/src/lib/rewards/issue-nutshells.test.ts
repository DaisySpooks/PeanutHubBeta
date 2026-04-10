import assert from "node:assert/strict";
import test from "node:test";
import {
  NutshellIssuanceValidationError,
  NutshellSupplyCapExceededError,
  planNutshellIssuance,
} from "@/lib/rewards/nutshell-issuance-plan";

test("plans issuance within the remaining cap", () => {
  assert.deepEqual(
    planNutshellIssuance({
      amount: 250,
      currentIssuedSupply: 1_000,
      cap: 21_000_000,
      currentUserBalance: 50,
    }),
    {
      nextIssuedSupply: 1_250,
      nextUserBalance: 300,
      remainingSupply: 20_998_750,
    },
  );
});

test("refuses non-positive or non-integer issuance amounts", () => {
  assert.throws(
    () =>
      planNutshellIssuance({
        amount: 0,
        currentIssuedSupply: 0,
        cap: 21_000_000,
        currentUserBalance: 0,
      }),
    (error: unknown) => {
      assert.ok(error instanceof NutshellIssuanceValidationError);
      assert.match(String((error as Error).message), /positive whole number/i);
      return true;
    },
  );
});

test("refuses issuance that would exceed the global Nutshell cap", () => {
  assert.throws(
    () =>
      planNutshellIssuance({
        amount: 2,
        currentIssuedSupply: 20_999_999,
        cap: 21_000_000,
        currentUserBalance: 10,
      }),
    (error: unknown) => {
      assert.ok(error instanceof NutshellSupplyCapExceededError);
      assert.match(String((error as Error).message), /exceed the total cap/i);
      return true;
    },
  );
});
