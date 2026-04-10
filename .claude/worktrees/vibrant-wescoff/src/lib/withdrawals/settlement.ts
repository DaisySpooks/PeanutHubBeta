import { Prisma, VestingStatus, WithdrawalStatus } from "@prisma/client";
import { db } from "../db";
import { completeProcessingSettlementTransition } from "./withdrawal-settlement-complete";
import { recoverStaleProcessingTransition } from "./withdrawal-settlement-recover";
import { recordProcessingSubmission } from "./withdrawal-settlement-record-submission";
import { requeueFailedWithdrawal } from "./withdrawal-settlement-requeue";
import { replaceProcessingSubmissionRecord } from "./withdrawal-settlement-replace-submission";
import { deriveSettlementRollback } from "./withdrawal-settlement-rollback";

const SERIALIZABLE_RETRY_LIMIT = 3;

export class WithdrawalSettlementError extends Error {}

type SettlementDbClient = typeof db | Prisma.TransactionClient;

type SettlementWithdrawal = {
  id: string;
  vestingPositionId: string;
  grossAmount: bigint;
  status: WithdrawalStatus;
  jobId: string | null;
  payoutReference: string | null;
  multisigProvider: string | null;
  multisigAccountAddress: string | null;
  multisigProposalId: string | null;
  multisigProposalStatus: string | null;
  preparedInstructionHash: string | null;
  preparedAt: Date | null;
  submittedTxSignature: string | null;
  submittedAt: Date | null;
  confirmedAt: Date | null;
  cancelledAt: Date | null;
  lastReconciledAt: Date | null;
  recoveryLockId: string | null;
  recoveryLockedAt: Date | null;
  squadsVaultIndex: number | null;
  squadsTransactionIndex: string | null;
  squadsTransactionPda: string | null;
  squadsProposalPda: string | null;
  executionDetectedAt: Date | null;
  executionDetectionSource: string | null;
  nextReconcileAt: Date | null;
  reconcileAttemptCount: number;
  lastSignatureSearchAt: Date | null;
  signatureSearchAttemptCount: number;
  lastObservedProposalState: string | null;
  lastObservedExecutionState: string | null;
  reconciliationFailureReason: string | null;
  manualReviewRequired: boolean;
  manualReviewReason: string | null;
  solanaTxSignature: string | null;
  solanaTxBlockhash: string | null;
  solanaTxLastValidBlockHeight: bigint | null;
  failureReason: string | null;
  vestingPosition: {
    id: string;
    totalAmount: bigint;
    withdrawnAmount: bigint;
    unlockAt: Date;
    status: VestingStatus;
  };
};

function isSerializableConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  );
}

function buildFailureMessage(reason: string, stage: "processing" | "completion" | "failure") {
  const timestamp = new Date().toISOString();
  return `[${stage}] ${timestamp} ${reason}`.slice(0, 500);
}

async function recordWithdrawalTransitionAudit(
  dbClient: SettlementDbClient,
  params: {
    withdrawalId: string;
    triggeredBy: string;
    fromStatus: WithdrawalStatus;
    toStatus: WithdrawalStatus;
    note?: string;
  },
) {
  await dbClient.withdrawalTransitionAudit.create({
    data: {
      withdrawalId: params.withdrawalId,
      triggeredBy: params.triggeredBy,
      fromStatus: params.fromStatus,
      toStatus: params.toStatus,
      note: params.note,
    },
  });
}

async function loadWithdrawalForSettlement(
  dbClient: SettlementDbClient,
  withdrawalId: string,
): Promise<SettlementWithdrawal> {
  const withdrawal = await dbClient.withdrawal.findUnique({
    where: { id: withdrawalId },
    select: {
      id: true,
      vestingPositionId: true,
      grossAmount: true,
      status: true,
      jobId: true,
      payoutReference: true,
      multisigProvider: true,
      multisigAccountAddress: true,
      multisigProposalId: true,
      multisigProposalStatus: true,
      preparedInstructionHash: true,
      preparedAt: true,
      submittedTxSignature: true,
      submittedAt: true,
      confirmedAt: true,
      cancelledAt: true,
      lastReconciledAt: true,
      recoveryLockId: true,
      recoveryLockedAt: true,
      squadsVaultIndex: true,
      squadsTransactionIndex: true,
      squadsTransactionPda: true,
      squadsProposalPda: true,
      executionDetectedAt: true,
      executionDetectionSource: true,
      nextReconcileAt: true,
      reconcileAttemptCount: true,
      lastSignatureSearchAt: true,
      signatureSearchAttemptCount: true,
      lastObservedProposalState: true,
      lastObservedExecutionState: true,
      reconciliationFailureReason: true,
      manualReviewRequired: true,
      manualReviewReason: true,
      solanaTxSignature: true,
      solanaTxBlockhash: true,
      solanaTxLastValidBlockHeight: true,
      failureReason: true,
      vestingPosition: {
        select: {
          id: true,
          totalAmount: true,
          withdrawnAmount: true,
          unlockAt: true,
          status: true,
        },
      },
    },
  });

  if (!withdrawal) {
    throw new WithdrawalSettlementError("Withdrawal not found.");
  }

  return withdrawal;
}

async function updateSettlementReservationOnFailure(
  dbClient: SettlementDbClient,
  withdrawal: SettlementWithdrawal,
) {
  const { nextWithdrawnAmount, nextStatus } = deriveSettlementRollback({
    currentStatus: withdrawal.vestingPosition.status,
    unlockAt: withdrawal.vestingPosition.unlockAt,
    totalAmount: withdrawal.vestingPosition.totalAmount,
    withdrawnAmount: withdrawal.vestingPosition.withdrawnAmount,
    rollbackAmount: withdrawal.grossAmount,
  });

  await dbClient.vestingPosition.update({
    where: { id: withdrawal.vestingPosition.id },
    data: {
      withdrawnAmount: nextWithdrawnAmount,
      status: nextStatus,
    },
  });
}

export async function beginWithdrawalProcessing(
  withdrawalId: string,
  jobId: string,
  triggeredBy: string,
) {
  if (!jobId.trim()) {
    throw new WithdrawalSettlementError("A non-empty job id is required to begin processing.");
  }

  if (!triggeredBy.trim()) {
    throw new WithdrawalSettlementError("A non-empty triggeredBy value is required.");
  }

  for (let attempt = 1; attempt <= SERIALIZABLE_RETRY_LIMIT; attempt += 1) {
    try {
      return await db.$transaction(
        async (tx) => {
          const withdrawal = await loadWithdrawalForSettlement(tx, withdrawalId);

          if (withdrawal.status !== WithdrawalStatus.PENDING) {
            throw new WithdrawalSettlementError(
              `Withdrawal ${withdrawal.id} cannot move to PROCESSING from ${withdrawal.status}.`,
            );
          }

          const updated = await tx.withdrawal.updateMany({
            where: {
              id: withdrawal.id,
              status: WithdrawalStatus.PENDING,
            },
            data: {
              status: WithdrawalStatus.PROCESSING,
              jobId,
              failureReason: null,
            },
          });

          if (updated.count !== 1) {
            throw new WithdrawalSettlementError(
              `Withdrawal ${withdrawal.id} was already claimed for processing by another worker.`,
            );
          }

          await recordWithdrawalTransitionAudit(tx, {
            withdrawalId: withdrawal.id,
            triggeredBy,
            fromStatus: WithdrawalStatus.PENDING,
            toStatus: WithdrawalStatus.PROCESSING,
            note: `Claimed for processing under job ${jobId}.`,
          });

          return {
            id: withdrawal.id,
            status: WithdrawalStatus.PROCESSING,
            jobId,
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    } catch (error) {
      if (isSerializableConflict(error) && attempt < SERIALIZABLE_RETRY_LIMIT) {
        continue;
      }

      throw error;
    }
  }

  throw new WithdrawalSettlementError("Unable to begin withdrawal processing after multiple retries.");
}

export async function completeWithdrawalProcessing({
  withdrawalId,
  jobId,
  solanaTxSignature,
  solanaConfirmedAt = new Date(),
  triggeredBy,
}: {
  withdrawalId: string;
  jobId: string;
  solanaTxSignature: string;
  solanaConfirmedAt?: Date;
  triggeredBy: string;
}) {
  if (!jobId.trim()) {
    throw new WithdrawalSettlementError("A non-empty job id is required to complete processing.");
  }

  if (!solanaTxSignature.trim()) {
    throw new WithdrawalSettlementError("A Solana transaction signature is required to complete processing.");
  }

  if (!triggeredBy.trim()) {
    throw new WithdrawalSettlementError("A non-empty triggeredBy value is required.");
  }

  for (let attempt = 1; attempt <= SERIALIZABLE_RETRY_LIMIT; attempt += 1) {
    try {
      return await db.$transaction(
        async (tx) => {
          const withdrawal = await loadWithdrawalForSettlement(tx, withdrawalId);
          return completeProcessingSettlementTransition({
            withdrawalId: withdrawal.id,
            currentStatus: withdrawal.status,
            currentJobId: withdrawal.jobId,
            expectedJobId: jobId,
            solanaTxSignature,
            solanaConfirmedAt,
            triggeredBy,
            async updateCompletion() {
              const updated = await tx.withdrawal.updateMany({
                where: {
                  id: withdrawal.id,
                  status: WithdrawalStatus.PROCESSING,
                  jobId,
                },
                data: {
                  status: WithdrawalStatus.COMPLETED,
                  solanaTxSignature,
                  solanaConfirmedAt,
                  failureReason: null,
                },
              });

              return updated.count;
            },
            async recordTransitionAudit() {
              await recordWithdrawalTransitionAudit(tx, {
                withdrawalId: withdrawal.id,
                triggeredBy,
                fromStatus: WithdrawalStatus.PROCESSING,
                toStatus: WithdrawalStatus.COMPLETED,
                note: `Completed with Solana signature ${solanaTxSignature}.`,
              });
            },
            createError(message) {
              return new WithdrawalSettlementError(message);
            },
          });
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    } catch (error) {
      if (isSerializableConflict(error) && attempt < SERIALIZABLE_RETRY_LIMIT) {
        continue;
      }

      throw error;
    }
  }

  throw new WithdrawalSettlementError("Unable to complete withdrawal processing after multiple retries.");
}

export async function recordWithdrawalProcessingSubmission({
  withdrawalId,
  jobId,
  solanaTxSignature,
  solanaTxBlockhash,
  solanaTxLastValidBlockHeight,
}: {
  withdrawalId: string;
  jobId: string;
  solanaTxSignature: string;
  solanaTxBlockhash: string;
  solanaTxLastValidBlockHeight: bigint;
}) {
  if (!jobId.trim()) {
    throw new WithdrawalSettlementError("A non-empty job id is required to record a payout submission.");
  }

  if (!solanaTxSignature.trim()) {
    throw new WithdrawalSettlementError("A Solana transaction signature is required to record a payout submission.");
  }

  if (!solanaTxBlockhash.trim()) {
    throw new WithdrawalSettlementError("A Solana blockhash is required to record a payout submission.");
  }

  for (let attempt = 1; attempt <= SERIALIZABLE_RETRY_LIMIT; attempt += 1) {
    try {
      return await db.$transaction(
        async (tx) => {
          const withdrawal = await loadWithdrawalForSettlement(tx, withdrawalId);
          return recordProcessingSubmission({
            withdrawalId: withdrawal.id,
            currentStatus: withdrawal.status,
            currentJobId: withdrawal.jobId,
            expectedJobId: jobId,
            currentSolanaTxSignature: withdrawal.solanaTxSignature,
            currentSolanaTxBlockhash: withdrawal.solanaTxBlockhash,
            currentSolanaTxLastValidBlockHeight: withdrawal.solanaTxLastValidBlockHeight,
            solanaTxSignature,
            solanaTxBlockhash,
            solanaTxLastValidBlockHeight,
            async updateSubmission() {
              const updated = await tx.withdrawal.updateMany({
                where: {
                  id: withdrawal.id,
                  status: WithdrawalStatus.PROCESSING,
                  jobId,
                  solanaTxSignature: null,
                },
                data: {
                  solanaTxSignature,
                  solanaTxBlockhash,
                  solanaTxLastValidBlockHeight,
                  failureReason: null,
                },
              });

              return updated.count;
            },
            createError(message) {
              return new WithdrawalSettlementError(message);
            },
          });
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    } catch (error) {
      if (isSerializableConflict(error) && attempt < SERIALIZABLE_RETRY_LIMIT) {
        continue;
      }

      throw error;
    }
  }

  throw new WithdrawalSettlementError("Unable to record the payout submission after multiple retries.");
}

export async function replaceWithdrawalProcessingSubmission({
  withdrawalId,
  jobId,
  previousSolanaTxSignature,
  nextSolanaTxSignature,
  nextSolanaTxBlockhash,
  nextSolanaTxLastValidBlockHeight,
}: {
  withdrawalId: string;
  jobId: string;
  previousSolanaTxSignature: string;
  nextSolanaTxSignature: string;
  nextSolanaTxBlockhash: string;
  nextSolanaTxLastValidBlockHeight: bigint;
}) {
  if (!jobId.trim()) {
    throw new WithdrawalSettlementError("A non-empty job id is required to replace a payout submission.");
  }

  for (let attempt = 1; attempt <= SERIALIZABLE_RETRY_LIMIT; attempt += 1) {
    try {
      return await db.$transaction(
        async (tx) => {
          const withdrawal = await loadWithdrawalForSettlement(tx, withdrawalId);
          return replaceProcessingSubmissionRecord({
            withdrawalId: withdrawal.id,
            currentStatus: withdrawal.status,
            currentJobId: withdrawal.jobId,
            expectedJobId: jobId,
            currentSolanaTxSignature: withdrawal.solanaTxSignature,
            previousSolanaTxSignature,
            nextSolanaTxSignature,
            nextSolanaTxBlockhash,
            nextSolanaTxLastValidBlockHeight,
            async updateReplacement() {
              const updated = await tx.withdrawal.updateMany({
                where: {
                  id: withdrawal.id,
                  status: WithdrawalStatus.PROCESSING,
                  jobId,
                  solanaTxSignature: previousSolanaTxSignature,
                },
                data: {
                  solanaTxSignature: nextSolanaTxSignature,
                  solanaTxBlockhash: nextSolanaTxBlockhash,
                  solanaTxLastValidBlockHeight: nextSolanaTxLastValidBlockHeight,
                  failureReason: null,
                },
              });

              return updated.count;
            },
            createError(message) {
              return new WithdrawalSettlementError(message);
            },
          });
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    } catch (error) {
      if (isSerializableConflict(error) && attempt < SERIALIZABLE_RETRY_LIMIT) {
        continue;
      }

      throw error;
    }
  }

  throw new WithdrawalSettlementError("Unable to replace the payout submission after multiple retries.");
}

export async function recordWithdrawalProcessingFailure({
  withdrawalId,
  jobId,
  failureReason,
}: {
  withdrawalId: string;
  jobId: string;
  failureReason: string;
}) {
  if (!jobId.trim()) {
    throw new WithdrawalSettlementError("A non-empty job id is required to record a processing failure.");
  }

  if (!failureReason.trim()) {
    throw new WithdrawalSettlementError("A processing failure reason is required.");
  }

  const formattedReason = buildFailureMessage(failureReason.trim(), "processing");

  const updated = await db.withdrawal.updateMany({
    where: {
      id: withdrawalId,
      status: WithdrawalStatus.PROCESSING,
      jobId,
    },
    data: {
      failureReason: formattedReason,
    },
  });

  if (updated.count !== 1) {
    throw new WithdrawalSettlementError(
      `Withdrawal ${withdrawalId} could not persist its processing failure note because its processing claim changed.`,
    );
  }

  return {
    id: withdrawalId,
    failureReason: formattedReason,
  };
}

export async function markWithdrawalAwaitingSignatures(params: {
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
  manualReviewRequired?: boolean;
  manualReviewReason?: string | null;
  note: string;
}) {
  if (!params.jobId.trim()) {
    throw new WithdrawalSettlementError("A non-empty job id is required to move to AWAITING_SIGNATURES.");
  }

  if (!params.triggeredBy.trim()) {
    throw new WithdrawalSettlementError("A non-empty triggeredBy value is required.");
  }

  if (!params.payoutReference.trim()) {
    throw new WithdrawalSettlementError("A payout reference is required to move to AWAITING_SIGNATURES.");
  }

  if (!params.multisigProposalId.trim()) {
    throw new WithdrawalSettlementError("A multisig proposal id is required to move to AWAITING_SIGNATURES.");
  }

  for (let attempt = 1; attempt <= SERIALIZABLE_RETRY_LIMIT; attempt += 1) {
    try {
      return await db.$transaction(
        async (tx) => {
          const withdrawal = await loadWithdrawalForSettlement(tx, params.withdrawalId);

          if (withdrawal.status !== WithdrawalStatus.PROCESSING) {
            throw new WithdrawalSettlementError(
              `Withdrawal ${withdrawal.id} cannot move to AWAITING_SIGNATURES from ${withdrawal.status}.`,
            );
          }

          if (withdrawal.jobId !== params.jobId) {
            throw new WithdrawalSettlementError(
              `Withdrawal ${withdrawal.id} is owned by a different processing job.`,
            );
          }

          if (
            withdrawal.multisigProposalId &&
            withdrawal.multisigProposalId !== params.multisigProposalId
          ) {
            throw new WithdrawalSettlementError(
              `Withdrawal ${withdrawal.id} already has a different multisig proposal id.`,
            );
          }

          const updated = await tx.withdrawal.updateMany({
            where: {
              id: withdrawal.id,
              status: WithdrawalStatus.PROCESSING,
              jobId: params.jobId,
            },
            data: {
              status: WithdrawalStatus.AWAITING_SIGNATURES,
              payoutReference: params.payoutReference,
              multisigProvider: params.multisigProvider,
              multisigAccountAddress: params.multisigAccountAddress,
              multisigProposalId: params.multisigProposalId,
              multisigProposalStatus: params.multisigProposalStatus,
              squadsVaultIndex: params.squadsVaultIndex ?? null,
              squadsTransactionIndex: params.squadsTransactionIndex ?? null,
              squadsTransactionPda: params.squadsTransactionPda ?? null,
              squadsProposalPda: params.squadsProposalPda ?? null,
              preparedInstructionHash: params.preparedInstructionHash,
              preparedAt: params.preparedAt,
              lastReconciledAt: params.preparedAt,
              nextReconcileAt: params.nextReconcileAt ?? params.preparedAt,
              lastObservedProposalState:
                params.lastObservedProposalState ?? params.multisigProposalStatus,
              manualReviewRequired: params.manualReviewRequired ?? false,
              manualReviewReason: params.manualReviewReason ?? null,
              reconciliationFailureReason: null,
              failureReason: null,
              recoveryLockId: null,
              recoveryLockedAt: null,
            },
          });

          if (updated.count !== 1) {
            throw new WithdrawalSettlementError(
              `Withdrawal ${withdrawal.id} could not move to AWAITING_SIGNATURES because its processing claim changed.`,
            );
          }

          await recordWithdrawalTransitionAudit(tx, {
            withdrawalId: withdrawal.id,
            triggeredBy: params.triggeredBy,
            fromStatus: WithdrawalStatus.PROCESSING,
            toStatus: WithdrawalStatus.AWAITING_SIGNATURES,
            note: params.note,
          });

          return {
            id: withdrawal.id,
            status: WithdrawalStatus.AWAITING_SIGNATURES,
            multisigProposalId: params.multisigProposalId,
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    } catch (error) {
      if (isSerializableConflict(error) && attempt < SERIALIZABLE_RETRY_LIMIT) {
        continue;
      }

      throw error;
    }
  }

  throw new WithdrawalSettlementError("Unable to move withdrawal to AWAITING_SIGNATURES after multiple retries.");
}

export async function updateWithdrawalMultisigReconciliation(params: {
  withdrawalId: string;
  expectedStatus: WithdrawalStatus;
  lastReconciledAt: Date;
  multisigProposalStatus?: string | null;
  nextReconcileAt?: Date | null;
  lastObservedProposalState?: string | null;
  lastObservedExecutionState?: string | null;
  executionDetectedAt?: Date | null;
  executionDetectionSource?: string | null;
  reconciliationFailureReason?: string | null;
  manualReviewRequired?: boolean;
  manualReviewReason?: string | null;
}) {
  const updated = await db.withdrawal.updateMany({
    where: {
      id: params.withdrawalId,
      status: params.expectedStatus,
    },
    data: {
      lastReconciledAt: params.lastReconciledAt,
      ...(params.multisigProposalStatus !== undefined
        ? { multisigProposalStatus: params.multisigProposalStatus }
        : {}),
      ...(params.nextReconcileAt !== undefined ? { nextReconcileAt: params.nextReconcileAt } : {}),
      ...(params.lastObservedProposalState !== undefined
        ? { lastObservedProposalState: params.lastObservedProposalState }
        : {}),
      ...(params.lastObservedExecutionState !== undefined
        ? { lastObservedExecutionState: params.lastObservedExecutionState }
        : {}),
      ...(params.executionDetectedAt !== undefined
        ? { executionDetectedAt: params.executionDetectedAt }
        : {}),
      ...(params.executionDetectionSource !== undefined
        ? { executionDetectionSource: params.executionDetectionSource }
        : {}),
      ...(params.reconciliationFailureReason !== undefined
        ? { reconciliationFailureReason: params.reconciliationFailureReason }
        : {}),
      ...(params.manualReviewRequired !== undefined
        ? { manualReviewRequired: params.manualReviewRequired }
        : {}),
      ...(params.manualReviewReason !== undefined
        ? { manualReviewReason: params.manualReviewReason }
        : {}),
    },
  });

  if (updated.count !== 1) {
    throw new WithdrawalSettlementError(
      `Withdrawal ${params.withdrawalId} could not update its multisig reconciliation checkpoint because its state changed.`,
    );
  }
}

export async function markWithdrawalSubmitted(params: {
  withdrawalId: string;
  triggeredBy: string;
  proposalId: string;
  proposalStatus: string;
  submittedTxSignature: string;
  submittedAt: Date;
  executionDetectedAt?: Date | null;
  executionDetectionSource?: string | null;
  lastObservedProposalState?: string | null;
  lastObservedExecutionState?: string | null;
  note: string;
}) {
  if (!params.triggeredBy.trim()) {
    throw new WithdrawalSettlementError("A non-empty triggeredBy value is required.");
  }

  if (!params.proposalId.trim() || !params.submittedTxSignature.trim()) {
    throw new WithdrawalSettlementError("Proposal id and submitted tx signature are required to move to SUBMITTED.");
  }

  for (let attempt = 1; attempt <= SERIALIZABLE_RETRY_LIMIT; attempt += 1) {
    try {
      return await db.$transaction(
        async (tx) => {
          const withdrawal = await loadWithdrawalForSettlement(tx, params.withdrawalId);

          if (withdrawal.status !== WithdrawalStatus.AWAITING_SIGNATURES) {
            throw new WithdrawalSettlementError(
              `Withdrawal ${withdrawal.id} cannot move to SUBMITTED from ${withdrawal.status}.`,
            );
          }

          if (withdrawal.multisigProposalId !== params.proposalId) {
            throw new WithdrawalSettlementError(
              `Withdrawal ${withdrawal.id} does not match multisig proposal ${params.proposalId}.`,
            );
          }

          const updated = await tx.withdrawal.updateMany({
            where: {
              id: withdrawal.id,
              status: WithdrawalStatus.AWAITING_SIGNATURES,
              multisigProposalId: params.proposalId,
            },
            data: {
              status: WithdrawalStatus.SUBMITTED,
              multisigProposalStatus: params.proposalStatus,
              submittedTxSignature: params.submittedTxSignature,
              submittedAt: params.submittedAt,
              executionDetectedAt: params.executionDetectedAt ?? params.submittedAt,
              executionDetectionSource: params.executionDetectionSource ?? "unknown",
              lastReconciledAt: params.submittedAt,
              lastObservedProposalState:
                params.lastObservedProposalState ?? params.proposalStatus,
              lastObservedExecutionState:
                params.lastObservedExecutionState ?? "signature_captured",
              reconciliationFailureReason: null,
              manualReviewRequired: false,
              manualReviewReason: null,
              recoveryLockId: null,
              recoveryLockedAt: null,
            },
          });

          if (updated.count !== 1) {
            throw new WithdrawalSettlementError(
              `Withdrawal ${withdrawal.id} could not move to SUBMITTED because its multisig state changed.`,
            );
          }

          await recordWithdrawalTransitionAudit(tx, {
            withdrawalId: withdrawal.id,
            triggeredBy: params.triggeredBy,
            fromStatus: WithdrawalStatus.AWAITING_SIGNATURES,
            toStatus: WithdrawalStatus.SUBMITTED,
            note: params.note,
          });

          return {
            id: withdrawal.id,
            status: WithdrawalStatus.SUBMITTED,
            submittedTxSignature: params.submittedTxSignature,
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    } catch (error) {
      if (isSerializableConflict(error) && attempt < SERIALIZABLE_RETRY_LIMIT) {
        continue;
      }

      throw error;
    }
  }

  throw new WithdrawalSettlementError("Unable to move withdrawal to SUBMITTED after multiple retries.");
}

export async function completeSubmittedWithdrawal(params: {
  withdrawalId: string;
  triggeredBy: string;
  submittedTxSignature: string;
  confirmedAt: Date;
  lastObservedExecutionState?: string | null;
  note: string;
}) {
  if (!params.triggeredBy.trim()) {
    throw new WithdrawalSettlementError("A non-empty triggeredBy value is required.");
  }

  if (!params.submittedTxSignature.trim()) {
    throw new WithdrawalSettlementError("A submitted tx signature is required to complete a multisig withdrawal.");
  }

  for (let attempt = 1; attempt <= SERIALIZABLE_RETRY_LIMIT; attempt += 1) {
    try {
      return await db.$transaction(
        async (tx) => {
          const withdrawal = await loadWithdrawalForSettlement(tx, params.withdrawalId);

          if (withdrawal.status !== WithdrawalStatus.SUBMITTED) {
            throw new WithdrawalSettlementError(
              `Withdrawal ${withdrawal.id} cannot move to COMPLETED from ${withdrawal.status}.`,
            );
          }

          if (withdrawal.submittedTxSignature !== params.submittedTxSignature) {
            throw new WithdrawalSettlementError(
              `Withdrawal ${withdrawal.id} does not match submitted transaction ${params.submittedTxSignature}.`,
            );
          }

          const updated = await tx.withdrawal.updateMany({
            where: {
              id: withdrawal.id,
              status: WithdrawalStatus.SUBMITTED,
              submittedTxSignature: params.submittedTxSignature,
            },
            data: {
              status: WithdrawalStatus.COMPLETED,
              confirmedAt: params.confirmedAt,
              lastReconciledAt: params.confirmedAt,
              lastObservedExecutionState:
                params.lastObservedExecutionState ?? "confirmed",
              failureReason: null,
              manualReviewRequired: false,
              manualReviewReason: null,
              recoveryLockId: null,
              recoveryLockedAt: null,
            },
          });

          if (updated.count !== 1) {
            throw new WithdrawalSettlementError(
              `Withdrawal ${withdrawal.id} could not move to COMPLETED because its submitted state changed.`,
            );
          }

          await recordWithdrawalTransitionAudit(tx, {
            withdrawalId: withdrawal.id,
            triggeredBy: params.triggeredBy,
            fromStatus: WithdrawalStatus.SUBMITTED,
            toStatus: WithdrawalStatus.COMPLETED,
            note: params.note,
          });

          return {
            id: withdrawal.id,
            status: WithdrawalStatus.COMPLETED,
            confirmedAt: params.confirmedAt.toISOString(),
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    } catch (error) {
      if (isSerializableConflict(error) && attempt < SERIALIZABLE_RETRY_LIMIT) {
        continue;
      }

      throw error;
    }
  }

  throw new WithdrawalSettlementError("Unable to complete submitted withdrawal after multiple retries.");
}

export async function markWithdrawalCancelledOrRejected(params: {
  withdrawalId: string;
  triggeredBy: string;
  failureReason: string;
}) {
  if (!params.triggeredBy.trim()) {
    throw new WithdrawalSettlementError("A non-empty triggeredBy value is required.");
  }

  if (!params.failureReason.trim()) {
    throw new WithdrawalSettlementError("A cancellation or rejection reason is required.");
  }

  const formattedReason = buildFailureMessage(params.failureReason.trim(), "failure");

  for (let attempt = 1; attempt <= SERIALIZABLE_RETRY_LIMIT; attempt += 1) {
    try {
      return await db.$transaction(
        async (tx) => {
          const withdrawal = await loadWithdrawalForSettlement(tx, params.withdrawalId);

          if (withdrawal.status !== WithdrawalStatus.AWAITING_SIGNATURES) {
            throw new WithdrawalSettlementError(
              `Withdrawal ${withdrawal.id} cannot move to FAILED from ${withdrawal.status}.`,
            );
          }

          if (withdrawal.submittedTxSignature || withdrawal.solanaTxSignature) {
            throw new WithdrawalSettlementError(
              `Withdrawal ${withdrawal.id} already has a submitted transaction and cannot be cancelled as FAILED.`,
            );
          }

          const updated = await tx.withdrawal.updateMany({
            where: {
              id: withdrawal.id,
              status: WithdrawalStatus.AWAITING_SIGNATURES,
              submittedTxSignature: null,
            },
            data: {
              status: WithdrawalStatus.FAILED,
              cancelledAt: new Date(),
              failureReason: formattedReason,
              executionDetectedAt: null,
              executionDetectionSource: null,
              nextReconcileAt: null,
              reconciliationFailureReason: formattedReason,
              recoveryLockId: null,
              recoveryLockedAt: null,
            },
          });

          if (updated.count !== 1) {
            throw new WithdrawalSettlementError(
              `Withdrawal ${withdrawal.id} could not move to FAILED because its multisig proposal state changed.`,
            );
          }

          await updateSettlementReservationOnFailure(tx, withdrawal);

          await recordWithdrawalTransitionAudit(tx, {
            withdrawalId: withdrawal.id,
            triggeredBy: params.triggeredBy,
            fromStatus: WithdrawalStatus.AWAITING_SIGNATURES,
            toStatus: WithdrawalStatus.FAILED,
            note: formattedReason,
          });

          return {
            id: withdrawal.id,
            status: WithdrawalStatus.FAILED,
            failureReason: formattedReason,
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    } catch (error) {
      if (isSerializableConflict(error) && attempt < SERIALIZABLE_RETRY_LIMIT) {
        continue;
      }

      throw error;
    }
  }

  throw new WithdrawalSettlementError("Unable to cancel multisig withdrawal after multiple retries.");
}

export async function claimWithdrawalRecoveryLock(params: {
  withdrawalId: string;
  expectedStatus: WithdrawalStatus;
  lockId: string;
  staleAfterMs?: number;
}) {
  const staleCutoff = new Date(Date.now() - (params.staleAfterMs ?? 5 * 60_000));

  const updated = await db.withdrawal.updateMany({
    where: {
      id: params.withdrawalId,
      status: params.expectedStatus,
      OR: [
        { recoveryLockId: null },
        { recoveryLockId: params.lockId },
        {
          recoveryLockedAt: {
            lt: staleCutoff,
          },
        },
      ],
    },
    data: {
      recoveryLockId: params.lockId,
      recoveryLockedAt: new Date(),
    },
  });

  return updated.count === 1;
}

export async function releaseWithdrawalRecoveryLock(params: {
  withdrawalId: string;
  lockId: string;
}) {
  await db.withdrawal.updateMany({
    where: {
      id: params.withdrawalId,
      recoveryLockId: params.lockId,
    },
    data: {
      recoveryLockId: null,
      recoveryLockedAt: null,
    },
  });
}

export async function recoverStaleWithdrawalProcessing({
  withdrawalId,
  jobId,
  triggeredBy,
  reason,
}: {
  withdrawalId: string;
  jobId: string;
  triggeredBy: string;
  reason: string;
}) {
  if (!jobId.trim()) {
    throw new WithdrawalSettlementError("A non-empty job id is required to recover stale processing.");
  }

  if (!triggeredBy.trim()) {
    throw new WithdrawalSettlementError("A non-empty triggeredBy value is required.");
  }

  for (let attempt = 1; attempt <= SERIALIZABLE_RETRY_LIMIT; attempt += 1) {
    try {
      return await db.$transaction(
        async (tx) => {
          const withdrawal = await loadWithdrawalForSettlement(tx, withdrawalId);
          return recoverStaleProcessingTransition({
            withdrawalId: withdrawal.id,
            currentStatus: withdrawal.status,
            currentJobId: withdrawal.jobId,
            expectedJobId: jobId,
            solanaTxSignature: withdrawal.solanaTxSignature,
            reason,
            async updateRecovery() {
              const updated = await tx.withdrawal.updateMany({
                where: {
                  id: withdrawal.id,
                  status: WithdrawalStatus.PROCESSING,
                  jobId,
                  solanaTxSignature: null,
                },
                data: {
                  status: WithdrawalStatus.PENDING,
                  jobId: null,
                  failureReason: buildFailureMessage(reason, "failure"),
                },
              });

              return updated.count;
            },
            async recordTransitionAudit() {
              await recordWithdrawalTransitionAudit(tx, {
                withdrawalId: withdrawal.id,
                triggeredBy,
                fromStatus: WithdrawalStatus.PROCESSING,
                toStatus: WithdrawalStatus.PENDING,
                note: reason,
              });
            },
            createError(message) {
              return new WithdrawalSettlementError(message);
            },
          });
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    } catch (error) {
      if (isSerializableConflict(error) && attempt < SERIALIZABLE_RETRY_LIMIT) {
        continue;
      }

      throw error;
    }
  }

  throw new WithdrawalSettlementError("Unable to recover stale processing after multiple retries.");
}

export async function requeueFailedWithdrawalForRetry({
  withdrawalId,
  triggeredBy,
  note,
}: {
  withdrawalId: string;
  triggeredBy: string;
  note: string;
}) {
  if (!triggeredBy.trim()) {
    throw new WithdrawalSettlementError("A non-empty triggeredBy value is required.");
  }

  for (let attempt = 1; attempt <= SERIALIZABLE_RETRY_LIMIT; attempt += 1) {
    try {
      return await db.$transaction(
        async (tx) => {
          const withdrawal = await loadWithdrawalForSettlement(tx, withdrawalId);
          return requeueFailedWithdrawal({
            withdrawalId: withdrawal.id,
            currentStatus: withdrawal.status,
            solanaTxSignature: withdrawal.solanaTxSignature,
            submittedTxSignature: withdrawal.submittedTxSignature,
            grossAmount: withdrawal.grossAmount,
            currentVestingStatus: withdrawal.vestingPosition.status,
            unlockAt: withdrawal.vestingPosition.unlockAt,
            totalAmount: withdrawal.vestingPosition.totalAmount,
            withdrawnAmount: withdrawal.vestingPosition.withdrawnAmount,
            async updateVesting(params) {
              await tx.vestingPosition.update({
                where: {
                  id: withdrawal.vestingPosition.id,
                },
                data: {
                  withdrawnAmount: params.nextWithdrawnAmount,
                  status: params.nextStatus,
                },
              });
            },
            async resetWithdrawal() {
              const updated = await tx.withdrawal.updateMany({
                where: {
                  id: withdrawal.id,
                  status: WithdrawalStatus.FAILED,
                  solanaTxSignature: null,
                  submittedTxSignature: null,
                },
                data: {
                  status: WithdrawalStatus.PENDING,
                  jobId: null,
                  failureReason: null,
                  payoutReference: null,
                  multisigProvider: null,
                  multisigAccountAddress: null,
                  multisigProposalId: null,
                  multisigProposalStatus: null,
                  preparedInstructionHash: null,
                  preparedAt: null,
                  submittedTxSignature: null,
                  submittedAt: null,
                  confirmedAt: null,
                  cancelledAt: null,
                  lastReconciledAt: null,
                  recoveryLockId: null,
                  recoveryLockedAt: null,
                  squadsVaultIndex: null,
                  squadsTransactionIndex: null,
                  squadsTransactionPda: null,
                  squadsProposalPda: null,
                  executionDetectedAt: null,
                  executionDetectionSource: null,
                  nextReconcileAt: null,
                  reconcileAttemptCount: 0,
                  lastSignatureSearchAt: null,
                  signatureSearchAttemptCount: 0,
                  lastObservedProposalState: null,
                  lastObservedExecutionState: null,
                  reconciliationFailureReason: null,
                  manualReviewRequired: false,
                  manualReviewReason: null,
                  solanaTxBlockhash: null,
                  solanaTxLastValidBlockHeight: null,
                },
              });

              return updated.count;
            },
            async recordTransitionAudit() {
              await recordWithdrawalTransitionAudit(tx, {
                withdrawalId: withdrawal.id,
                triggeredBy,
                fromStatus: WithdrawalStatus.FAILED,
                toStatus: WithdrawalStatus.PENDING,
                note,
              });
            },
            createError(message) {
              return new WithdrawalSettlementError(message);
            },
          });
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    } catch (error) {
      if (isSerializableConflict(error) && attempt < SERIALIZABLE_RETRY_LIMIT) {
        continue;
      }

      throw error;
    }
  }

  throw new WithdrawalSettlementError("Unable to requeue failed withdrawal after multiple retries.");
}

export async function failWithdrawalProcessing({
  withdrawalId,
  failureReason,
  jobId,
  triggeredBy,
}: {
  withdrawalId: string;
  failureReason: string;
  jobId?: string;
  triggeredBy: string;
}) {
  if (!failureReason.trim()) {
    throw new WithdrawalSettlementError("A failure reason is required.");
  }

  if (!triggeredBy.trim()) {
    throw new WithdrawalSettlementError("A non-empty triggeredBy value is required.");
  }

  const formattedReason = buildFailureMessage(
    failureReason.trim(),
    jobId ? "completion" : "failure",
  );

  for (let attempt = 1; attempt <= SERIALIZABLE_RETRY_LIMIT; attempt += 1) {
    try {
      return await db.$transaction(
        async (tx) => {
          const withdrawal = await loadWithdrawalForSettlement(tx, withdrawalId);

          if (
            withdrawal.status !== WithdrawalStatus.PENDING &&
            withdrawal.status !== WithdrawalStatus.PROCESSING
          ) {
            throw new WithdrawalSettlementError(
              `Withdrawal ${withdrawal.id} cannot move to FAILED from ${withdrawal.status}.`,
            );
          }

          if (
            withdrawal.status === WithdrawalStatus.PROCESSING &&
            jobId &&
            withdrawal.jobId !== jobId
          ) {
            throw new WithdrawalSettlementError(
              `Withdrawal ${withdrawal.id} is owned by a different processing job.`,
            );
          }

          if (
            withdrawal.status === WithdrawalStatus.PROCESSING &&
            withdrawal.solanaTxSignature
          ) {
            throw new WithdrawalSettlementError(
              `Withdrawal ${withdrawal.id} already has an on-chain payout submission and cannot be marked FAILED automatically.`,
            );
          }

          const updated = await tx.withdrawal.updateMany({
            where: {
              id: withdrawal.id,
              status: withdrawal.status,
              ...(withdrawal.status === WithdrawalStatus.PROCESSING && jobId
                ? { jobId }
                : {}),
            },
            data: {
              status: WithdrawalStatus.FAILED,
              failureReason: formattedReason,
            },
          });

          if (updated.count !== 1) {
            throw new WithdrawalSettlementError(
              `Withdrawal ${withdrawal.id} could not be marked failed because its state changed.`,
            );
          }

          await updateSettlementReservationOnFailure(tx, withdrawal);

          await recordWithdrawalTransitionAudit(tx, {
            withdrawalId: withdrawal.id,
            triggeredBy,
            fromStatus: withdrawal.status,
            toStatus: WithdrawalStatus.FAILED,
            note: formattedReason,
          });

          console.error(
            `Withdrawal settlement failed for ${withdrawal.id}: ${formattedReason}`,
          );

          return {
            id: withdrawal.id,
            status: WithdrawalStatus.FAILED,
            failureReason: formattedReason,
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    } catch (error) {
      if (isSerializableConflict(error) && attempt < SERIALIZABLE_RETRY_LIMIT) {
        continue;
      }

      throw error;
    }
  }

  throw new WithdrawalSettlementError("Unable to mark withdrawal failed after multiple retries.");
}
