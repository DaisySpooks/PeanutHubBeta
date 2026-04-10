import { WithdrawalStatus } from "@prisma/client";

type RecordSignatureSearchParams = {
  withdrawalId: string;
  expectedStatus: WithdrawalStatus;
  searchedAt: Date;
  result: "not_found";
  proposalState: string;
  executionState: string;
  nextReconcileAt: Date;
};

type RecordPayoutEventParams = {
  withdrawalId: string;
  eventType: "signature-search-no-match";
  triggeredBy: string;
  proposalId: string;
  detailsJson: string;
};

export async function handleExecutionSignatureNotFound(params: {
  withdrawalId: string;
  expectedStatus: WithdrawalStatus;
  actor: string;
  proposalId: string;
  searchedAt: Date;
  proposalState: string;
  executionState: string;
  nextReconcileAt: Date;
  recordSignatureSearch: (params: RecordSignatureSearchParams) => Promise<unknown>;
  recordPayoutEvent: (params: RecordPayoutEventParams) => Promise<unknown>;
}) {
  await params.recordSignatureSearch({
    withdrawalId: params.withdrawalId,
    expectedStatus: params.expectedStatus,
    searchedAt: params.searchedAt,
    result: "not_found",
    proposalState: params.proposalState,
    executionState: params.executionState,
    nextReconcileAt: params.nextReconcileAt,
  });

  await params.recordPayoutEvent({
    withdrawalId: params.withdrawalId,
    eventType: "signature-search-no-match",
    triggeredBy: params.actor,
    proposalId: params.proposalId,
    detailsJson: JSON.stringify({
      searchedAt: params.searchedAt.toISOString(),
      proposalState: params.proposalState,
      executionState: params.executionState,
    }),
  });
}
