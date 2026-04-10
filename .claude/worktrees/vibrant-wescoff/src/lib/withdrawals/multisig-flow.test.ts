import assert from "node:assert/strict";
import test from "node:test";
import { SquadsSourceAccountPreflightError } from "./squads-source-account-preflight";

test("records Squads preparation failure attempt and payout event with explicit error text", async () => {
  const attempts: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];
  const { recordPrepareMultisigWithdrawalFailure } = await import("./multisig-prepare-failure");

  await recordPrepareMultisigWithdrawalFailure({
    withdrawalId: "withdrawal-1",
    actor: "test-actor",
    payoutReference: "payout-ref-1",
    preparedInstructionHash: "prepared-hash-1",
    recipientWalletAddress: "recipient-wallet-1",
    mintAddress: "mint-1",
    netAmountAtomic: BigInt(1_000_000),
    error: new SquadsSourceAccountPreflightError(
      "Squads payout preparation cannot run because vault vault-1 does not have the required source token account source-ata-1 for mint mint-1.",
      {
        stage: "source_account_missing",
        vaultAddress: "vault-1",
        mintAddress: "mint-1",
        sourceAccountAddress: "source-ata-1",
        requiredAmountAtomic: "1000000",
        availableAmountAtomic: null,
      },
    ),
    async recordAttempt(params) {
      attempts.push(params as Record<string, unknown>);
    },
    async recordEvent(params) {
      events.push(params as Record<string, unknown>);
    },
  });

  assert.equal(attempts.length, 1);
  assert.equal(events.length, 1);
  assert.equal(attempts[0]?.attemptType, "proposal_prepare");
  assert.equal(attempts[0]?.result, "failed");
  assert.match(String(attempts[0]?.errorMessage), /does not have the required source token account/i);
  assert.equal(events[0]?.eventType, "proposal-prepare-failed");
  assert.equal(events[0]?.triggeredBy, "test-actor");

  const attemptDetails = JSON.parse(String(attempts[0]?.detailsJson));
  const eventDetails = JSON.parse(String(events[0]?.detailsJson));

  assert.equal(attemptDetails.payoutReference, "payout-ref-1");
  assert.equal(attemptDetails.preparedInstructionHash, "prepared-hash-1");
  assert.equal(attemptDetails.recipientWalletAddress, "recipient-wallet-1");
  assert.equal(attemptDetails.mintAddress, "mint-1");
  assert.equal(attemptDetails.netAmountAtomic, "1000000");
  assert.equal(attemptDetails.errorName, "SquadsSourceAccountPreflightError");
  assert.equal(attemptDetails.errorCategory, "source_account_preflight");
  assert.match(attemptDetails.errorMessage, /does not have the required source token account/i);
  assert.equal(attemptDetails.preflight.stage, "source_account_missing");
  assert.equal(attemptDetails.preflight.vaultAddress, "vault-1");
  assert.equal(attemptDetails.preflight.sourceAccountAddress, "source-ata-1");
  assert.equal(attemptDetails.preflight.requiredAmountAtomic, "1000000");
  assert.equal(attemptDetails.preflight.availableAmountAtomic, null);

  assert.equal(eventDetails.payoutReference, "payout-ref-1");
  assert.equal(eventDetails.preparedInstructionHash, "prepared-hash-1");
  assert.equal(eventDetails.errorName, "SquadsSourceAccountPreflightError");
  assert.equal(eventDetails.errorCategory, "source_account_preflight");
  assert.match(eventDetails.errorMessage, /does not have the required source token account/i);
  assert.equal(eventDetails.preflight.stage, "source_account_missing");
});

test("falls back to a stable generic message for non-Error preparation failures", async () => {
  const attempts: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];
  const { recordPrepareMultisigWithdrawalFailure } = await import("./multisig-prepare-failure");

  await recordPrepareMultisigWithdrawalFailure({
    withdrawalId: "withdrawal-2",
    actor: "test-actor",
    payoutReference: "payout-ref-2",
    preparedInstructionHash: "prepared-hash-2",
    recipientWalletAddress: "recipient-wallet-2",
    mintAddress: "mint-2",
    netAmountAtomic: BigInt(2_000_000),
    error: "not-an-error-object",
    async recordAttempt(params) {
      attempts.push(params as Record<string, unknown>);
    },
    async recordEvent(params) {
      events.push(params as Record<string, unknown>);
    },
  });

  const attemptDetails = JSON.parse(String(attempts[0]?.detailsJson));
  const eventDetails = JSON.parse(String(events[0]?.detailsJson));

  assert.equal(attempts[0]?.errorMessage, "Unknown multisig preparation error.");
  assert.equal(attemptDetails.errorMessage, "Unknown multisig preparation error.");
  assert.equal(attemptDetails.errorName, "UnknownError");
  assert.equal(attemptDetails.errorCategory, "unknown");
  assert.equal(attemptDetails.preflight, null);
  assert.equal(eventDetails.errorMessage, "Unknown multisig preparation error.");
  assert.equal(eventDetails.errorName, "UnknownError");
  assert.equal(eventDetails.errorCategory, "unknown");
  assert.equal(eventDetails.preflight, null);
});

test("records structured preflight details when the Squads source token account is underfunded", async () => {
  const attempts: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];
  const { recordPrepareMultisigWithdrawalFailure } = await import("./multisig-prepare-failure");

  await recordPrepareMultisigWithdrawalFailure({
    withdrawalId: "withdrawal-3",
    actor: "test-actor",
    payoutReference: "payout-ref-3",
    preparedInstructionHash: "prepared-hash-3",
    recipientWalletAddress: "recipient-wallet-3",
    mintAddress: "mint-3",
    netAmountAtomic: BigInt(2_000_000),
    error: new SquadsSourceAccountPreflightError(
      "Squads payout preparation cannot run because source token account source-ata-3 only holds 250000 atomic units for mint mint-3, but 2000000 are required.",
      {
        stage: "source_account_underfunded",
        vaultAddress: "vault-3",
        mintAddress: "mint-3",
        sourceAccountAddress: "source-ata-3",
        requiredAmountAtomic: "2000000",
        availableAmountAtomic: "250000",
      },
    ),
    async recordAttempt(params) {
      attempts.push(params as Record<string, unknown>);
    },
    async recordEvent(params) {
      events.push(params as Record<string, unknown>);
    },
  });

  assert.equal(attempts[0]?.errorMessage, "Squads payout preparation cannot run because source token account source-ata-3 only holds 250000 atomic units for mint mint-3, but 2000000 are required.");

  const attemptDetails = JSON.parse(String(attempts[0]?.detailsJson));
  const eventDetails = JSON.parse(String(events[0]?.detailsJson));

  assert.equal(attemptDetails.errorName, "SquadsSourceAccountPreflightError");
  assert.equal(attemptDetails.errorCategory, "source_account_preflight");
  assert.equal(attemptDetails.preflight.stage, "source_account_underfunded");
  assert.equal(attemptDetails.preflight.vaultAddress, "vault-3");
  assert.equal(attemptDetails.preflight.sourceAccountAddress, "source-ata-3");
  assert.equal(attemptDetails.preflight.requiredAmountAtomic, "2000000");
  assert.equal(attemptDetails.preflight.availableAmountAtomic, "250000");

  assert.equal(eventDetails.errorName, "SquadsSourceAccountPreflightError");
  assert.equal(eventDetails.errorCategory, "source_account_preflight");
  assert.equal(eventDetails.preflight.stage, "source_account_underfunded");
  assert.equal(eventDetails.preflight.availableAmountAtomic, "250000");
});
