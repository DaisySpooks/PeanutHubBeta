import assert from "node:assert/strict";
import test from "node:test";
import {
  finalizePreparedMultisigWithdrawal,
  finalizePreparedMultisigWithdrawalWithFailureAudit,
  MultisigPreparationHashMismatchError,
} from "./multisig-prepare-success";

function createPreparedPayout() {
  return {
    provider: "squads" as const,
    multisigAccountAddress: "multisig-1",
    vaultIndex: 2,
    transactionIndex: "7",
    transactionPda: "transaction-pda-1",
    proposalPda: "proposal-pda-1",
    proposalId: "proposal-1",
    proposalStatus: "Active",
    preparedInstructionHash: "prepared-hash-1",
    preparedAt: new Date("2026-04-03T00:10:00.000Z"),
  };
}

test("finalizes a successful Squads preparation with awaiting-signatures update and audit records", async () => {
  const marks: Array<Record<string, unknown>> = [];
  const attempts: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];

  const result = await finalizePreparedMultisigWithdrawal({
    withdrawalId: "withdrawal-1",
    jobId: "job-1",
    actor: "test-actor",
    payoutReference: "payout-ref-1",
    expectedPreparedInstructionHash: "prepared-hash-1",
    prepared: createPreparedPayout(),
    async markAwaitingSignatures(params) {
      marks.push(params as Record<string, unknown>);
    },
    async recordAttempt(params) {
      attempts.push(params as Record<string, unknown>);
    },
    async recordEvent(params) {
      events.push(params as Record<string, unknown>);
    },
    getNextReconcileAt() {
      return new Date("2026-04-03T00:15:00.000Z");
    },
  });

  assert.equal(result.outcome, "awaiting_signatures");
  assert.equal(result.withdrawalId, "withdrawal-1");
  assert.equal(result.proposalId, "proposal-1");
  assert.equal(marks.length, 1);
  assert.equal(attempts.length, 1);
  assert.equal(events.length, 1);

  assert.equal(marks[0]?.multisigProposalId, "proposal-1");
  assert.equal(marks[0]?.multisigProposalStatus, "Active");
  assert.equal(marks[0]?.preparedInstructionHash, "prepared-hash-1");
  assert.equal(marks[0]?.nextReconcileAt instanceof Date, true);

  assert.equal(attempts[0]?.attemptType, "proposal_prepare");
  assert.equal(attempts[0]?.result, "created");
  assert.equal(attempts[0]?.proposalState, "Active");

  const attemptDetails = JSON.parse(String(attempts[0]?.detailsJson));
  assert.equal(attemptDetails.payoutReference, "payout-ref-1");
  assert.equal(attemptDetails.multisigAccountAddress, "multisig-1");
  assert.equal(attemptDetails.vaultIndex, 2);
  assert.equal(attemptDetails.transactionIndex, "7");
  assert.equal(attemptDetails.transactionPda, "transaction-pda-1");
  assert.equal(attemptDetails.proposalPda, "proposal-pda-1");
  assert.equal(attemptDetails.preparedInstructionHash, "prepared-hash-1");

  assert.equal(events[0]?.eventType, "proposal-created");
  assert.equal(events[0]?.triggeredBy, "test-actor");
  assert.equal(events[0]?.proposalId, "proposal-1");

  const eventDetails = JSON.parse(String(events[0]?.detailsJson));
  assert.equal(eventDetails.payoutReference, "payout-ref-1");
  assert.equal(eventDetails.proposalStatus, "Active");
  assert.equal(eventDetails.preparedInstructionHash, "prepared-hash-1");
});

test("refuses to finalize a prepared payout when the instruction hash does not match", async () => {
  await assert.rejects(
    () =>
      finalizePreparedMultisigWithdrawal({
        withdrawalId: "withdrawal-1",
        jobId: "job-1",
        actor: "test-actor",
        payoutReference: "payout-ref-1",
        expectedPreparedInstructionHash: "expected-hash",
        prepared: createPreparedPayout(),
        async markAwaitingSignatures() {
          throw new Error("Should not be called");
        },
        async recordAttempt() {
          throw new Error("Should not be called");
        },
        async recordEvent() {
          throw new Error("Should not be called");
        },
        getNextReconcileAt() {
          return new Date("2026-04-03T00:15:00.000Z");
        },
      }),
    MultisigPreparationHashMismatchError,
  );
});

test("records failure attempt and event when a prepared instruction hash mismatch is detected", async () => {
  const attempts: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];

  await assert.rejects(
    () =>
      finalizePreparedMultisigWithdrawalWithFailureAudit({
        withdrawalId: "withdrawal-2",
        jobId: "job-2",
        actor: "test-actor",
        payoutReference: "payout-ref-2",
        recipientWalletAddress: "recipient-wallet-2",
        mintAddress: "mint-2",
        netAmountAtomic: BigInt(2_000_000),
        expectedPreparedInstructionHash: "expected-hash",
        prepared: createPreparedPayout(),
        async markAwaitingSignatures() {
          throw new Error("Should not be called");
        },
        async recordAttempt(params) {
          attempts.push(params as Record<string, unknown>);
        },
        async recordEvent(params) {
          events.push(params as Record<string, unknown>);
        },
        getNextReconcileAt() {
          return new Date("2026-04-03T00:15:00.000Z");
        },
      }),
    MultisigPreparationHashMismatchError,
  );

  assert.equal(attempts.length, 1);
  assert.equal(events.length, 1);
  assert.equal(attempts[0]?.attemptType, "proposal_prepare");
  assert.equal(attempts[0]?.result, "failed");
  assert.equal(attempts[0]?.errorMessage, "Prepared instruction hash mismatch for withdrawal withdrawal-2.");
  assert.equal(events[0]?.eventType, "proposal-prepare-failed");

  const attemptDetails = JSON.parse(String(attempts[0]?.detailsJson));
  const eventDetails = JSON.parse(String(events[0]?.detailsJson));

  assert.equal(attemptDetails.errorName, "MultisigPreparationHashMismatchError");
  assert.equal(attemptDetails.errorCategory, "prepared_instruction_hash_mismatch");
  assert.equal(attemptDetails.preflight, null);
  assert.equal(eventDetails.errorName, "MultisigPreparationHashMismatchError");
  assert.equal(eventDetails.errorCategory, "prepared_instruction_hash_mismatch");
  assert.equal(eventDetails.preflight, null);
});
