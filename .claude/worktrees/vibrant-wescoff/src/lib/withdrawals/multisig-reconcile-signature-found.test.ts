import assert from "node:assert/strict";
import test from "node:test";
import { handleDetectedExecutionSignature } from "./multisig-reconcile-signature-found";

test("records execution detection, signature search, submission transition, and payout event for a direct signature_found match", async () => {
  const detections: Array<Record<string, unknown>> = [];
  const searches: Array<Record<string, unknown>> = [];
  const submissions: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];

  await handleDetectedExecutionSignature({
    withdrawalId: "withdrawal-1",
    actor: "test-actor",
    proposalId: "proposal-1",
    proposalState: "executed",
    executionState: "signature_found",
    txSignature: "sig-1",
    matchedBy: "memo",
    detectionSource: "event",
    detectedAt: new Date("2026-04-03T05:00:00.000Z"),
    searchedAt: new Date("2026-04-03T05:01:00.000Z"),
    nextReconcileAt: new Date("2026-04-03T05:02:00.000Z"),
    note: "Captured execution signature sig-1 for multisig proposal proposal-1.",
    async recordExecutionDetection(params) {
      detections.push(params as Record<string, unknown>);
    },
    async recordSignatureSearch(params) {
      searches.push(params as Record<string, unknown>);
    },
    async markSubmitted(params) {
      submissions.push(params as Record<string, unknown>);
    },
    async recordPayoutEvent(params) {
      events.push(params as Record<string, unknown>);
    },
  });

  assert.equal(detections.length, 1);
  assert.equal(searches.length, 1);
  assert.equal(submissions.length, 1);
  assert.equal(events.length, 1);

  assert.equal(detections[0]?.detectionSource, "event");
  assert.equal(detections[0]?.proposalState, "executed");
  assert.equal(detections[0]?.executionState, "signature_found");
  assert.equal(searches[0]?.result, "match_found");
  assert.equal(searches[0]?.txSignature, "sig-1");
  assert.equal(searches[0]?.matchedBy, "memo");
  assert.equal(submissions[0]?.proposalId, "proposal-1");
  assert.equal(submissions[0]?.submittedTxSignature, "sig-1");
  assert.equal(submissions[0]?.executionDetectionSource, "event");
  assert.equal(submissions[0]?.lastObservedExecutionState, "signature_found");
  assert.equal(events[0]?.eventType, "signature-captured");
  assert.equal(events[0]?.txSignature, "sig-1");

  const detectionDetails = JSON.parse(String(detections[0]?.detailsJson));
  const eventDetails = JSON.parse(String(events[0]?.detailsJson));

  assert.equal(detectionDetails.txSignature, "sig-1");
  assert.equal(detectionDetails.matchedBy, "memo");
  assert.equal(eventDetails.proposalStatus, "executed");
  assert.equal(eventDetails.matchedBy, "memo");
  assert.equal(eventDetails.detectionSource, "event");
});

test("preserves instruction-hash matches and chain-search detection source in the captured-signature trail", async () => {
  const detections: Array<Record<string, unknown>> = [];
  const searches: Array<Record<string, unknown>> = [];
  const submissions: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];

  await handleDetectedExecutionSignature({
    withdrawalId: "withdrawal-2",
    actor: "test-actor",
    proposalId: "proposal-2",
    proposalState: "ready_for_execution",
    executionState: "execution_suspected",
    txSignature: "sig-2",
    matchedBy: "instruction_hash",
    detectionSource: "chain_search",
    detectedAt: new Date("2026-04-03T06:00:00.000Z"),
    searchedAt: new Date("2026-04-03T06:01:00.000Z"),
    nextReconcileAt: new Date("2026-04-03T06:02:00.000Z"),
    note: "Multisig proposal proposal-2 produced transaction sig-2.",
    async recordExecutionDetection(params) {
      detections.push(params as Record<string, unknown>);
    },
    async recordSignatureSearch(params) {
      searches.push(params as Record<string, unknown>);
    },
    async markSubmitted(params) {
      submissions.push(params as Record<string, unknown>);
    },
    async recordPayoutEvent(params) {
      events.push(params as Record<string, unknown>);
    },
  });

  assert.equal(detections[0]?.executionState, "execution_suspected");
  assert.equal(searches[0]?.matchedBy, "instruction_hash");
  assert.equal(submissions[0]?.executionDetectionSource, "chain_search");
  assert.equal(submissions[0]?.lastObservedExecutionState, "execution_suspected");

  const eventDetails = JSON.parse(String(events[0]?.detailsJson));
  assert.equal(eventDetails.matchedBy, "instruction_hash");
  assert.equal(eventDetails.detectionSource, "chain_search");
});
