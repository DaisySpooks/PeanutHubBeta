import { WithdrawalStatus } from "@prisma/client";

export class SubmittedConfirmationSignatureMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubmittedConfirmationSignatureMismatchError";
  }
}

type UpdateReconciliationParams = {
  withdrawalId: string;
  expectedStatus: WithdrawalStatus;
  lastReconciledAt: Date;
  multisigProposalStatus: string;
  nextReconcileAt: Date | null;
  lastObservedProposalState: string;
  lastObservedExecutionState: string;
  reconciliationFailureReason: string | null;
};

type RecordAttemptParams = {
  withdrawalId: string;
  attemptType: "submission_confirmation";
  result: "pending" | "confirmed";
  proposalState: string;
  executionState: "submitted" | "confirmed";
  txSignature: string;
};

type CompleteSubmittedParams = {
  withdrawalId: string;
  triggeredBy: string;
  submittedTxSignature: string;
  confirmedAt: Date;
  lastObservedExecutionState: "confirmed";
  note: string;
};

type RecordEventParams = {
  withdrawalId: string;
  eventType: "submission-confirmed" | "submission-pending-confirmation";
  triggeredBy: string;
  proposalId: string;
  txSignature: string;
  detailsJson: string;
};

export async function handleSubmittedPayoutConfirmation(params: {
  withdrawalId: string;
  actor: string;
  proposalId: string;
  submittedTxSignature: string;
  status:
    | {
        state: "submitted";
        txSignature: string;
        proposalStatus: string;
        lastCheckedAt: Date;
      }
    | {
        state: "confirmed";
        txSignature: string;
        confirmedAt: Date;
        proposalStatus: string;
        lastCheckedAt: Date;
      };
  nextReconcileAt: Date | null;
  updateReconciliation: (params: UpdateReconciliationParams) => Promise<unknown>;
  recordAttempt: (params: RecordAttemptParams) => Promise<unknown>;
  completeSubmitted: (params: CompleteSubmittedParams) => Promise<unknown>;
  recordEvent: (params: RecordEventParams) => Promise<unknown>;
}) {
  if (params.status.txSignature !== params.submittedTxSignature) {
    throw new SubmittedConfirmationSignatureMismatchError(
      `Submitted payout confirmation returned transaction ${params.status.txSignature}, but Nut Reserve is tracking ${params.submittedTxSignature}.`,
    );
  }

  await params.updateReconciliation({
    withdrawalId: params.withdrawalId,
    expectedStatus: WithdrawalStatus.SUBMITTED,
    lastReconciledAt: params.status.lastCheckedAt,
    multisigProposalStatus: params.status.proposalStatus,
    nextReconcileAt: params.nextReconcileAt,
    lastObservedProposalState: params.status.proposalStatus,
    lastObservedExecutionState: params.status.state === "confirmed" ? "confirmed" : "submitted",
    reconciliationFailureReason: null,
  });

  await params.recordAttempt({
    withdrawalId: params.withdrawalId,
    attemptType: "submission_confirmation",
    result: params.status.state === "confirmed" ? "confirmed" : "pending",
    proposalState: params.status.proposalStatus,
    executionState: params.status.state,
    txSignature: params.submittedTxSignature,
  });

  if (params.status.state === "confirmed") {
    await params.completeSubmitted({
      withdrawalId: params.withdrawalId,
      triggeredBy: params.actor,
      submittedTxSignature: params.status.txSignature,
      confirmedAt: params.status.confirmedAt,
      lastObservedExecutionState: "confirmed",
      note: `Confirmed submitted multisig transaction ${params.status.txSignature}.`,
    });

    await params.recordEvent({
      withdrawalId: params.withdrawalId,
      eventType: "submission-confirmed",
      triggeredBy: params.actor,
      proposalId: params.proposalId,
      txSignature: params.status.txSignature,
      detailsJson: JSON.stringify({
        confirmedAt: params.status.confirmedAt.toISOString(),
        proposalStatus: params.status.proposalStatus,
      }),
    });

    return { outcome: "completed" as const };
  }

  await params.recordEvent({
    withdrawalId: params.withdrawalId,
    eventType: "submission-pending-confirmation",
    triggeredBy: params.actor,
    proposalId: params.proposalId,
    txSignature: params.submittedTxSignature,
    detailsJson: JSON.stringify({
      proposalStatus: params.status.proposalStatus,
    }),
  });

  return { outcome: "submitted" as const };
}
