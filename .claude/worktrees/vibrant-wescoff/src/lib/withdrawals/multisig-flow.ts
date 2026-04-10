import "server-only";

import { WithdrawalStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getExchangeConfig } from "@/lib/system-config/exchange-config";
import { MultisigAdapterError } from "./multisig-adapter";
import { getConfiguredMultisigPayoutAdapter } from "./configured-multisig-adapter";
import { recordPrepareMultisigWithdrawalFailure } from "./multisig-prepare-failure";
import { reusePreparedMultisigWithdrawal } from "./multisig-prepare-reuse";
import { handleAmbiguousExecutionCandidates } from "./multisig-reconcile-ambiguous";
import { handleExecutionSignatureNotFound } from "./multisig-reconcile-no-match";
import { handleSubmittedPayoutConfirmation } from "./multisig-reconcile-submitted";
import { handleDetectedExecutionSignature } from "./multisig-reconcile-signature-found";
import { finalizePreparedMultisigWithdrawalWithFailureAudit } from "./multisig-prepare-success";
import {
  buildWithdrawalPayoutMemo,
  buildWithdrawalPayoutReference,
  hashPreparedInstructionPayload,
} from "./multisig-intent";
import { recordWithdrawalPayoutEvent } from "./payout-events";
import {
  checkpointSquadsProposalPoll,
  flagWithdrawalForManualReview,
  recordSquadsExecutionDetection,
  recordSquadsSignatureSearch,
  recordWithdrawalSquadsReconciliationAttempt,
} from "./squads-reconciliation";
import {
  claimWithdrawalRecoveryLock,
  completeSubmittedWithdrawal,
  markWithdrawalAwaitingSignatures,
  markWithdrawalCancelledOrRejected,
  markWithdrawalSubmitted,
  releaseWithdrawalRecoveryLock,
  updateWithdrawalMultisigReconciliation,
  WithdrawalSettlementError,
} from "./settlement";

export class MultisigFlowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MultisigFlowError";
  }
}

type ProcessingWithdrawal = {
  id: string;
  status: WithdrawalStatus;
  jobId: string | null;
  netAmount: bigint;
  payoutReference: string | null;
  multisigProvider: string | null;
  multisigAccountAddress: string | null;
  multisigProposalId: string | null;
  multisigProposalStatus: string | null;
  preparedInstructionHash: string | null;
  preparedAt: Date | null;
  squadsVaultIndex: number | null;
  squadsTransactionIndex: string | null;
  squadsTransactionPda: string | null;
  squadsProposalPda: string | null;
  submittedTxSignature: string | null;
  vestingPosition: {
    walletAddress: string;
  };
};

async function loadWithdrawalForMultisig(withdrawalId: string) {
  const withdrawal = await db.withdrawal.findUnique({
    where: {
      id: withdrawalId,
    },
    select: {
      id: true,
      status: true,
      jobId: true,
      netAmount: true,
      payoutReference: true,
      multisigProvider: true,
      multisigAccountAddress: true,
      multisigProposalId: true,
      multisigProposalStatus: true,
      preparedInstructionHash: true,
      preparedAt: true,
      squadsVaultIndex: true,
      squadsTransactionIndex: true,
      squadsTransactionPda: true,
      squadsProposalPda: true,
      submittedTxSignature: true,
      vestingPosition: {
        select: {
          walletAddress: true,
        },
      },
    },
  });

  if (!withdrawal) {
    throw new MultisigFlowError("Withdrawal not found.");
  }

  return withdrawal satisfies ProcessingWithdrawal;
}

function buildPreparedInstructionPayload(params: {
  withdrawalId: string;
  payoutReference: string;
  recipientWalletAddress: string;
  mintAddress: string;
  netAmountAtomic: bigint;
  decimals: number;
  memo: string;
}) {
  return {
    kind: "withdrawal-payout",
    version: 1,
    withdrawalId: params.withdrawalId,
    payoutReference: params.payoutReference,
    recipientWalletAddress: params.recipientWalletAddress,
    mintAddress: params.mintAddress,
    netAmountAtomic: params.netAmountAtomic.toString(),
    decimals: params.decimals,
    memo: params.memo,
  };
}

function getNextReconcileAt(minutesFromNow: number) {
  return new Date(Date.now() + minutesFromNow * 60_000);
}

function getProposalApprovalSnapshot(proposalStatus: unknown) {
  const value = proposalStatus as {
    approvalsCollected?: number;
    approvalsRequired?: number;
  };

  return {
    approvalsCollected: value.approvalsCollected ?? null,
    approvalsRequired: value.approvalsRequired ?? null,
  };
}
export async function prepareMultisigWithdrawal(params: {
  withdrawalId: string;
  jobId: string;
  actor: string;
}) {
  const [withdrawal, exchangeConfig] = await Promise.all([
    loadWithdrawalForMultisig(params.withdrawalId),
    getExchangeConfig(),
  ]);

  if (withdrawal.status !== WithdrawalStatus.PROCESSING) {
    throw new MultisigFlowError(
      `Withdrawal ${withdrawal.id} cannot be prepared for multisig from ${withdrawal.status}.`,
    );
  }

  if (withdrawal.jobId !== params.jobId) {
    throw new MultisigFlowError(
      `Withdrawal ${withdrawal.id} is owned by a different processing job.`,
    );
  }

  if (withdrawal.multisigProposalId) {
    const preparedAt = withdrawal.preparedAt ?? new Date();
    const payoutReference =
      withdrawal.payoutReference ?? buildWithdrawalPayoutReference(withdrawal.id);
    return reusePreparedMultisigWithdrawal({
      withdrawalId: withdrawal.id,
      jobId: params.jobId,
      actor: params.actor,
      payoutReference,
      preparedAt,
      multisigProvider: withdrawal.multisigProvider,
      multisigAccountAddress: withdrawal.multisigAccountAddress,
      multisigProposalId: withdrawal.multisigProposalId,
      multisigProposalStatus: withdrawal.multisigProposalStatus ?? "awaiting_signatures",
      squadsVaultIndex: withdrawal.squadsVaultIndex,
      squadsTransactionIndex: withdrawal.squadsTransactionIndex,
      squadsTransactionPda: withdrawal.squadsTransactionPda,
      squadsProposalPda: withdrawal.squadsProposalPda,
      preparedInstructionHash: withdrawal.preparedInstructionHash,
      updateReconciliation: updateWithdrawalMultisigReconciliation,
      markAwaitingSignatures: markWithdrawalAwaitingSignatures,
      recordAttempt: recordWithdrawalSquadsReconciliationAttempt,
      recordEvent: recordWithdrawalPayoutEvent,
      getNextReconcileAt,
    });
  }

  const payoutReference =
    withdrawal.payoutReference ?? buildWithdrawalPayoutReference(withdrawal.id);
  const memo = buildWithdrawalPayoutMemo(withdrawal.id, payoutReference);
  const instructionPayload = buildPreparedInstructionPayload({
    withdrawalId: withdrawal.id,
    payoutReference,
    recipientWalletAddress: withdrawal.vestingPosition.walletAddress,
    mintAddress: exchangeConfig.peanutTokenMintAddress,
    netAmountAtomic: withdrawal.netAmount,
    decimals: exchangeConfig.peanutTokenDecimals,
    memo,
  });
  const preparedInstructionHash = hashPreparedInstructionPayload(instructionPayload);
  const adapter = getConfiguredMultisigPayoutAdapter();
  let prepared;

  try {
    prepared = await adapter.preparePayout({
      withdrawalId: withdrawal.id,
      payoutReference,
      recipientWalletAddress: withdrawal.vestingPosition.walletAddress,
      mintAddress: exchangeConfig.peanutTokenMintAddress,
      netAmountAtomic: withdrawal.netAmount,
      decimals: exchangeConfig.peanutTokenDecimals,
      memo,
      preparedInstructionHash,
    });
  } catch (error) {
    await recordPrepareMultisigWithdrawalFailure({
      withdrawalId: withdrawal.id,
      actor: params.actor,
      payoutReference,
      preparedInstructionHash,
      recipientWalletAddress: withdrawal.vestingPosition.walletAddress,
      mintAddress: exchangeConfig.peanutTokenMintAddress,
      netAmountAtomic: withdrawal.netAmount,
      error,
      recordAttempt: recordWithdrawalSquadsReconciliationAttempt,
      recordEvent: recordWithdrawalPayoutEvent,
    });

    throw error;
  }

  return finalizePreparedMultisigWithdrawalWithFailureAudit({
    withdrawalId: withdrawal.id,
    jobId: params.jobId,
    actor: params.actor,
    payoutReference,
    recipientWalletAddress: withdrawal.vestingPosition.walletAddress,
    mintAddress: exchangeConfig.peanutTokenMintAddress,
    netAmountAtomic: withdrawal.netAmount,
    expectedPreparedInstructionHash: preparedInstructionHash,
    prepared,
    markAwaitingSignatures: markWithdrawalAwaitingSignatures,
    recordAttempt: recordWithdrawalSquadsReconciliationAttempt,
    recordEvent: recordWithdrawalPayoutEvent,
    getNextReconcileAt,
  });
}

async function withRecoveryLock<T>(params: {
  withdrawalId: string;
  expectedStatus: WithdrawalStatus;
  actor: string;
  run: () => Promise<T>;
}) {
  const lockId = `${params.actor}:${params.expectedStatus}:${params.withdrawalId}`;
  const claimed = await claimWithdrawalRecoveryLock({
    withdrawalId: params.withdrawalId,
    expectedStatus: params.expectedStatus,
    lockId,
  });

  if (!claimed) {
    return null;
  }

  try {
    return await params.run();
  } finally {
    await releaseWithdrawalRecoveryLock({
      withdrawalId: params.withdrawalId,
      lockId,
    });
  }
}

export async function reconcileAwaitingSignaturesWithdrawal(params: {
  withdrawalId: string;
  actor: string;
}) {
  return withRecoveryLock({
    withdrawalId: params.withdrawalId,
    expectedStatus: WithdrawalStatus.AWAITING_SIGNATURES,
    actor: params.actor,
    run: async () => {
      const [withdrawal, exchangeConfig] = await Promise.all([
        loadWithdrawalForMultisig(params.withdrawalId),
        getExchangeConfig(),
      ]);

      if (
        !withdrawal.multisigProposalId ||
        !withdrawal.payoutReference ||
        !withdrawal.multisigAccountAddress ||
        !withdrawal.squadsTransactionIndex ||
        !withdrawal.squadsTransactionPda ||
        !withdrawal.squadsProposalPda
      ) {
        throw new MultisigFlowError(
          `Withdrawal ${withdrawal.id} is missing Squads proposal metadata.`,
        );
      }

      const adapter = getConfiguredMultisigPayoutAdapter();
      const proposalStatus = await adapter.getProposalStatus({
        multisigAccountAddress: withdrawal.multisigAccountAddress,
        transactionIndex: withdrawal.squadsTransactionIndex,
        proposalPda: withdrawal.squadsProposalPda,
      });

      await checkpointSquadsProposalPoll({
        withdrawalId: withdrawal.id,
        expectedStatus: WithdrawalStatus.AWAITING_SIGNATURES,
        checkedAt: proposalStatus.lastCheckedAt,
        proposalState: proposalStatus.proposalStatusRaw,
        nextReconcileAt:
          proposalStatus.state === "ready_for_execution"
            ? getNextReconcileAt(1)
            : getNextReconcileAt(5),
        detailsJson: JSON.stringify(getProposalApprovalSnapshot(proposalStatus)),
      });

      if (proposalStatus.state === "cancelled") {
        await markWithdrawalCancelledOrRejected({
          withdrawalId: withdrawal.id,
          triggeredBy: params.actor,
          failureReason:
            proposalStatus.reason ?? "Multisig proposal was cancelled or rejected.",
        });

        await recordWithdrawalPayoutEvent({
          withdrawalId: withdrawal.id,
          eventType: "proposal-cancelled",
          triggeredBy: params.actor,
          proposalId: withdrawal.multisigProposalId,
          detailsJson: JSON.stringify({
            reason: proposalStatus.reason ?? null,
          }),
        });

        return { outcome: "failed" as const };
      }

      await recordWithdrawalPayoutEvent({
        withdrawalId: withdrawal.id,
        eventType:
          proposalStatus.state === "ready_for_execution"
            ? "ready-for-execution-detected"
            : "awaiting-signatures-reconciled",
        triggeredBy: params.actor,
        proposalId: withdrawal.multisigProposalId,
        detailsJson: JSON.stringify({
          proposalStatus: proposalStatus.proposalStatusRaw,
          ...getProposalApprovalSnapshot(proposalStatus),
        }),
      });

      const executionStatus = await adapter.detectExecution({
        multisigAccountAddress: withdrawal.multisigAccountAddress,
        transactionIndex: withdrawal.squadsTransactionIndex,
        transactionPda: withdrawal.squadsTransactionPda,
        proposalPda: withdrawal.squadsProposalPda,
      });

      if (executionStatus.state === "not_executed") {
        await updateWithdrawalMultisigReconciliation({
          withdrawalId: withdrawal.id,
          expectedStatus: WithdrawalStatus.AWAITING_SIGNATURES,
          lastReconciledAt: executionStatus.lastCheckedAt,
          multisigProposalStatus: executionStatus.proposalStatusRaw,
          nextReconcileAt:
            proposalStatus.state === "ready_for_execution"
              ? getNextReconcileAt(1)
              : getNextReconcileAt(5),
          lastObservedProposalState: executionStatus.proposalStatusRaw,
          lastObservedExecutionState: executionStatus.executionStatusRaw ?? "not_executed",
          reconciliationFailureReason: null,
        });

        return { outcome: "awaiting_signatures" as const };
      }

      if (executionStatus.state === "ambiguous") {
        await handleAmbiguousExecutionCandidates({
          withdrawalId: withdrawal.id,
          expectedStatus: WithdrawalStatus.AWAITING_SIGNATURES,
          actor: params.actor,
          proposalId: withdrawal.multisigProposalId,
          searchedAt: executionStatus.lastCheckedAt,
          proposalState: executionStatus.proposalStatusRaw,
          executionState: executionStatus.executionStatusRaw ?? "ambiguous",
          nextReconcileAt: getNextReconcileAt(2),
          candidateTxSignatures: executionStatus.candidateTxSignatures,
          searchErrorMessage:
            "Multiple candidate execution signatures were found during reconciliation.",
          manualReviewReason:
            "Multiple candidate execution signatures were found for this Squads payout.",
          recordSignatureSearch: recordSquadsSignatureSearch,
          flagManualReview: flagWithdrawalForManualReview,
          recordPayoutEvent: recordWithdrawalPayoutEvent,
        });

        return { outcome: "awaiting_signatures" as const };
      }

      if (executionStatus.state === "execution_suspected") {
        await recordSquadsExecutionDetection({
          withdrawalId: withdrawal.id,
          expectedStatus: WithdrawalStatus.AWAITING_SIGNATURES,
          detectedAt: executionStatus.lastCheckedAt,
          detectionSource: executionStatus.detectionSource,
          proposalState: executionStatus.proposalStatusRaw,
          executionState: executionStatus.executionStatusRaw ?? "execution_suspected",
          nextReconcileAt: getNextReconcileAt(1),
        });

        if (!withdrawal.preparedInstructionHash || withdrawal.squadsVaultIndex === null) {
          await flagWithdrawalForManualReview({
            withdrawalId: withdrawal.id,
            expectedStatus: WithdrawalStatus.AWAITING_SIGNATURES,
            reason:
              "Execution was suspected, but the stored Squads payout metadata is incomplete.",
            proposalState: executionStatus.proposalStatusRaw,
            executionState: executionStatus.executionStatusRaw ?? "execution_suspected",
          });

          return { outcome: "awaiting_signatures" as const };
        }

        const signatureSearch = await adapter.searchForExecutionSignature({
          multisigAccountAddress: withdrawal.multisigAccountAddress,
          vaultIndex: withdrawal.squadsVaultIndex,
          transactionIndex: withdrawal.squadsTransactionIndex,
          transactionPda: withdrawal.squadsTransactionPda,
          proposalPda: withdrawal.squadsProposalPda,
          payoutReference: withdrawal.payoutReference,
          expectedRecipientWalletAddress: withdrawal.vestingPosition.walletAddress,
          expectedMintAddress: exchangeConfig.peanutTokenMintAddress,
          expectedNetAmountAtomic: withdrawal.netAmount,
          preparedInstructionHash: withdrawal.preparedInstructionHash,
          searchWindowStart:
            withdrawal.preparedAt ?? new Date(Date.now() - 24 * 60 * 60_000),
          searchWindowEnd: new Date(),
        });

        if (signatureSearch.state === "not_found") {
          await handleExecutionSignatureNotFound({
            withdrawalId: withdrawal.id,
            expectedStatus: WithdrawalStatus.AWAITING_SIGNATURES,
            actor: params.actor,
            proposalId: withdrawal.multisigProposalId,
            searchedAt: signatureSearch.searchedAt,
            proposalState: executionStatus.proposalStatusRaw,
            executionState: executionStatus.executionStatusRaw ?? "execution_suspected",
            nextReconcileAt: getNextReconcileAt(2),
            recordSignatureSearch: recordSquadsSignatureSearch,
            recordPayoutEvent: recordWithdrawalPayoutEvent,
          });

          return { outcome: "awaiting_signatures" as const };
        }

        if (signatureSearch.state === "ambiguous") {
          await handleAmbiguousExecutionCandidates({
            withdrawalId: withdrawal.id,
            expectedStatus: WithdrawalStatus.AWAITING_SIGNATURES,
            actor: params.actor,
            proposalId: withdrawal.multisigProposalId,
            searchedAt: signatureSearch.searchedAt,
            proposalState: executionStatus.proposalStatusRaw,
            executionState: executionStatus.executionStatusRaw ?? "execution_suspected",
            nextReconcileAt: getNextReconcileAt(2),
            candidateTxSignatures: signatureSearch.candidateTxSignatures,
            searchErrorMessage:
              "Multiple candidate execution signatures were found during chain search.",
            manualReviewReason:
              "Multiple candidate execution signatures were found during signature search.",
            recordSignatureSearch: recordSquadsSignatureSearch,
            flagManualReview: flagWithdrawalForManualReview,
            recordPayoutEvent: recordWithdrawalPayoutEvent,
          });

          return { outcome: "awaiting_signatures" as const };
        }

        await recordSquadsSignatureSearch({
          withdrawalId: withdrawal.id,
          expectedStatus: WithdrawalStatus.AWAITING_SIGNATURES,
          searchedAt: signatureSearch.searchedAt,
          result: "match_found",
          proposalState: executionStatus.proposalStatusRaw,
          executionState: executionStatus.executionStatusRaw ?? "execution_suspected",
          txSignature: signatureSearch.txSignature,
          matchedBy: signatureSearch.matchedBy,
          nextReconcileAt: getNextReconcileAt(1),
        });

        await markWithdrawalSubmitted({
          withdrawalId: withdrawal.id,
          triggeredBy: params.actor,
          proposalId: withdrawal.multisigProposalId,
          proposalStatus: executionStatus.proposalStatusRaw,
          submittedTxSignature: signatureSearch.txSignature,
          submittedAt: signatureSearch.detectedAt,
          executionDetectedAt: executionStatus.lastCheckedAt,
          executionDetectionSource: executionStatus.detectionSource,
          lastObservedProposalState: executionStatus.proposalStatusRaw,
          lastObservedExecutionState:
            executionStatus.executionStatusRaw ?? "signature_captured",
          note: `Multisig proposal ${withdrawal.multisigProposalId} produced transaction ${signatureSearch.txSignature}.`,
        });

        await recordWithdrawalPayoutEvent({
          withdrawalId: withdrawal.id,
          eventType: "signature-captured",
          triggeredBy: params.actor,
          proposalId: withdrawal.multisigProposalId,
          txSignature: signatureSearch.txSignature,
          detailsJson: JSON.stringify({
            proposalStatus: executionStatus.proposalStatusRaw,
            matchedBy: signatureSearch.matchedBy,
            detectionSource: executionStatus.detectionSource,
          }),
        });

        return { outcome: "submitted" as const };
      }

      await handleDetectedExecutionSignature({
        withdrawalId: withdrawal.id,
        actor: params.actor,
        proposalId: withdrawal.multisigProposalId,
        proposalState: executionStatus.proposalStatusRaw,
        executionState: executionStatus.executionStatusRaw ?? "signature_found",
        txSignature: executionStatus.txSignature,
        matchedBy: executionStatus.matchedBy,
        detectionSource: executionStatus.detectionSource,
        detectedAt: executionStatus.detectedAt,
        searchedAt: executionStatus.lastCheckedAt,
        nextReconcileAt: getNextReconcileAt(1),
        note: `Captured execution signature ${executionStatus.txSignature} for multisig proposal ${withdrawal.multisigProposalId}.`,
        recordExecutionDetection: recordSquadsExecutionDetection,
        recordSignatureSearch: recordSquadsSignatureSearch,
        markSubmitted: markWithdrawalSubmitted,
        recordPayoutEvent: recordWithdrawalPayoutEvent,
      });

      return { outcome: "submitted" as const };
    },
  });
}

export async function reconcileSubmittedWithdrawal(params: {
  withdrawalId: string;
  actor: string;
}) {
  return withRecoveryLock({
    withdrawalId: params.withdrawalId,
    expectedStatus: WithdrawalStatus.SUBMITTED,
    actor: params.actor,
    run: async () => {
      const [withdrawal, exchangeConfig] = await Promise.all([
        db.withdrawal.findUnique({
          where: {
            id: params.withdrawalId,
          },
          select: {
            id: true,
            status: true,
            netAmount: true,
            payoutReference: true,
            multisigProposalId: true,
            submittedTxSignature: true,
            vestingPosition: {
              select: {
                walletAddress: true,
              },
            },
          },
        }),
        getExchangeConfig(),
      ]);

      if (!withdrawal) {
        throw new MultisigFlowError("Withdrawal not found.");
      }

      if (withdrawal.status !== WithdrawalStatus.SUBMITTED) {
        throw new MultisigFlowError(
          `Withdrawal ${withdrawal.id} cannot be reconciled from ${withdrawal.status}.`,
        );
      }

      if (
        !withdrawal.multisigProposalId ||
        !withdrawal.payoutReference ||
        !withdrawal.submittedTxSignature
      ) {
        throw new MultisigFlowError(
          `Withdrawal ${withdrawal.id} is missing submitted multisig metadata.`,
        );
      }

      const adapter = getConfiguredMultisigPayoutAdapter();
      const status = await adapter.confirmSubmittedPayout({
        proposalId: withdrawal.multisigProposalId,
        txSignature: withdrawal.submittedTxSignature,
        payoutReference: withdrawal.payoutReference,
        expectedRecipientWalletAddress: withdrawal.vestingPosition.walletAddress,
        expectedMintAddress: exchangeConfig.peanutTokenMintAddress,
        expectedNetAmountAtomic: withdrawal.netAmount,
      });

      return handleSubmittedPayoutConfirmation({
        withdrawalId: withdrawal.id,
        actor: params.actor,
        proposalId: withdrawal.multisigProposalId,
        submittedTxSignature: withdrawal.submittedTxSignature,
        status,
        nextReconcileAt: status.state === "confirmed" ? null : getNextReconcileAt(1),
        updateReconciliation: updateWithdrawalMultisigReconciliation,
        recordAttempt: recordWithdrawalSquadsReconciliationAttempt,
        completeSubmitted: completeSubmittedWithdrawal,
        recordEvent: recordWithdrawalPayoutEvent,
      });
    },
  });
}

export function isRecoverableMultisigFlowError(error: unknown) {
  return (
    error instanceof MultisigFlowError ||
    error instanceof MultisigAdapterError ||
    error instanceof WithdrawalSettlementError
  );
}
