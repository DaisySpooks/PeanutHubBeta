import assert from "node:assert/strict";
import test from "node:test";
import { WithdrawalStatus } from "@prisma/client";
import { classifyProcessingWithdrawalWorkerAction } from "./withdrawal-worker-processing-path";

const staleCutoff = new Date("2026-04-03T12:00:00.000Z");

test("classifies fully-submitted PROCESSING withdrawals as resumable payout work", () => {
  const action = classifyProcessingWithdrawalWorkerAction({
    status: WithdrawalStatus.PROCESSING,
    jobId: "job-1",
    multisigProposalId: null,
    solanaTxSignature: "sig-1",
    solanaTxBlockhash: "blockhash-1",
    solanaTxLastValidBlockHeight: BigInt(100),
    updatedAt: new Date("2026-04-03T12:30:00.000Z"),
    staleCutoff,
  });

  assert.equal(action, "resume_payout");
});

test("classifies old PROCESSING withdrawals without submission evidence as stale recovery work", () => {
  const action = classifyProcessingWithdrawalWorkerAction({
    status: WithdrawalStatus.PROCESSING,
    jobId: "job-2",
    multisigProposalId: null,
    solanaTxSignature: null,
    solanaTxBlockhash: null,
    solanaTxLastValidBlockHeight: null,
    updatedAt: new Date("2026-04-03T11:00:00.000Z"),
    staleCutoff,
  });

  assert.equal(action, "stale_recovery");
});

test("ignores PROCESSING withdrawals with partial submission metadata so the worker does not take the wrong path", () => {
  const action = classifyProcessingWithdrawalWorkerAction({
    status: WithdrawalStatus.PROCESSING,
    jobId: "job-3",
    multisigProposalId: null,
    solanaTxSignature: "sig-3",
    solanaTxBlockhash: null,
    solanaTxLastValidBlockHeight: null,
    updatedAt: new Date("2026-04-03T11:00:00.000Z"),
    staleCutoff,
  });

  assert.equal(action, "ignore");
});

test("ignores PROCESSING withdrawals already carrying a multisig proposal", () => {
  const action = classifyProcessingWithdrawalWorkerAction({
    status: WithdrawalStatus.PROCESSING,
    jobId: "job-4",
    multisigProposalId: "proposal-1",
    solanaTxSignature: null,
    solanaTxBlockhash: null,
    solanaTxLastValidBlockHeight: null,
    updatedAt: new Date("2026-04-03T11:00:00.000Z"),
    staleCutoff,
  });

  assert.equal(action, "ignore");
});

test("ignores conflicting PROCESSING withdrawals that have both a multisig proposal and full submitted transaction metadata", () => {
  const action = classifyProcessingWithdrawalWorkerAction({
    status: WithdrawalStatus.PROCESSING,
    jobId: "job-5",
    multisigProposalId: "proposal-2",
    solanaTxSignature: "sig-5",
    solanaTxBlockhash: "blockhash-5",
    solanaTxLastValidBlockHeight: BigInt(500),
    updatedAt: new Date("2026-04-03T11:00:00.000Z"),
    staleCutoff,
  });

  assert.equal(action, "ignore");
});
