import type { SquadsPreparedPayout } from "./multisig-adapter";
import { recordPrepareMultisigWithdrawalFailure } from "./multisig-prepare-failure";

export class MultisigPreparationHashMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MultisigPreparationHashMismatchError";
  }
}

export async function finalizePreparedMultisigWithdrawal(params: {
  withdrawalId: string;
  jobId: string;
  actor: string;
  payoutReference: string;
  expectedPreparedInstructionHash: string;
  prepared: SquadsPreparedPayout;
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
  if (params.prepared.preparedInstructionHash !== params.expectedPreparedInstructionHash) {
    throw new MultisigPreparationHashMismatchError(
      `Prepared instruction hash mismatch for withdrawal ${params.withdrawalId}.`,
    );
  }

  await params.markAwaitingSignatures({
    withdrawalId: params.withdrawalId,
    jobId: params.jobId,
    triggeredBy: params.actor,
    payoutReference: params.payoutReference,
    multisigProvider: params.prepared.provider,
    multisigAccountAddress: params.prepared.multisigAccountAddress,
    multisigProposalId: params.prepared.proposalId,
    multisigProposalStatus: params.prepared.proposalStatus,
    squadsVaultIndex: params.prepared.vaultIndex,
    squadsTransactionIndex: params.prepared.transactionIndex,
    squadsTransactionPda: params.prepared.transactionPda,
    squadsProposalPda: params.prepared.proposalPda,
    preparedInstructionHash: params.prepared.preparedInstructionHash,
    preparedAt: params.prepared.preparedAt,
    nextReconcileAt: params.getNextReconcileAt(5),
    lastObservedProposalState: params.prepared.proposalStatus,
    note: `Prepared multisig proposal ${params.prepared.proposalId}.`,
  });

  await params.recordAttempt({
    withdrawalId: params.withdrawalId,
    attemptType: "proposal_prepare",
    result: "created",
    proposalState: params.prepared.proposalStatus,
    detailsJson: JSON.stringify({
      payoutReference: params.payoutReference,
      multisigAccountAddress: params.prepared.multisigAccountAddress,
      vaultIndex: params.prepared.vaultIndex,
      transactionIndex: params.prepared.transactionIndex,
      transactionPda: params.prepared.transactionPda,
      proposalPda: params.prepared.proposalPda,
      preparedInstructionHash: params.prepared.preparedInstructionHash,
    }),
  });

  await params.recordEvent({
    withdrawalId: params.withdrawalId,
    eventType: "proposal-created",
    triggeredBy: params.actor,
    proposalId: params.prepared.proposalId,
    detailsJson: JSON.stringify({
      payoutReference: params.payoutReference,
      proposalStatus: params.prepared.proposalStatus,
      preparedInstructionHash: params.prepared.preparedInstructionHash,
      vaultIndex: params.prepared.vaultIndex,
      transactionIndex: params.prepared.transactionIndex,
      transactionPda: params.prepared.transactionPda,
      proposalPda: params.prepared.proposalPda,
    }),
  });

  return {
    outcome: "awaiting_signatures" as const,
    withdrawalId: params.withdrawalId,
    proposalId: params.prepared.proposalId,
  };
}

export async function finalizePreparedMultisigWithdrawalWithFailureAudit(params: {
  withdrawalId: string;
  jobId: string;
  actor: string;
  payoutReference: string;
  recipientWalletAddress: string;
  mintAddress: string;
  netAmountAtomic: bigint;
  expectedPreparedInstructionHash: string;
  prepared: SquadsPreparedPayout;
  markAwaitingSignatures: Parameters<typeof finalizePreparedMultisigWithdrawal>[0]["markAwaitingSignatures"];
  recordAttempt: Parameters<typeof finalizePreparedMultisigWithdrawal>[0]["recordAttempt"];
  recordEvent: Parameters<typeof finalizePreparedMultisigWithdrawal>[0]["recordEvent"];
  getNextReconcileAt: Parameters<typeof finalizePreparedMultisigWithdrawal>[0]["getNextReconcileAt"];
}) {
  try {
    return await finalizePreparedMultisigWithdrawal({
      withdrawalId: params.withdrawalId,
      jobId: params.jobId,
      actor: params.actor,
      payoutReference: params.payoutReference,
      expectedPreparedInstructionHash: params.expectedPreparedInstructionHash,
      prepared: params.prepared,
      markAwaitingSignatures: params.markAwaitingSignatures,
      recordAttempt: params.recordAttempt,
      recordEvent: params.recordEvent,
      getNextReconcileAt: params.getNextReconcileAt,
    });
  } catch (error) {
    await recordPrepareMultisigWithdrawalFailure({
      withdrawalId: params.withdrawalId,
      actor: params.actor,
      payoutReference: params.payoutReference,
      preparedInstructionHash: params.expectedPreparedInstructionHash,
      recipientWalletAddress: params.recipientWalletAddress,
      mintAddress: params.mintAddress,
      netAmountAtomic: params.netAmountAtomic,
      error,
      recordAttempt: params.recordAttempt,
      recordEvent: params.recordEvent,
    });

    throw error;
  }
}
