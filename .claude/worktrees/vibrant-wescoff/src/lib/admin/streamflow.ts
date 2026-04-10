import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

const adminStreamflowSelect = {
  id: true,
  walletAddress: true,
  totalAmount: true,
  withdrawnAmount: true,
  lockedAt: true,
  unlockAt: true,
  status: true,
  vestingProvider: true,
  streamflowLifecycleStatus: true,
  vestingReference: true,
  streamflowClientCorrelationId: true,
  streamflowExpectedVestingKind: true,
  streamflowExpectedRecipientWalletAddress: true,
  streamflowExpectedMintAddress: true,
  streamflowExpectedAmountAtomic: true,
  streamflowExpectedStartAt: true,
  streamflowExpectedEndAt: true,
  streamflowScheduleId: true,
  streamflowTreasuryAddress: true,
  streamflowEscrowAddress: true,
  streamflowBeneficiaryAddress: true,
  streamflowMintAddress: true,
  streamflowCreationTxSignature: true,
  streamflowPreparedAt: true,
  streamflowScheduleCreatedAt: true,
  streamflowConfirmedAt: true,
  streamflowLastReconciledAt: true,
  streamflowNextReconcileAt: true,
  streamflowReconcileAttemptCount: true,
  streamflowObservedScheduleState: true,
  streamflowObservedCreationTxSignature: true,
  streamflowReconciliationFailureReason: true,
  streamflowManualReviewRequired: true,
  streamflowManualReviewReason: true,
  createdAt: true,
  updatedAt: true,
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
  streamflowReconciliationAttempts: {
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      attemptType: true,
      result: true,
      observedScheduleId: true,
      observedTxSignature: true,
      observedState: true,
      matchedBy: true,
      errorMessage: true,
      detailsJson: true,
      createdAt: true,
    },
  },
} satisfies Prisma.VestingPositionSelect;

type AdminStreamflowRecord = Prisma.VestingPositionGetPayload<{
  select: typeof adminStreamflowSelect;
}>;

function parseAttemptDetails(detailsJson: string | null) {
  if (!detailsJson) {
    return null;
  }

  try {
    return JSON.parse(detailsJson) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export type AdminStreamflowItem = {
  id: string;
  walletAddress: string;
  totalAmount: string;
  withdrawnAmount: string;
  lockedAt: string;
  unlockAt: string;
  status: string;
  vestingProvider: string | null;
  streamflowLifecycleStatus: string | null;
  vestingReference: string | null;
  streamflowClientCorrelationId: string | null;
  streamflowExpectedVestingKind: string | null;
  streamflowExpectedRecipientWalletAddress: string | null;
  streamflowExpectedMintAddress: string | null;
  streamflowExpectedAmountAtomic: string | null;
  streamflowExpectedStartAt: string | null;
  streamflowExpectedEndAt: string | null;
  streamflowScheduleId: string | null;
  streamflowTreasuryAddress: string | null;
  streamflowEscrowAddress: string | null;
  streamflowBeneficiaryAddress: string | null;
  streamflowMintAddress: string | null;
  streamflowCreationTxSignature: string | null;
  streamflowPreparedAt: string | null;
  streamflowScheduleCreatedAt: string | null;
  streamflowConfirmedAt: string | null;
  streamflowLastReconciledAt: string | null;
  streamflowNextReconcileAt: string | null;
  streamflowReconcileAttemptCount: number;
  streamflowObservedScheduleState: string | null;
  streamflowObservedCreationTxSignature: string | null;
  streamflowReconciliationFailureReason: string | null;
  streamflowManualReviewRequired: boolean;
  streamflowManualReviewReason: string | null;
  createdAt: string;
  updatedAt: string;
  exchange: {
    id: string;
    userWalletAddress: string;
  };
  lastAttemptAt: string | null;
  lastAttemptOutcome: string | null;
  canClearManualReview: boolean;
  lastManualReviewClearedAt: string | null;
  lastManualReviewClearedBy: string | null;
  reconciliationAttempts: {
    id: string;
    attemptType: string;
    result: string;
    observedScheduleId: string | null;
    observedTxSignature: string | null;
    observedState: string | null;
    matchedBy: string | null;
    errorMessage: string | null;
    detailsJson: string | null;
    createdAt: string;
  }[];
};

export type AdminStreamflowStateFilter =
  | "all"
  | "manual_review"
  | "clear_review_eligible"
  | "matched"
  | "missing_artifact"
  | "mismatched"
  | "duplicate_artifact";

function serializeItem(record: AdminStreamflowRecord): AdminStreamflowItem {
  const lastAttempt = record.streamflowReconciliationAttempts[0] ?? null;
  const lastManualReviewClearAttempt =
    record.streamflowReconciliationAttempts.find(
      (attempt) => attempt.attemptType === "admin-clear-manual-review" && attempt.result === "cleared",
    ) ?? null;
  const lastManualReviewClearDetails = parseAttemptDetails(lastManualReviewClearAttempt?.detailsJson ?? null);
  const lastManualReviewClearedBy =
    typeof lastManualReviewClearDetails?.clearedBy === "string"
      ? lastManualReviewClearDetails.clearedBy
      : null;
  const lastManualReviewClearedAt =
    typeof lastManualReviewClearDetails?.clearedAt === "string"
      ? lastManualReviewClearDetails.clearedAt
      : lastManualReviewClearAttempt?.createdAt.toISOString() ?? null;

  return {
    id: record.id,
    walletAddress: record.walletAddress,
    totalAmount: record.totalAmount.toString(),
    withdrawnAmount: record.withdrawnAmount.toString(),
    lockedAt: record.lockedAt.toISOString(),
    unlockAt: record.unlockAt.toISOString(),
    status: record.status,
    vestingProvider: record.vestingProvider,
    streamflowLifecycleStatus: record.streamflowLifecycleStatus,
    vestingReference: record.vestingReference,
    streamflowClientCorrelationId: record.streamflowClientCorrelationId,
    streamflowExpectedVestingKind: record.streamflowExpectedVestingKind,
    streamflowExpectedRecipientWalletAddress: record.streamflowExpectedRecipientWalletAddress,
    streamflowExpectedMintAddress: record.streamflowExpectedMintAddress,
    streamflowExpectedAmountAtomic: record.streamflowExpectedAmountAtomic?.toString() ?? null,
    streamflowExpectedStartAt: record.streamflowExpectedStartAt?.toISOString() ?? null,
    streamflowExpectedEndAt: record.streamflowExpectedEndAt?.toISOString() ?? null,
    streamflowScheduleId: record.streamflowScheduleId,
    streamflowTreasuryAddress: record.streamflowTreasuryAddress,
    streamflowEscrowAddress: record.streamflowEscrowAddress,
    streamflowBeneficiaryAddress: record.streamflowBeneficiaryAddress,
    streamflowMintAddress: record.streamflowMintAddress,
    streamflowCreationTxSignature: record.streamflowCreationTxSignature,
    streamflowPreparedAt: record.streamflowPreparedAt?.toISOString() ?? null,
    streamflowScheduleCreatedAt: record.streamflowScheduleCreatedAt?.toISOString() ?? null,
    streamflowConfirmedAt: record.streamflowConfirmedAt?.toISOString() ?? null,
    streamflowLastReconciledAt: record.streamflowLastReconciledAt?.toISOString() ?? null,
    streamflowNextReconcileAt: record.streamflowNextReconcileAt?.toISOString() ?? null,
    streamflowReconcileAttemptCount: record.streamflowReconcileAttemptCount,
    streamflowObservedScheduleState: record.streamflowObservedScheduleState,
    streamflowObservedCreationTxSignature: record.streamflowObservedCreationTxSignature,
    streamflowReconciliationFailureReason: record.streamflowReconciliationFailureReason,
    streamflowManualReviewRequired: record.streamflowManualReviewRequired,
    streamflowManualReviewReason: record.streamflowManualReviewReason,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    exchange: {
      id: record.exchange.id,
      userWalletAddress: record.exchange.user.walletAddress,
    },
    lastAttemptAt: lastAttempt?.createdAt.toISOString() ?? null,
    lastAttemptOutcome: lastAttempt?.result ?? null,
    canClearManualReview:
      record.streamflowManualReviewRequired &&
      record.streamflowLifecycleStatus === "matched" &&
      lastAttempt?.result === "matched",
    lastManualReviewClearedAt,
    lastManualReviewClearedBy,
    reconciliationAttempts: record.streamflowReconciliationAttempts.map((attempt) => ({
      id: attempt.id,
      attemptType: attempt.attemptType,
      result: attempt.result,
      observedScheduleId: attempt.observedScheduleId,
      observedTxSignature: attempt.observedTxSignature,
      observedState: attempt.observedState,
      matchedBy: attempt.matchedBy,
      errorMessage: attempt.errorMessage,
      detailsJson: attempt.detailsJson,
      createdAt: attempt.createdAt.toISOString(),
    })),
  };
}

function matchesStateFilter(item: AdminStreamflowItem, filter: AdminStreamflowStateFilter) {
  switch (filter) {
    case "all":
      return true;
    case "manual_review":
      return item.streamflowManualReviewRequired;
    case "clear_review_eligible":
      return item.canClearManualReview;
    case "matched":
      return item.streamflowLifecycleStatus === "matched";
    case "missing_artifact":
      return item.streamflowLifecycleStatus === "missing_artifact";
    case "mismatched":
      return item.streamflowLifecycleStatus === "mismatched";
    case "duplicate_artifact":
      return item.streamflowLifecycleStatus === "duplicate_artifact";
  }
}

export async function getAdminStreamflowDashboard(filter: AdminStreamflowStateFilter = "all") {
  const items = await db.vestingPosition.findMany({
    where: {
      vestingProvider: "streamflow",
    },
    orderBy: [
      { streamflowManualReviewRequired: "desc" },
      { streamflowNextReconcileAt: "asc" },
      { createdAt: "desc" },
    ],
    select: adminStreamflowSelect,
  });

  const serialized = items.map(serializeItem);
  const filteredItems = serialized.filter((item) => matchesStateFilter(item, filter));

  return {
    items: filteredItems,
    filter,
    summary: {
      total: serialized.length,
      filtered: filteredItems.length,
      eligible: serialized.filter(
        (item) =>
          !item.streamflowManualReviewRequired &&
          (item.streamflowLifecycleStatus === null ||
            ["expected_only", "pending_reconciliation", "missing_artifact", "retryable_failure"].includes(
              item.streamflowLifecycleStatus,
            )),
      ).length,
      manualReview: serialized.filter((item) => item.streamflowManualReviewRequired).length,
      matched: serialized.filter((item) => item.streamflowLifecycleStatus === "matched").length,
      missingArtifact: serialized.filter((item) => item.streamflowLifecycleStatus === "missing_artifact")
        .length,
      mismatched: serialized.filter((item) => item.streamflowLifecycleStatus === "mismatched").length,
      duplicateArtifact: serialized.filter(
        (item) => item.streamflowLifecycleStatus === "duplicate_artifact",
      ).length,
    },
  };
}
