import { WithdrawalStatus } from "@prisma/client";

export async function reusePreparedMultisigWithdrawal(params: {
  withdrawalId: string;
  jobId: string;
  actor: string;
  payoutReference: string;
  preparedAt: Date;
  multisigProvider: string | null;
  multisigAccountAddress: string | null;
  multisigProposalId: string;
  multisigProposalStatus: string;
  squadsVaultIndex?: number | null;
  squadsTransactionIndex?: string | null;
  squadsTransactionPda?: string | null;
  squadsProposalPda?: string | null;
  preparedInstructionHash?: string | null;
  updateReconciliation: (params: {
    withdrawalId: string;
    expectedStatus: WithdrawalStatus;
    lastReconciledAt: Date;
    multisigProposalStatus: string;
    nextReconcileAt: Date;
    lastObservedProposalState: string;
  }) => Promise<unknown>;
  markAwaitingSignatures: (params: {
    withdrawalId: string;
    jobId: string;
    triggeredBy: string;
    payoutReference: string;
    multisigProvider: string | null;
    multisigAccountAddress: string | null;
    multisigProposalId: string;
    multisigProposalStatus: string;
    squadsVaultIndex?: number | null;
    squadsTransactionIndex?: string | null;
    squadsTransactionPda?: string | null;
    squadsProposalPda?: string | null;
    preparedInstructionHash: string | null;
    preparedAt: Date;
    nextReconcileAt?: Date | null;
    lastObservedProposalState?: string | null;
    note: string;
  }) => Promise<unknown>;
  recordAttempt: (params: {
    withdrawalId: string;
    attemptType: string;
    result: string;
    proposalState?: string | null;
    detailsJson?: string | null;
  }) => Promise<unknown>;
  recordEvent: (params: {
    withdrawalId: string;
    eventType: string;
    triggeredBy: string;
    proposalId?: string | null;
    detailsJson?: string | null;
  }) => Promise<unknown>;
  getNextReconcileAt: (minutesFromNow: number) => Date;
}) {
  const nextReconcileAt = params.getNextReconcileAt(5);

  await params.updateReconciliation({
    withdrawalId: params.withdrawalId,
    expectedStatus: WithdrawalStatus.PROCESSING,
    lastReconciledAt: params.preparedAt,
    multisigProposalStatus: params.multisigProposalStatus,
    nextReconcileAt,
    lastObservedProposalState: params.multisigProposalStatus,
  });

  await params.markAwaitingSignatures({
    withdrawalId: params.withdrawalId,
    jobId: params.jobId,
    triggeredBy: params.actor,
    payoutReference: params.payoutReference,
    multisigProvider: params.multisigProvider,
    multisigAccountAddress: params.multisigAccountAddress,
    multisigProposalId: params.multisigProposalId,
    multisigProposalStatus: params.multisigProposalStatus,
    squadsVaultIndex: params.squadsVaultIndex,
    squadsTransactionIndex: params.squadsTransactionIndex,
    squadsTransactionPda: params.squadsTransactionPda,
    squadsProposalPda: params.squadsProposalPda,
    preparedInstructionHash: params.preparedInstructionHash ?? null,
    preparedAt: params.preparedAt,
    nextReconcileAt,
    lastObservedProposalState: params.multisigProposalStatus,
    note: "Reused an existing multisig proposal while resuming PROCESSING withdrawal.",
  });

  await params.recordAttempt({
    withdrawalId: params.withdrawalId,
    attemptType: "proposal_prepare",
    result: "reused_existing",
    proposalState: params.multisigProposalStatus,
    detailsJson: JSON.stringify({
      payoutReference: params.payoutReference,
      squadsTransactionIndex: params.squadsTransactionIndex ?? null,
    }),
  });

  await params.recordEvent({
    withdrawalId: params.withdrawalId,
    eventType: "proposal-reused",
    triggeredBy: params.actor,
    proposalId: params.multisigProposalId,
    detailsJson: JSON.stringify({
      reusedFromStatus: "PROCESSING",
      squadsTransactionIndex: params.squadsTransactionIndex ?? null,
    }),
  });

  return {
    outcome: "awaiting_signatures" as const,
    withdrawalId: params.withdrawalId,
    proposalId: params.multisigProposalId,
  };
}
