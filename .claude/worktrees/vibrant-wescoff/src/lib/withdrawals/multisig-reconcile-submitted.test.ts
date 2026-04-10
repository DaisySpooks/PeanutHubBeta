import assert from "node:assert/strict";
import test from "node:test";
import {
  handleSubmittedPayoutConfirmation,
  SubmittedConfirmationSignatureMismatchError,
} from "./multisig-reconcile-submitted";

test("records pending submission confirmation and emits the pending-confirmation event", async () => {
  const updates: Array<Record<string, unknown>> = [];
  const attempts: Array<Record<string, unknown>> = [];
  const completions: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];

  const result = await handleSubmittedPayoutConfirmation({
    withdrawalId: "withdrawal-1",
    actor: "test-actor",
    proposalId: "proposal-1",
    submittedTxSignature: "sig-1",
    status: {
      state: "submitted",
      txSignature: "sig-1",
      proposalStatus: "executed",
      lastCheckedAt: new Date("2026-04-03T07:00:00.000Z"),
    },
    nextReconcileAt: new Date("2026-04-03T07:01:00.000Z"),
    async updateReconciliation(params) {
      updates.push(params as Record<string, unknown>);
    },
    async recordAttempt(params) {
      attempts.push(params as Record<string, unknown>);
    },
    async completeSubmitted(params) {
      completions.push(params as Record<string, unknown>);
    },
    async recordEvent(params) {
      events.push(params as Record<string, unknown>);
    },
  });

  assert.equal(result.outcome, "submitted");
  assert.equal(updates.length, 1);
  assert.equal(attempts.length, 1);
  assert.equal(completions.length, 0);
  assert.equal(events.length, 1);
  assert.equal(updates[0]?.lastObservedExecutionState, "submitted");
  assert.equal(updates[0]?.reconciliationFailureReason, null);
  assert.equal(attempts[0]?.attemptType, "submission_confirmation");
  assert.equal(attempts[0]?.result, "pending");
  assert.equal(attempts[0]?.executionState, "submitted");
  assert.equal(events[0]?.eventType, "submission-pending-confirmation");
  assert.equal(events[0]?.txSignature, "sig-1");

  const eventDetails = JSON.parse(String(events[0]?.detailsJson));
  assert.equal(eventDetails.proposalStatus, "executed");
});

test("records confirmed submission confirmation, completes the withdrawal, and emits the confirmed event", async () => {
  const updates: Array<Record<string, unknown>> = [];
  const attempts: Array<Record<string, unknown>> = [];
  const completions: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];

  const result = await handleSubmittedPayoutConfirmation({
    withdrawalId: "withdrawal-2",
    actor: "test-actor",
    proposalId: "proposal-2",
    submittedTxSignature: "sig-2",
    status: {
      state: "confirmed",
      txSignature: "sig-2",
      confirmedAt: new Date("2026-04-03T08:00:00.000Z"),
      proposalStatus: "executed",
      lastCheckedAt: new Date("2026-04-03T08:01:00.000Z"),
    },
    nextReconcileAt: null,
    async updateReconciliation(params) {
      updates.push(params as Record<string, unknown>);
    },
    async recordAttempt(params) {
      attempts.push(params as Record<string, unknown>);
    },
    async completeSubmitted(params) {
      completions.push(params as Record<string, unknown>);
    },
    async recordEvent(params) {
      events.push(params as Record<string, unknown>);
    },
  });

  assert.equal(result.outcome, "completed");
  assert.equal(updates.length, 1);
  assert.equal(attempts.length, 1);
  assert.equal(completions.length, 1);
  assert.equal(events.length, 1);
  assert.equal(updates[0]?.lastObservedExecutionState, "confirmed");
  assert.equal(updates[0]?.nextReconcileAt, null);
  assert.equal(attempts[0]?.result, "confirmed");
  assert.equal(attempts[0]?.executionState, "confirmed");
  assert.equal(completions[0]?.submittedTxSignature, "sig-2");
  assert.equal(completions[0]?.lastObservedExecutionState, "confirmed");
  assert.equal(events[0]?.eventType, "submission-confirmed");
  assert.equal(events[0]?.txSignature, "sig-2");

  const eventDetails = JSON.parse(String(events[0]?.detailsJson));
  assert.equal(eventDetails.proposalStatus, "executed");
  assert.equal(eventDetails.confirmedAt, "2026-04-03T08:00:00.000Z");
});

test("refuses confirmation when the adapter returns a different tx signature than the stored submitted signature", async () => {
  const updates: Array<Record<string, unknown>> = [];
  const attempts: Array<Record<string, unknown>> = [];
  const completions: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];

  await assert.rejects(
    () =>
      handleSubmittedPayoutConfirmation({
        withdrawalId: "withdrawal-3",
        actor: "test-actor",
        proposalId: "proposal-3",
        submittedTxSignature: "sig-stored",
        status: {
          state: "confirmed",
          txSignature: "sig-returned",
          confirmedAt: new Date("2026-04-03T09:00:00.000Z"),
          proposalStatus: "executed",
          lastCheckedAt: new Date("2026-04-03T09:01:00.000Z"),
        },
        nextReconcileAt: null,
        async updateReconciliation(params) {
          updates.push(params as Record<string, unknown>);
        },
        async recordAttempt(params) {
          attempts.push(params as Record<string, unknown>);
        },
        async completeSubmitted(params) {
          completions.push(params as Record<string, unknown>);
        },
        async recordEvent(params) {
          events.push(params as Record<string, unknown>);
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof SubmittedConfirmationSignatureMismatchError);
      assert.match(
        String((error as Error).message),
        /returned transaction sig-returned, but Nut Reserve is tracking sig-stored/i,
      );
      return true;
    },
  );

  assert.equal(updates.length, 0);
  assert.equal(attempts.length, 0);
  assert.equal(completions.length, 0);
  assert.equal(events.length, 0);
});
