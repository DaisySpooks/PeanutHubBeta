import { WithdrawalStatus } from "@prisma/client";

type RecordExecutionDetectionParams = {
  withdrawalId: string;
  expectedStatus: WithdrawalStatus;
  detectedAt: Date;
  detectionSource: string;
  proposalState: string;
  executionState: string;
  nextReconcileAt: Date;
  detailsJson: string;
};

type RecordSignatureSearchParams = {
  withdrawalId: string;
  expectedStatus: WithdrawalStatus;
  searchedAt: Date;
  result: "match_found";
  proposalState: string;
  executionState: string;
  txSignature: string;
  matchedBy: "memo" | "instruction_hash" | "transfer_tuple";
  nextReconcileAt: Date;
};

type MarkSubmittedParams = {
  withdrawalId: string;
  triggeredBy: string;
  proposalId: string;
  proposalStatus: string;
  submittedTxSignature: string;
  submittedAt: Date;
  executionDetectedAt: Date;
  executionDetectionSource: string;
  lastObservedProposalState: string;
  lastObservedExecutionState: string;
  note: string;
};

type RecordPayoutEventParams = {
  withdrawalId: string;
  eventType: "signature-captured";
  triggeredBy: string;
  proposalId: string;
  txSignature: string;
  detailsJson: string;
};

export async function handleDetectedExecutionSignature(params: {
  withdrawalId: string;
  actor: string;
  proposalId: string;
  proposalState: string;
  executionState: string;
  txSignature: string;
  matchedBy: "memo" | "instruction_hash" | "transfer_tuple";
  detectionSource: string;
  detectedAt: Date;
  searchedAt: Date;
  nextReconcileAt: Date;
  note: string;
  recordExecutionDetection: (params: RecordExecutionDetectionParams) => Promise<unknown>;
  recordSignatureSearch: (params: RecordSignatureSearchParams) => Promise<unknown>;
  markSubmitted: (params: MarkSubmittedParams) => Promise<unknown>;
  recordPayoutEvent: (params: RecordPayoutEventParams) => Promise<unknown>;
}) {
  const executionDetailsJson = JSON.stringify({
    txSignature: params.txSignature,
    matchedBy: params.matchedBy,
  });

  await params.recordExecutionDetection({
    withdrawalId: params.withdrawalId,
    expectedStatus: WithdrawalStatus.AWAITING_SIGNATURES,
    detectedAt: params.detectedAt,
    detectionSource: params.detectionSource,
    proposalState: params.proposalState,
    executionState: params.executionState,
    nextReconcileAt: params.nextReconcileAt,
    detailsJson: executionDetailsJson,
  });

  await params.recordSignatureSearch({
    withdrawalId: params.withdrawalId,
    expectedStatus: WithdrawalStatus.AWAITING_SIGNATURES,
    searchedAt: params.searchedAt,
    result: "match_found",
    proposalState: params.proposalState,
    executionState: params.executionState,
    txSignature: params.txSignature,
    matchedBy: params.matchedBy,
    nextReconcileAt: params.nextReconcileAt,
  });

  await params.markSubmitted({
    withdrawalId: params.withdrawalId,
    triggeredBy: params.actor,
    proposalId: params.proposalId,
    proposalStatus: params.proposalState,
    submittedTxSignature: params.txSignature,
    submittedAt: params.detectedAt,
    executionDetectedAt: params.detectedAt,
    executionDetectionSource: params.detectionSource,
    lastObservedProposalState: params.proposalState,
    lastObservedExecutionState: params.executionState,
    note: params.note,
  });

  await params.recordPayoutEvent({
    withdrawalId: params.withdrawalId,
    eventType: "signature-captured",
    triggeredBy: params.actor,
    proposalId: params.proposalId,
    txSignature: params.txSignature,
    detailsJson: JSON.stringify({
      proposalStatus: params.proposalState,
      matchedBy: params.matchedBy,
      detectionSource: params.detectionSource,
    }),
  });
}
