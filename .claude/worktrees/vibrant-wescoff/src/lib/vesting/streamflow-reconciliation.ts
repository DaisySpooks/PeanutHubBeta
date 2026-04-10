import { db } from "@/lib/db";

function truncateText(value?: string | null, maxLength = 1_000) {
  if (!value) {
    return null;
  }

  return value.slice(0, maxLength);
}

function truncateDetails(detailsJson?: string | null) {
  if (!detailsJson) {
    return null;
  }

  return detailsJson.slice(0, 10_000);
}

export async function recordVestingStreamflowReconciliationAttempt(params: {
  vestingPositionId: string;
  attemptType: string;
  result: string;
  observedScheduleId?: string | null;
  observedTxSignature?: string | null;
  observedState?: string | null;
  matchedBy?: string | null;
  errorMessage?: string | null;
  detailsJson?: string | null;
}) {
  await db.vestingStreamflowReconciliationAttempt.create({
    data: {
      vestingPositionId: params.vestingPositionId,
      attemptType: params.attemptType,
      result: params.result,
      observedScheduleId: params.observedScheduleId ?? null,
      observedTxSignature: params.observedTxSignature ?? null,
      observedState: params.observedState ?? null,
      matchedBy: params.matchedBy ?? null,
      errorMessage: truncateText(params.errorMessage),
      detailsJson: truncateDetails(params.detailsJson),
    },
  });
}

export async function updateVestingStreamflowTracking(params: {
  vestingPositionId: string;
  vestingProvider?: string | null;
  streamflowLifecycleStatus?: string | null;
  vestingReference?: string | null;
  streamflowClientCorrelationId?: string | null;
  streamflowScheduleId?: string | null;
  streamflowTreasuryAddress?: string | null;
  streamflowEscrowAddress?: string | null;
  streamflowBeneficiaryAddress?: string | null;
  streamflowMintAddress?: string | null;
  streamflowCreationTxSignature?: string | null;
  streamflowPreparedAt?: Date | null;
  streamflowScheduleCreatedAt?: Date | null;
  streamflowConfirmedAt?: Date | null;
  streamflowLastReconciledAt?: Date | null;
  streamflowNextReconcileAt?: Date | null;
  streamflowObservedScheduleState?: string | null;
  streamflowObservedCreationTxSignature?: string | null;
  streamflowReconciliationFailureReason?: string | null;
  streamflowManualReviewRequired?: boolean;
  streamflowManualReviewReason?: string | null;
  incrementReconcileAttemptCount?: boolean;
}) {
  await db.vestingPosition.update({
    where: { id: params.vestingPositionId },
    data: {
      vestingProvider: params.vestingProvider,
      streamflowLifecycleStatus: params.streamflowLifecycleStatus,
      vestingReference: params.vestingReference,
      streamflowClientCorrelationId: params.streamflowClientCorrelationId,
      streamflowScheduleId: params.streamflowScheduleId,
      streamflowTreasuryAddress: params.streamflowTreasuryAddress,
      streamflowEscrowAddress: params.streamflowEscrowAddress,
      streamflowBeneficiaryAddress: params.streamflowBeneficiaryAddress,
      streamflowMintAddress: params.streamflowMintAddress,
      streamflowCreationTxSignature: params.streamflowCreationTxSignature,
      streamflowPreparedAt: params.streamflowPreparedAt,
      streamflowScheduleCreatedAt: params.streamflowScheduleCreatedAt,
      streamflowConfirmedAt: params.streamflowConfirmedAt,
      streamflowLastReconciledAt: params.streamflowLastReconciledAt,
      streamflowNextReconcileAt: params.streamflowNextReconcileAt,
      streamflowObservedScheduleState: params.streamflowObservedScheduleState,
      streamflowObservedCreationTxSignature: params.streamflowObservedCreationTxSignature,
      streamflowReconciliationFailureReason: truncateText(
        params.streamflowReconciliationFailureReason,
      ),
      streamflowManualReviewRequired: params.streamflowManualReviewRequired,
      streamflowManualReviewReason: truncateText(params.streamflowManualReviewReason),
      streamflowReconcileAttemptCount: params.incrementReconcileAttemptCount
        ? {
            increment: 1,
          }
        : undefined,
    },
  });
}

export async function flagVestingStreamflowManualReview(params: {
  vestingPositionId: string;
  reason: string;
}) {
  await db.vestingPosition.update({
    where: { id: params.vestingPositionId },
    data: {
      streamflowManualReviewRequired: true,
      streamflowManualReviewReason: truncateText(params.reason),
      streamflowLastReconciledAt: new Date(),
    },
  });
}

export async function clearVestingStreamflowManualReview(params: {
  vestingPositionId: string;
  clearedBy: string;
  latestMatchedAttemptId: string;
  previousManualReviewReason?: string | null;
  operatorNote?: string | null;
}) {
  const clearedAt = new Date();

  await db.$transaction([
    db.vestingPosition.update({
      where: {
        id: params.vestingPositionId,
      },
      data: {
        streamflowManualReviewRequired: false,
        streamflowManualReviewReason: null,
        streamflowLastReconciledAt: clearedAt,
      },
    }),
    db.vestingStreamflowReconciliationAttempt.create({
      data: {
        vestingPositionId: params.vestingPositionId,
        attemptType: "admin-clear-manual-review",
        result: "cleared",
        detailsJson: truncateDetails(
          JSON.stringify({
            clearedBy: params.clearedBy,
            clearedAt: clearedAt.toISOString(),
            latestMatchedAttemptId: params.latestMatchedAttemptId,
            previousManualReviewReason: params.previousManualReviewReason ?? null,
            operatorNote: params.operatorNote ?? null,
          }),
        ),
      },
    }),
  ]);

  return {
    clearedAt,
  };
}
