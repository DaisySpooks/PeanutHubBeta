import "server-only";

import { Prisma, WithdrawalStatus } from "@prisma/client";
import { db } from "@/lib/db";

type WithdrawalUpdateData = Prisma.WithdrawalUpdateManyMutationInput;

export type SquadsReconciliationAttemptInput = {
  withdrawalId: string;
  attemptType: string;
  result: string;
  proposalState?: string | null;
  executionState?: string | null;
  txSignature?: string | null;
  matchedBy?: string | null;
  errorMessage?: string | null;
  detailsJson?: string | null;
};

export async function recordWithdrawalSquadsReconciliationAttempt(
  params: SquadsReconciliationAttemptInput,
) {
  return db.withdrawalSquadsReconciliationAttempt.create({
    data: {
      withdrawalId: params.withdrawalId,
      attemptType: params.attemptType,
      result: params.result,
      proposalState: params.proposalState ?? null,
      executionState: params.executionState ?? null,
      txSignature: params.txSignature ?? null,
      matchedBy: params.matchedBy ?? null,
      errorMessage: params.errorMessage ?? null,
      detailsJson: params.detailsJson ?? null,
    },
  });
}

export async function updateWithdrawalSquadsReconciliationState(params: {
  withdrawalId: string;
  expectedStatus?: WithdrawalStatus;
  data: WithdrawalUpdateData;
}) {
  const updated = await db.withdrawal.updateMany({
    where: {
      id: params.withdrawalId,
      ...(params.expectedStatus ? { status: params.expectedStatus } : {}),
    },
    data: params.data,
  });

  return updated.count === 1;
}

export async function checkpointSquadsProposalPoll(params: {
  withdrawalId: string;
  expectedStatus: WithdrawalStatus;
  checkedAt: Date;
  proposalState: string;
  nextReconcileAt: Date;
  detailsJson?: string | null;
}) {
  const updated = await updateWithdrawalSquadsReconciliationState({
    withdrawalId: params.withdrawalId,
    expectedStatus: params.expectedStatus,
    data: {
      lastReconciledAt: params.checkedAt,
      nextReconcileAt: params.nextReconcileAt,
      lastObservedProposalState: params.proposalState,
      reconcileAttemptCount: {
        increment: 1,
      },
      reconciliationFailureReason: null,
    },
  });

  if (updated) {
    await recordWithdrawalSquadsReconciliationAttempt({
      withdrawalId: params.withdrawalId,
      attemptType: "proposal_poll",
      result: "ok",
      proposalState: params.proposalState,
      detailsJson: params.detailsJson ?? null,
    });
  }

  return updated;
}

export async function recordSquadsExecutionDetection(params: {
  withdrawalId: string;
  expectedStatus: WithdrawalStatus;
  detectedAt: Date;
  detectionSource: string;
  proposalState: string;
  executionState: string;
  nextReconcileAt: Date;
  detailsJson?: string | null;
}) {
  const updated = await updateWithdrawalSquadsReconciliationState({
    withdrawalId: params.withdrawalId,
    expectedStatus: params.expectedStatus,
    data: {
      executionDetectedAt: params.detectedAt,
      executionDetectionSource: params.detectionSource,
      lastReconciledAt: params.detectedAt,
      nextReconcileAt: params.nextReconcileAt,
      lastObservedProposalState: params.proposalState,
      lastObservedExecutionState: params.executionState,
      reconcileAttemptCount: {
        increment: 1,
      },
      reconciliationFailureReason: null,
    },
  });

  if (updated) {
    await recordWithdrawalSquadsReconciliationAttempt({
      withdrawalId: params.withdrawalId,
      attemptType: "execution_detection",
      result: "detected",
      proposalState: params.proposalState,
      executionState: params.executionState,
      detailsJson: params.detailsJson ?? null,
    });
  }

  return updated;
}

export async function recordSquadsSignatureSearch(params: {
  withdrawalId: string;
  expectedStatus: WithdrawalStatus;
  searchedAt: Date;
  result: "not_found" | "match_found" | "ambiguous";
  proposalState?: string | null;
  executionState?: string | null;
  txSignature?: string | null;
  matchedBy?: string | null;
  nextReconcileAt: Date;
  errorMessage?: string | null;
  detailsJson?: string | null;
}) {
  const updateData: WithdrawalUpdateData = {
    lastSignatureSearchAt: params.searchedAt,
    signatureSearchAttemptCount: {
      increment: 1,
    },
    lastReconciledAt: params.searchedAt,
    nextReconcileAt: params.nextReconcileAt,
    ...(params.proposalState !== undefined ? { lastObservedProposalState: params.proposalState } : {}),
    ...(params.executionState !== undefined ? { lastObservedExecutionState: params.executionState } : {}),
    ...(params.errorMessage !== undefined ? { reconciliationFailureReason: params.errorMessage } : {}),
  };

  if (params.result === "ambiguous") {
    updateData.manualReviewRequired = true;
    updateData.manualReviewReason = "Multiple candidate execution signatures were found.";
  }

  const updated = await updateWithdrawalSquadsReconciliationState({
    withdrawalId: params.withdrawalId,
    expectedStatus: params.expectedStatus,
    data: updateData,
  });

  if (updated) {
    await recordWithdrawalSquadsReconciliationAttempt({
      withdrawalId: params.withdrawalId,
      attemptType: "signature_search",
      result: params.result,
      proposalState: params.proposalState ?? null,
      executionState: params.executionState ?? null,
      txSignature: params.txSignature ?? null,
      matchedBy: params.matchedBy ?? null,
      errorMessage: params.errorMessage ?? null,
      detailsJson: params.detailsJson ?? null,
    });
  }

  return updated;
}

export async function flagWithdrawalForManualReview(params: {
  withdrawalId: string;
  expectedStatus?: WithdrawalStatus;
  reason: string;
  proposalState?: string | null;
  executionState?: string | null;
  detailsJson?: string | null;
}) {
  const updated = await updateWithdrawalSquadsReconciliationState({
    withdrawalId: params.withdrawalId,
    expectedStatus: params.expectedStatus,
    data: {
      manualReviewRequired: true,
      manualReviewReason: params.reason,
    },
  });

  if (updated) {
    await recordWithdrawalSquadsReconciliationAttempt({
      withdrawalId: params.withdrawalId,
      attemptType: "manual_review",
      result: "flagged",
      proposalState: params.proposalState ?? null,
      executionState: params.executionState ?? null,
      errorMessage: params.reason,
      detailsJson: params.detailsJson ?? null,
    });
  }

  return updated;
}
