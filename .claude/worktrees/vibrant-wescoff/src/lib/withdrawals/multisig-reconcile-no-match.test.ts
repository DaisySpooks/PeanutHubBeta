import assert from "node:assert/strict";
import test from "node:test";
import { WithdrawalStatus } from "@prisma/client";
import { handleExecutionSignatureNotFound } from "./multisig-reconcile-no-match";

test("records a not-found signature search while preserving execution_suspected context", async () => {
  const signatureSearches: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];

  await handleExecutionSignatureNotFound({
    withdrawalId: "withdrawal-1",
    expectedStatus: WithdrawalStatus.AWAITING_SIGNATURES,
    actor: "test-actor",
    proposalId: "proposal-1",
    searchedAt: new Date("2026-04-03T03:00:00.000Z"),
    proposalState: "ready_for_execution",
    executionState: "execution_suspected",
    nextReconcileAt: new Date("2026-04-03T03:02:00.000Z"),
    async recordSignatureSearch(params) {
      signatureSearches.push(params as Record<string, unknown>);
    },
    async recordPayoutEvent(params) {
      events.push(params as Record<string, unknown>);
    },
  });

  assert.equal(signatureSearches.length, 1);
  assert.equal(events.length, 1);
  assert.equal(signatureSearches[0]?.result, "not_found");
  assert.equal(signatureSearches[0]?.proposalState, "ready_for_execution");
  assert.equal(signatureSearches[0]?.executionState, "execution_suspected");
  assert.equal(events[0]?.eventType, "signature-search-no-match");
  assert.equal(events[0]?.proposalId, "proposal-1");

  const eventDetails = JSON.parse(String(events[0]?.detailsJson));
  assert.equal(eventDetails.proposalState, "ready_for_execution");
  assert.equal(eventDetails.executionState, "execution_suspected");
  assert.equal(eventDetails.searchedAt, "2026-04-03T03:00:00.000Z");
});

test("emits a no-match event without escalating manual review on its own", async () => {
  const signatureSearches: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];

  await handleExecutionSignatureNotFound({
    withdrawalId: "withdrawal-2",
    expectedStatus: WithdrawalStatus.AWAITING_SIGNATURES,
    actor: "test-actor",
    proposalId: "proposal-2",
    searchedAt: new Date("2026-04-03T04:00:00.000Z"),
    proposalState: "approved",
    executionState: "execution_suspected",
    nextReconcileAt: new Date("2026-04-03T04:02:00.000Z"),
    async recordSignatureSearch(params) {
      signatureSearches.push(params as Record<string, unknown>);
    },
    async recordPayoutEvent(params) {
      events.push(params as Record<string, unknown>);
    },
  });

  assert.equal(signatureSearches.length, 1);
  assert.equal(events.length, 1);
  assert.equal(signatureSearches[0]?.result, "not_found");

  const eventDetails = JSON.parse(String(events[0]?.detailsJson));
  assert.equal(eventDetails.proposalState, "approved");
  assert.equal(eventDetails.executionState, "execution_suspected");
});
