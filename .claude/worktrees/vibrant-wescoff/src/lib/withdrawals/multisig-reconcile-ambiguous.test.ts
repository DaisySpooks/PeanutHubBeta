import assert from "node:assert/strict";
import test from "node:test";
import { WithdrawalStatus } from "@prisma/client";
import { handleAmbiguousExecutionCandidates } from "./multisig-reconcile-ambiguous";

test("records signature-search ambiguity, flags manual review, and emits an ambiguity event", async () => {
  const signatureSearches: Array<Record<string, unknown>> = [];
  const manualReviews: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];

  await handleAmbiguousExecutionCandidates({
    withdrawalId: "withdrawal-1",
    expectedStatus: WithdrawalStatus.AWAITING_SIGNATURES,
    actor: "test-actor",
    proposalId: "proposal-1",
    searchedAt: new Date("2026-04-03T01:00:00.000Z"),
    proposalState: "approved",
    executionState: "ambiguous",
    nextReconcileAt: new Date("2026-04-03T01:02:00.000Z"),
    candidateTxSignatures: ["sig-1", "sig-2"],
    searchErrorMessage: "Multiple candidate execution signatures were found during reconciliation.",
    manualReviewReason: "Multiple candidate execution signatures were found for this Squads payout.",
    async recordSignatureSearch(params) {
      signatureSearches.push(params as Record<string, unknown>);
    },
    async flagManualReview(params) {
      manualReviews.push(params as Record<string, unknown>);
    },
    async recordPayoutEvent(params) {
      events.push(params as Record<string, unknown>);
    },
  });

  assert.equal(signatureSearches.length, 1);
  assert.equal(manualReviews.length, 1);
  assert.equal(events.length, 1);
  assert.equal(signatureSearches[0]?.result, "ambiguous");
  assert.equal(signatureSearches[0]?.errorMessage, "Multiple candidate execution signatures were found during reconciliation.");
  assert.equal(manualReviews[0]?.reason, "Multiple candidate execution signatures were found for this Squads payout.");
  assert.equal(events[0]?.eventType, "signature-search-ambiguous");
  assert.equal(events[0]?.proposalId, "proposal-1");

  const searchDetails = JSON.parse(String(signatureSearches[0]?.detailsJson));
  const reviewDetails = JSON.parse(String(manualReviews[0]?.detailsJson));
  const eventDetails = JSON.parse(String(events[0]?.detailsJson));

  assert.deepEqual(searchDetails.candidateTxSignatures, ["sig-1", "sig-2"]);
  assert.deepEqual(reviewDetails.candidateTxSignatures, ["sig-1", "sig-2"]);
  assert.deepEqual(eventDetails.candidateTxSignatures, ["sig-1", "sig-2"]);
});

test("uses the same structured candidate signature payload for chain-search ambiguity", async () => {
  const signatureSearches: Array<Record<string, unknown>> = [];
  const manualReviews: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];

  await handleAmbiguousExecutionCandidates({
    withdrawalId: "withdrawal-2",
    expectedStatus: WithdrawalStatus.AWAITING_SIGNATURES,
    actor: "test-actor",
    proposalId: "proposal-2",
    searchedAt: new Date("2026-04-03T02:00:00.000Z"),
    proposalState: "execute_ready",
    executionState: "execution_suspected",
    nextReconcileAt: new Date("2026-04-03T02:02:00.000Z"),
    candidateTxSignatures: ["sig-3", "sig-4", "sig-5"],
    searchErrorMessage: "Multiple candidate execution signatures were found during chain search.",
    manualReviewReason: "Multiple candidate execution signatures were found during signature search.",
    async recordSignatureSearch(params) {
      signatureSearches.push(params as Record<string, unknown>);
    },
    async flagManualReview(params) {
      manualReviews.push(params as Record<string, unknown>);
    },
    async recordPayoutEvent(params) {
      events.push(params as Record<string, unknown>);
    },
  });

  assert.equal(signatureSearches[0]?.executionState, "execution_suspected");
  assert.equal(signatureSearches[0]?.errorMessage, "Multiple candidate execution signatures were found during chain search.");
  assert.equal(manualReviews[0]?.reason, "Multiple candidate execution signatures were found during signature search.");
  assert.equal(events[0]?.eventType, "signature-search-ambiguous");

  const eventDetails = JSON.parse(String(events[0]?.detailsJson));
  assert.deepEqual(eventDetails.candidateTxSignatures, ["sig-3", "sig-4", "sig-5"]);
});
