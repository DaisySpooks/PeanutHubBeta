import assert from "node:assert/strict";
import test from "node:test";
import { getExchangeImpact } from "./exchange-impact";

test("returns requested and remaining Nutshell balances for a valid exchange amount", () => {
  assert.deepEqual(
    getExchangeImpact({
      nutshellBalance: 1200,
      parsedNutshellAmount: 250,
    }),
    {
      requestedAmount: 250,
      remainingBalance: 950,
      exceedsBalance: false,
    },
  );
});

test("flags when the requested Nutshell amount would exceed the available balance", () => {
  assert.deepEqual(
    getExchangeImpact({
      nutshellBalance: 100,
      parsedNutshellAmount: 250,
    }),
    {
      requestedAmount: 250,
      remainingBalance: -150,
      exceedsBalance: true,
    },
  );
});

test("returns null for invalid exchange amounts", () => {
  assert.equal(
    getExchangeImpact({
      nutshellBalance: 100,
      parsedNutshellAmount: 0,
    }),
    null,
  );
});
