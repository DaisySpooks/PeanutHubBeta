import assert from "node:assert/strict";
import test from "node:test";
import {
  STREAMFLOW_SETUP_FEE_BUFFER_LAMPORTS,
  computeWrappedSolSetupPlan,
  deriveStreamflowSenderAddress,
} from "./streamflow-nonprod-setup";

test("computes wrapped SOL setup requirements for a missing source ATA", () => {
  const result = computeWrappedSolSetupPlan({
    requiredAmountAtomic: BigInt(1_000_000_000),
    sourceAccountExists: false,
    sourceAccountAmountAtomic: BigInt(0),
    rentExemptionLamports: BigInt(2_039_280),
  });

  assert.equal(result.needsAtaCreation, true);
  assert.equal(result.topUpAmountLamports, BigInt(1_000_000_000));
  assert.equal(result.ataCreationLamports, BigInt(2_039_280));
  assert.equal(
    result.recommendedAdditionalLamports,
    BigInt(1_000_000_000) + BigInt(2_039_280) + STREAMFLOW_SETUP_FEE_BUFFER_LAMPORTS,
  );
});

test("computes only the missing wrapped SOL top-up when the ATA already exists", () => {
  const result = computeWrappedSolSetupPlan({
    requiredAmountAtomic: BigInt(1_000_000_000),
    sourceAccountExists: true,
    sourceAccountAmountAtomic: BigInt(250_000_000),
    rentExemptionLamports: BigInt(2_039_280),
  });

  assert.equal(result.needsAtaCreation, false);
  assert.equal(result.topUpAmountLamports, BigInt(750_000_000));
  assert.equal(result.ataCreationLamports, BigInt(0));
});

test("marks wrapped SOL setup as already sufficient when the ATA holds enough balance", () => {
  const result = computeWrappedSolSetupPlan({
    requiredAmountAtomic: BigInt(1_000_000_000),
    sourceAccountExists: true,
    sourceAccountAmountAtomic: BigInt(1_100_000_000),
    rentExemptionLamports: BigInt(2_039_280),
  });

  assert.equal(result.alreadySufficient, true);
  assert.equal(result.topUpAmountLamports, BigInt(0));
});

test("derives the sender address from a JSON-encoded secret key", () => {
  const address = deriveStreamflowSenderAddress(
    "[47,244,23,125,223,241,240,56,89,39,181,218,120,48,79,207,205,73,141,113,63,86,139,29,79,238,34,122,149,29,87,85,79,51,253,182,80,45,156,95,130,203,7,113,91,219,154,99,124,147,16,168,146,160,94,139,77,49,9,153,140,249,210,138]",
  );

  assert.equal(address, "6LBBykNYUuS9u4AFdc7F6ms3sevGg8U85a8AaYBN8vhX");
});

