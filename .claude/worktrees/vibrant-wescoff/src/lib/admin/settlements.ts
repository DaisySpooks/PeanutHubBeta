import "server-only";

import { Prisma, WithdrawalStatus } from "@prisma/client";
import { db } from "@/lib/db";

const adminSettlementSelect = {
  id: true,
  grossAmount: true,
  feeAmount: true,
  netAmount: true,
  feePercent: true,
  daysAfterUnlock: true,
  status: true,
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
  submittedTxSignature: true,
  submittedAt: true,
  confirmedAt: true,
  cancelledAt: true,
  lastReconciledAt: true,
  solanaTxSignature: true,
  solanaConfirmedAt: true,
  jobId: true,
  failureReason: true,
  createdAt: true,
  updatedAt: true,
  vestingPosition: {
    select: {
      id: true,
      walletAddress: true,
      unlockAt: true,
      status: true,
      exchange: {
        select: {
          id: true,
          user: {
            select: {
              walletAddress: true,
            },
          },
        },
      },
    },
  },
  transitionAudits: {
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      triggeredBy: true,
      fromStatus: true,
      toStatus: true,
      note: true,
      createdAt: true,
    },
  },
  payoutAttempts: {
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      actor: true,
      jobId: true,
      attemptNumber: true,
      eventType: true,
      message: true,
      solanaTxSignature: true,
      createdAt: true,
    },
  },
  payoutEvents: {
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      eventType: true,
      triggeredBy: true,
      proposalId: true,
      txSignature: true,
      detailsJson: true,
      createdAt: true,
    },
  },
  squadsReconciliationAttempts: {
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      attemptType: true,
      result: true,
      proposalState: true,
      executionState: true,
      txSignature: true,
      matchedBy: true,
      errorMessage: true,
      detailsJson: true,
      createdAt: true,
    },
  },
} satisfies Prisma.WithdrawalSelect;

type AdminSettlementRecord = Prisma.WithdrawalGetPayload<{
  select: typeof adminSettlementSelect;
}>;

export type AdminSettlementItem = {
  id: string;
  grossAmount: string;
  feeAmount: string;
  netAmount: string;
  feePercent: string;
  daysAfterUnlock: number;
  status: WithdrawalStatus;
  payoutReference: string | null;
  multisigProvider: string | null;
  multisigAccountAddress: string | null;
  multisigProposalId: string | null;
  multisigProposalStatus: string | null;
  preparedInstructionHash: string | null;
  preparedAt: string | null;
  squadsVaultIndex: number | null;
  squadsTransactionIndex: string | null;
  squadsTransactionPda: string | null;
  squadsProposalPda: string | null;
  executionDetectedAt: string | null;
  executionDetectionSource: string | null;
  nextReconcileAt: string | null;
  reconcileAttemptCount: number;
  lastSignatureSearchAt: string | null;
  signatureSearchAttemptCount: number;
  lastObservedProposalState: string | null;
  lastObservedExecutionState: string | null;
  reconciliationFailureReason: string | null;
  manualReviewRequired: boolean;
  manualReviewReason: string | null;
  submittedTxSignature: string | null;
  submittedAt: string | null;
  confirmedAt: string | null;
  cancelledAt: string | null;
  lastReconciledAt: string | null;
  solanaTxSignature: string | null;
  solanaConfirmedAt: string | null;
  jobId: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
  vestingPosition: {
    id: string;
    walletAddress: string;
    unlockAt: string;
    status: string;
    exchangeId: string;
    userWalletAddress: string;
  };
  transitionAudits: {
    id: string;
    triggeredBy: string;
    fromStatus: string;
    toStatus: string;
    note: string | null;
    createdAt: string;
  }[];
  payoutAttempts: {
    id: string;
    actor: string;
    jobId: string | null;
    attemptNumber: number | null;
    eventType: string;
    message: string | null;
    solanaTxSignature: string | null;
    createdAt: string;
  }[];
  payoutEvents: {
    id: string;
    eventType: string;
    triggeredBy: string;
    proposalId: string | null;
    txSignature: string | null;
    detailsJson: string | null;
    createdAt: string;
  }[];
  squadsReconciliationAttempts: {
    id: string;
    attemptType: string;
    result: string;
    proposalState: string | null;
    executionState: string | null;
    txSignature: string | null;
    matchedBy: string | null;
    errorMessage: string | null;
    detailsJson: string | null;
    createdAt: string;
  }[];
};

function serializeSettlement(record: AdminSettlementRecord): AdminSettlementItem {
  return {
    id: record.id,
    grossAmount: record.grossAmount.toString(),
    feeAmount: record.feeAmount.toString(),
    netAmount: record.netAmount.toString(),
    feePercent: record.feePercent.toString(),
    daysAfterUnlock: record.daysAfterUnlock,
    status: record.status,
    payoutReference: record.payoutReference,
    multisigProvider: record.multisigProvider,
    multisigAccountAddress: record.multisigAccountAddress,
    multisigProposalId: record.multisigProposalId,
    multisigProposalStatus: record.multisigProposalStatus,
    preparedInstructionHash: record.preparedInstructionHash,
    preparedAt: record.preparedAt?.toISOString() ?? null,
    squadsVaultIndex: record.squadsVaultIndex,
    squadsTransactionIndex: record.squadsTransactionIndex,
    squadsTransactionPda: record.squadsTransactionPda,
    squadsProposalPda: record.squadsProposalPda,
    executionDetectedAt: record.executionDetectedAt?.toISOString() ?? null,
    executionDetectionSource: record.executionDetectionSource,
    nextReconcileAt: record.nextReconcileAt?.toISOString() ?? null,
    reconcileAttemptCount: record.reconcileAttemptCount,
    lastSignatureSearchAt: record.lastSignatureSearchAt?.toISOString() ?? null,
    signatureSearchAttemptCount: record.signatureSearchAttemptCount,
    lastObservedProposalState: record.lastObservedProposalState,
    lastObservedExecutionState: record.lastObservedExecutionState,
    reconciliationFailureReason: record.reconciliationFailureReason,
    manualReviewRequired: record.manualReviewRequired,
    manualReviewReason: record.manualReviewReason,
    submittedTxSignature: record.submittedTxSignature,
    submittedAt: record.submittedAt?.toISOString() ?? null,
    confirmedAt: record.confirmedAt?.toISOString() ?? null,
    cancelledAt: record.cancelledAt?.toISOString() ?? null,
    lastReconciledAt: record.lastReconciledAt?.toISOString() ?? null,
    solanaTxSignature: record.solanaTxSignature,
    solanaConfirmedAt: record.solanaConfirmedAt?.toISOString() ?? null,
    jobId: record.jobId,
    failureReason: record.failureReason,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    vestingPosition: {
      id: record.vestingPosition.id,
      walletAddress: record.vestingPosition.walletAddress,
      unlockAt: record.vestingPosition.unlockAt.toISOString(),
      status: record.vestingPosition.status,
      exchangeId: record.vestingPosition.exchange.id,
      userWalletAddress: record.vestingPosition.exchange.user.walletAddress,
    },
    transitionAudits: record.transitionAudits.map((audit) => ({
      id: audit.id,
      triggeredBy: audit.triggeredBy,
      fromStatus: audit.fromStatus,
      toStatus: audit.toStatus,
      note: audit.note,
      createdAt: audit.createdAt.toISOString(),
    })),
    payoutAttempts: record.payoutAttempts.map((attempt) => ({
      id: attempt.id,
      actor: attempt.actor,
      jobId: attempt.jobId,
      attemptNumber: attempt.attemptNumber,
      eventType: attempt.eventType,
      message: attempt.message,
      solanaTxSignature: attempt.solanaTxSignature,
      createdAt: attempt.createdAt.toISOString(),
    })),
    payoutEvents: record.payoutEvents.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      triggeredBy: event.triggeredBy,
      proposalId: event.proposalId,
      txSignature: event.txSignature,
      detailsJson: event.detailsJson,
      createdAt: event.createdAt.toISOString(),
    })),
    squadsReconciliationAttempts: record.squadsReconciliationAttempts.map((attempt) => ({
      id: attempt.id,
      attemptType: attempt.attemptType,
      result: attempt.result,
      proposalState: attempt.proposalState,
      executionState: attempt.executionState,
      txSignature: attempt.txSignature,
      matchedBy: attempt.matchedBy,
      errorMessage: attempt.errorMessage,
      detailsJson: attempt.detailsJson,
      createdAt: attempt.createdAt.toISOString(),
    })),
  };
}

export async function getAdminSettlementDashboard() {
  const withdrawals = await db.withdrawal.findMany({
    orderBy: [
      { createdAt: "desc" },
      { updatedAt: "desc" },
    ],
    select: adminSettlementSelect,
  });

  const items = withdrawals.map(serializeSettlement);

  return {
    pending: items.filter((item) => item.status === WithdrawalStatus.PENDING),
    processing: items.filter((item) => item.status === WithdrawalStatus.PROCESSING),
    awaitingSignatures: items.filter((item) => item.status === WithdrawalStatus.AWAITING_SIGNATURES),
    submitted: items.filter((item) => item.status === WithdrawalStatus.SUBMITTED),
    completed: items.filter((item) => item.status === WithdrawalStatus.COMPLETED),
    failed: items.filter((item) => item.status === WithdrawalStatus.FAILED),
  };
}
