import { WithdrawalStatus } from "@prisma/client";

type RecordSignatureSearchParams = {
  withdrawalId: string;
  expectedStatus: WithdrawalStatus;
  searchedAt: Date;
  result: "ambiguous";
  proposalState: string;
  executionState: string;
  nextReconcileAt: Date;
  errorMessage: string;
  detailsJson: string;
};

type FlagManualReviewParams = {
  withdrawalId: string;
  expectedStatus: WithdrawalStatus;
  reason: string;
  proposalState: string;
  executionState: string;
  detailsJson: string;
};

type RecordPayoutEventParams = {
  withdrawalId: string;
  eventType: "signature-search-ambiguous";
  triggeredBy: string;
  proposalId: string;
  detailsJson: string;
};

export async function handleAmbiguousExecutionCandidates(params: {
  withdrawalId: string;
  expectedStatus: WithdrawalStatus;
  actor: string;
  proposalId: string;
  searchedAt: Date;
  proposalState: string;
  executionState: string;
  nextReconcileAt: Date;
  candidateTxSignatures: string[];
  searchErrorMessage: string;
  manualReviewReason: string;
  recordSignatureSearch: (params: RecordSignatureSearchParams) => Promise<unknown>;
  flagManualReview: (params: FlagManualReviewParams) => Promise<unknown>;
  recordPayoutEvent: (params: RecordPayoutEventParams) => Promise<unknown>;
}) {
  const detailsJson = JSON.stringify({
    candidateTxSignatures: params.candidateTxSignatures,
  });

  await params.recordSignatureSearch({
    withdrawalId: params.withdrawalId,
    expectedStatus: params.expectedStatus,
    searchedAt: params.searchedAt,
    result: "ambiguous",
    proposalState: params.proposalState,
    executionState: params.executionState,
    nextReconcileAt: params.nextReconcileAt,
    errorMessage: params.searchErrorMessage,
    detailsJson,
  });

  await params.flagManualReview({
    withdrawalId: params.withdrawalId,
    expectedStatus: params.expectedStatus,
    reason: params.manualReviewReason,
    proposalState: params.proposalState,
    executionState: params.executionState,
    detailsJson,
  });

  await params.recordPayoutEvent({
    withdrawalId: params.withdrawalId,
    eventType: "signature-search-ambiguous",
    triggeredBy: params.actor,
    proposalId: params.proposalId,
    detailsJson,
  });
}
