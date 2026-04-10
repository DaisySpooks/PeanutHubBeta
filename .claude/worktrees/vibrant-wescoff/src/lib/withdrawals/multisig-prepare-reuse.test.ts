import assert from "node:assert/strict";
import test from "node:test";
import { reusePreparedMultisigWithdrawal } from "./multisig-prepare-reuse";

test("reuses an existing Squads proposal and emits the expected reconciliation attempt and payout event", async () => {
  const updates: Array<Record<string, unknown>> = [];
  const marks: Array<Record<string, unknown>> = [];
  const attempts: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];
  const preparedAt = new Date("2026-04-03T00:10:00.000Z");

  const result = await reusePreparedMultisigWithdrawal({
    withdrawalId: "withdrawal-1",
    jobId: "job-1",
    actor: "test-actor",
    payoutReference: "payout-ref-1",
    preparedAt,
    multisigProvider: "squads",
    multisigAccountAddress: "multisig-1",
    multisigProposalId: "proposal-1",
    multisigProposalStatus: "awaiting_signatures",
    squadsVaultIndex: 2,
    squadsTransactionIndex: "7",
    squadsTransactionPda: "transaction-pda-1",
    squadsProposalPda: "proposal-pda-1",
    preparedInstructionHash: "prepared-hash-1",
    async updateReconciliation(params) {
      updates.push(params as Record<string, unknown>);
    },
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
  assert.equal(updates.length, 1);
  assert.equal(marks.length, 1);
  assert.equal(attempts.length, 1);
  assert.equal(events.length, 1);

  assert.equal(updates[0]?.expectedStatus, "PROCESSING");
  assert.equal(updates[0]?.multisigProposalStatus, "awaiting_signatures");
  assert.equal(updates[0]?.lastReconciledAt, preparedAt);

  assert.equal(marks[0]?.multisigProposalId, "proposal-1");
  assert.equal(marks[0]?.multisigProposalStatus, "awaiting_signatures");
  assert.equal(
    marks[0]?.note,
    "Reused an existing multisig proposal while resuming PROCESSING withdrawal.",
  );

  assert.equal(attempts[0]?.attemptType, "proposal_prepare");
  assert.equal(attempts[0]?.result, "reused_existing");
  assert.equal(attempts[0]?.proposalState, "awaiting_signatures");
  const attemptDetails = JSON.parse(String(attempts[0]?.detailsJson));
  assert.equal(attemptDetails.payoutReference, "payout-ref-1");
  assert.equal(attemptDetails.squadsTransactionIndex, "7");

  assert.equal(events[0]?.eventType, "proposal-reused");
  assert.equal(events[0]?.triggeredBy, "test-actor");
  assert.equal(events[0]?.proposalId, "proposal-1");
  const eventDetails = JSON.parse(String(events[0]?.detailsJson));
  assert.equal(eventDetails.reusedFromStatus, "PROCESSING");
  assert.equal(eventDetails.squadsTransactionIndex, "7");
});

test("reuse path tolerates missing optional proposal metadata while still emitting audit records", async () => {
  const attempts: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];

  await reusePreparedMultisigWithdrawal({
    withdrawalId: "withdrawal-2",
    jobId: "job-2",
    actor: "test-actor",
    payoutReference: "payout-ref-2",
    preparedAt: new Date("2026-04-03T00:10:00.000Z"),
    multisigProvider: null,
    multisigAccountAddress: null,
    multisigProposalId: "proposal-2",
    multisigProposalStatus: "awaiting_signatures",
    squadsVaultIndex: null,
    squadsTransactionIndex: null,
    squadsTransactionPda: null,
    squadsProposalPda: null,
    preparedInstructionHash: null,
    async updateReconciliation() {},
    async markAwaitingSignatures() {},
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

  const attemptDetails = JSON.parse(String(attempts[0]?.detailsJson));
  const eventDetails = JSON.parse(String(events[0]?.detailsJson));

  assert.equal(attemptDetails.squadsTransactionIndex, null);
  assert.equal(eventDetails.squadsTransactionIndex, null);
});
