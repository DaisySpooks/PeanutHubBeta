import assert from "node:assert/strict";
import test from "node:test";
import type { StreamflowScheduleSearchResult } from "./streamflow-adapter";
import {
  buildStreamflowPayloadFromSource,
  toPersistedObservedSchedule,
  toPersistedObservedScheduleFromSearchMatch,
  validateStreamflowPayloadSource,
  type StreamflowPayloadSource,
} from "./streamflow-payload";

function createValidSource(overrides?: Partial<StreamflowPayloadSource>): StreamflowPayloadSource {
  return {
    vestingPositionId: "vesting-position-1",
    exchangeId: "exchange-1",
    vestingReference: "exchange:exchange-1:streamflow-lock:v1",
    clientCorrelationId: "streamflow-client:exchange-1:v1",
    expectedRecipientWalletAddress: "11111111111111111111111111111112",
    expectedMintAddress: "11111111111111111111111111111113",
    expectedAmountAtomic: BigInt(1_000_000),
    expectedStartAt: new Date("2026-04-03T00:00:00.000Z"),
    expectedEndAt: new Date("2026-05-03T00:00:00.000Z"),
    expectedVestingKind: "token_lock",
    clientOrderRef: "client-order-ref-1",
    treasuryAddress: "11111111111111111111111111111114",
    ...overrides,
  };
}

test("builds a real Streamflow payload and expected snapshot from a valid source", () => {
  const result = buildStreamflowPayloadFromSource(createValidSource());

  assert.equal(result.request.vestingReference, "exchange:exchange-1:streamflow-lock:v1");
  assert.equal(result.payload.provider, "streamflow");
  assert.equal(result.payload.required.clientCorrelationId, "streamflow-client:exchange-1:v1");
  assert.equal(result.payload.required.amountAtomic, "1000000");
  assert.equal(result.payload.optional.clientOrderRef, "client-order-ref-1");
  assert.equal(result.expectedSnapshot.expectedRecipientWalletAddress, "11111111111111111111111111111112");
});

test("fails explicitly when recipient wallet is invalid", () => {
  const result = validateStreamflowPayloadSource(
    createValidSource({
      expectedRecipientWalletAddress: "not-a-wallet",
    }),
  );

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("Expected invalid wallet validation to fail.");
  }

  assert.equal(result.issues[0]?.code, "invalid_wallet");
});

test("fails explicitly when mint is invalid", () => {
  const result = validateStreamflowPayloadSource(
    createValidSource({
      expectedMintAddress: "not-a-mint",
    }),
  );

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("Expected invalid mint validation to fail.");
  }

  assert.equal(result.issues[0]?.code, "invalid_mint");
});

test("fails explicitly when amount is zero", () => {
  const result = validateStreamflowPayloadSource(
    createValidSource({
      expectedAmountAtomic: BigInt(0),
    }),
  );

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("Expected invalid amount validation to fail.");
  }

  assert.equal(result.issues[0]?.code, "invalid_amount");
});

test("fails explicitly when schedule dates are invalid", () => {
  const result = validateStreamflowPayloadSource(
    createValidSource({
      expectedStartAt: new Date("2026-05-03T00:00:00.000Z"),
      expectedEndAt: new Date("2026-04-03T00:00:00.000Z"),
    }),
  );

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("Expected invalid schedule validation to fail.");
  }

  assert.equal(result.issues[0]?.code, "invalid_schedule_dates");
});

test("fails explicitly when client correlation id is missing", () => {
  const result = validateStreamflowPayloadSource(
    createValidSource({
      clientCorrelationId: null,
    }),
  );

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("Expected missing client correlation validation to fail.");
  }

  assert.equal(result.issues[0]?.code, "missing_client_correlation_id");
});

test("maps created schedules into persisted observed fields for later reconciliation", () => {
  const observed = toPersistedObservedSchedule({
    provider: "streamflow",
    scheduleId: "schedule-1",
    treasuryAddress: "treasury-1",
    escrowAddress: "escrow-1",
    beneficiaryAddress: "11111111111111111111111111111112",
    mintAddress: "11111111111111111111111111111113",
    amountAtomic: BigInt(1_000_000),
    startAt: new Date("2026-04-03T00:00:00.000Z"),
    endAt: new Date("2026-05-03T00:00:00.000Z"),
    vestingKind: "token_lock",
    txSignature: "tx-1",
    state: "created",
    createdAt: new Date("2026-04-03T00:15:00.000Z"),
  });

  assert.equal(observed.streamflowScheduleId, "schedule-1");
  assert.equal(observed.streamflowBeneficiaryAddress, "11111111111111111111111111111112");
  assert.equal(observed.streamflowObservedScheduleState, "created");
  assert.equal(observed.streamflowObservedCreationTxSignature, "tx-1");
});

test("maps search matches into persisted observed fields for later reconciliation", () => {
  const matchResult: Extract<StreamflowScheduleSearchResult, { state: "match_found" }> = {
    state: "match_found",
    matchedBy: "vesting_reference",
    scheduleId: "schedule-2",
    beneficiaryAddress: "11111111111111111111111111111112",
    mintAddress: "11111111111111111111111111111113",
    amountAtomic: BigInt(1_000_000),
    startAt: new Date("2026-04-03T00:00:00.000Z"),
    endAt: new Date("2026-05-03T00:00:00.000Z"),
    vestingKind: "token_lock",
    escrowAddress: "escrow-2",
    treasuryAddress: "treasury-2",
    txSignature: "tx-2",
    stateRaw: "created",
    detectedAt: new Date("2026-04-03T00:30:00.000Z"),
    searchedAt: new Date("2026-04-03T00:31:00.000Z"),
  };

  const observed = toPersistedObservedScheduleFromSearchMatch(matchResult);

  assert.equal(observed.streamflowScheduleId, "schedule-2");
  assert.equal(observed.streamflowEscrowAddress, "escrow-2");
  assert.equal(observed.streamflowObservedScheduleState, "created");
});
