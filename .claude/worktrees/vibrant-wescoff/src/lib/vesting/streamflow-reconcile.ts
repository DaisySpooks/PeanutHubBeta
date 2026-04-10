import {
  getStreamflowArtifactMatchStrength,
  matchCreatedStreamflowArtifactToExpectedLock,
  type StreamflowCreatedArtifactSnapshot,
  type StreamflowLockMatchResult,
  type StreamflowLockSnapshot,
} from "./streamflow-match";
import type { StreamflowVestingKind } from "./streamflow-adapter";
import type {
  MockStreamflowObservedArtifact,
  MockStreamflowObservedArtifactSource,
} from "./mock-streamflow-observed-artifacts";
import type {
  recordVestingStreamflowReconciliationAttempt,
  updateVestingStreamflowTracking,
} from "./streamflow-reconciliation";

const MAX_MISSING_ARTIFACT_ATTEMPTS = 3;
const MAX_RETRYABLE_FAILURE_ATTEMPTS = 3;
const MAX_RETRY_BACKOFF_MS = 60 * 60 * 1000;

export type StreamflowReconciliationLifecycleStatus =
  | "expected_only"
  | "pending_reconciliation"
  | "matched"
  | "missing_artifact"
  | "mismatched"
  | "duplicate_artifact"
  | "retryable_failure"
  | "manual_review";

export type StreamflowMismatchReason =
  | "recipient_mismatch"
  | "mint_mismatch"
  | "amount_mismatch"
  | "start_at_mismatch"
  | "end_at_mismatch"
  | "vesting_kind_mismatch";

export type StreamflowReconcileResult =
  | {
      status: "matched";
      vestingPositionId: string;
      scheduleId: string;
      matchedBy: "client_correlation_id" | "vesting_reference" | "artifact_tuple";
    }
  | {
      status: "missing_artifact";
      vestingPositionId: string;
      retryAt: Date;
    }
  | {
      status: "mismatched";
      vestingPositionId: string;
      scheduleId: string;
      reason: StreamflowMismatchReason;
      manualReviewRequired: boolean;
    }
  | {
      status: "duplicate_artifact";
      vestingPositionId: string;
      candidateScheduleIds: string[];
    }
  | {
      status: "retryable_failure";
      vestingPositionId: string;
      reason: string;
      retryAt: Date;
    }
  | {
      status: "manual_review";
      vestingPositionId: string;
      reason: string;
    };

export type StreamflowReconcileSummary = {
  matched: number;
  missingArtifact: number;
  mismatched: number;
  duplicateArtifact: number;
  retryableFailure: number;
  manualReviewRequired: number;
};

type StreamflowTrackedVestingPosition = {
  id: string;
  vestingProvider: string | null;
  vestingReference: string | null;
  streamflowClientCorrelationId: string | null;
  streamflowExpectedRecipientWalletAddress: string | null;
  streamflowExpectedMintAddress: string | null;
  streamflowExpectedAmountAtomic: bigint | null;
  streamflowExpectedStartAt: Date | null;
  streamflowExpectedEndAt: Date | null;
  streamflowExpectedVestingKind: string | null;
  streamflowReconcileAttemptCount: number;
  streamflowManualReviewRequired: boolean;
};

export interface StreamflowReconciliationRepository {
  getTrackedVestingPosition(
    vestingPositionId: string,
  ): Promise<StreamflowTrackedVestingPosition | null>;
  updateTracking(params: Parameters<typeof updateVestingStreamflowTracking>[0]): Promise<void>;
  recordAttempt(
    params: Parameters<typeof recordVestingStreamflowReconciliationAttempt>[0],
  ): Promise<void>;
}

class PrismaStreamflowReconciliationRepository implements StreamflowReconciliationRepository {
  async getTrackedVestingPosition(vestingPositionId: string) {
    const { db } = await import("@/lib/db");
    return db.vestingPosition.findUnique({
      where: { id: vestingPositionId },
      select: {
        id: true,
        vestingProvider: true,
        vestingReference: true,
        streamflowClientCorrelationId: true,
        streamflowExpectedRecipientWalletAddress: true,
        streamflowExpectedMintAddress: true,
        streamflowExpectedAmountAtomic: true,
        streamflowExpectedStartAt: true,
        streamflowExpectedEndAt: true,
        streamflowExpectedVestingKind: true,
        streamflowReconcileAttemptCount: true,
        streamflowManualReviewRequired: true,
      },
    });
  }

  async updateTracking(params: Parameters<typeof updateVestingStreamflowTracking>[0]) {
    const { updateVestingStreamflowTracking } = await import("./streamflow-reconciliation");
    await updateVestingStreamflowTracking(params);
  }

  async recordAttempt(
    params: Parameters<typeof recordVestingStreamflowReconciliationAttempt>[0],
  ) {
    const { recordVestingStreamflowReconciliationAttempt } = await import(
      "./streamflow-reconciliation"
    );
    await recordVestingStreamflowReconciliationAttempt(params);
  }
}

function createEmptySummary(): StreamflowReconcileSummary {
  return {
    matched: 0,
    missingArtifact: 0,
    mismatched: 0,
    duplicateArtifact: 0,
    retryableFailure: 0,
    manualReviewRequired: 0,
  };
}

function addResultToSummary(summary: StreamflowReconcileSummary, result: StreamflowReconcileResult) {
  switch (result.status) {
    case "matched":
      summary.matched += 1;
      break;
    case "missing_artifact":
      summary.missingArtifact += 1;
      break;
    case "mismatched":
      summary.mismatched += 1;
      if (result.manualReviewRequired) {
        summary.manualReviewRequired += 1;
      }
      break;
    case "duplicate_artifact":
      summary.duplicateArtifact += 1;
      summary.manualReviewRequired += 1;
      break;
    case "retryable_failure":
      summary.retryableFailure += 1;
      break;
    case "manual_review":
      summary.manualReviewRequired += 1;
      break;
  }

  return summary;
}

function computeRetryAt(attemptCount: number) {
  const exponent = Math.max(0, attemptCount);
  const delay = Math.min(60_000 * 2 ** exponent, MAX_RETRY_BACKOFF_MS);
  return new Date(Date.now() + delay);
}

function buildExpectedSnapshot(
  vesting: StreamflowTrackedVestingPosition,
): StreamflowLockSnapshot {
  if (
    !vesting.vestingReference ||
    !vesting.streamflowExpectedRecipientWalletAddress ||
    !vesting.streamflowExpectedMintAddress ||
    vesting.streamflowExpectedAmountAtomic === null ||
    !vesting.streamflowExpectedStartAt ||
    !vesting.streamflowExpectedEndAt ||
    !vesting.streamflowExpectedVestingKind
  ) {
    throw new Error(`Vesting position ${vesting.id} is missing required Streamflow expectation fields.`);
  }

  return {
    vestingReference: vesting.vestingReference,
    clientCorrelationId: vesting.streamflowClientCorrelationId,
    recipientWalletAddress: vesting.streamflowExpectedRecipientWalletAddress,
    mintAddress: vesting.streamflowExpectedMintAddress,
    amountAtomic: vesting.streamflowExpectedAmountAtomic,
    startAt: vesting.streamflowExpectedStartAt,
    endAt: vesting.streamflowExpectedEndAt,
    vestingKind: vesting.streamflowExpectedVestingKind as StreamflowVestingKind,
  };
}

function classifyMismatch(
  expected: StreamflowLockSnapshot,
  observed: StreamflowCreatedArtifactSnapshot,
): StreamflowMismatchReason {
  const result = matchCreatedStreamflowArtifactToExpectedLock(expected, observed);
  if (result.matches) {
    throw new Error("Cannot classify mismatch for a matching artifact.");
  }

  return result.reason;
}

function toDetailsJson(value: unknown) {
  return JSON.stringify(value, (_key, nestedValue) =>
    typeof nestedValue === "bigint" ? nestedValue.toString() : nestedValue,
  );
}

function isHighConfidenceCandidate(
  expected: StreamflowLockSnapshot,
  observed: StreamflowCreatedArtifactSnapshot,
) {
  return Boolean(getStreamflowArtifactMatchStrength(expected, observed));
}

function selectExactMatches(
  expected: StreamflowLockSnapshot,
  observedArtifacts: MockStreamflowObservedArtifact[],
) {
  return observedArtifacts
    .map((artifact) => ({
      artifact,
      tupleMatch: matchCreatedStreamflowArtifactToExpectedLock(expected, artifact),
      matchedBy: getStreamflowArtifactMatchStrength(expected, artifact),
    }))
    .filter(
      (
        candidate,
      ): candidate is {
        artifact: MockStreamflowObservedArtifact;
        tupleMatch: Extract<StreamflowLockMatchResult, { matches: true }>;
        matchedBy: "client_correlation_id" | "vesting_reference" | "artifact_tuple";
      } => candidate.tupleMatch.matches && candidate.matchedBy !== null,
    );
}

export async function reconcileVestingPositionWithMockStreamflow(params: {
  vestingPositionId: string;
  triggeredBy: string;
  artifactSource: MockStreamflowObservedArtifactSource;
  repository?: StreamflowReconciliationRepository;
  force?: boolean;
}): Promise<StreamflowReconcileResult> {
  const repository = params.repository ?? new PrismaStreamflowReconciliationRepository();
  const vesting = await repository.getTrackedVestingPosition(params.vestingPositionId);

  if (!vesting) {
    throw new Error("Vesting position not found.");
  }

  if (vesting.vestingProvider !== "streamflow") {
    throw new Error(`Vesting position ${vesting.id} is not configured for Streamflow reconciliation.`);
  }

  if (vesting.streamflowManualReviewRequired && !params.force) {
    return {
      status: "manual_review",
      vestingPositionId: vesting.id,
      reason: "Vesting position is already flagged for manual review.",
    };
  }

  const expected = buildExpectedSnapshot(vesting);
  const now = new Date();

  try {
    await repository.updateTracking({
      vestingPositionId: vesting.id,
      streamflowLifecycleStatus: "pending_reconciliation",
      streamflowLastReconciledAt: now,
    });

    const observedArtifacts = await params.artifactSource.findArtifacts({
      vestingReference: expected.vestingReference,
      clientCorrelationId: expected.clientCorrelationId,
      expectedRecipientWalletAddress: expected.recipientWalletAddress,
      expectedMintAddress: expected.mintAddress,
      expectedAmountAtomic: expected.amountAtomic,
      expectedStartAt: expected.startAt,
      expectedEndAt: expected.endAt,
      expectedVestingKind: expected.vestingKind,
    });

    if (observedArtifacts.length === 0) {
      const retryAt = computeRetryAt(vesting.streamflowReconcileAttemptCount);
      const nextAttemptCount = vesting.streamflowReconcileAttemptCount + 1;
      const requiresManualReview = nextAttemptCount >= MAX_MISSING_ARTIFACT_ATTEMPTS;

      await repository.updateTracking({
        vestingPositionId: vesting.id,
        streamflowLifecycleStatus: requiresManualReview ? "manual_review" : "missing_artifact",
        streamflowLastReconciledAt: now,
        streamflowNextReconcileAt: requiresManualReview ? null : retryAt,
        streamflowReconciliationFailureReason: "No mocked Streamflow artifact matched the expected lock snapshot.",
        streamflowManualReviewRequired: requiresManualReview,
        streamflowManualReviewReason: requiresManualReview
          ? "No mocked Streamflow artifact was found after repeated reconciliation attempts."
          : null,
        incrementReconcileAttemptCount: true,
      });

      await repository.recordAttempt({
        vestingPositionId: vesting.id,
        attemptType: "mock-search",
        result: requiresManualReview ? "manual_review" : "missing_artifact",
        errorMessage: "No mocked Streamflow artifact matched the expected lock snapshot.",
        detailsJson: toDetailsJson({
          triggeredBy: params.triggeredBy,
          attemptCount: nextAttemptCount,
        }),
      });

      return requiresManualReview
        ? {
            status: "manual_review",
            vestingPositionId: vesting.id,
            reason: "No mocked Streamflow artifact was found after repeated reconciliation attempts.",
          }
        : {
            status: "missing_artifact",
            vestingPositionId: vesting.id,
            retryAt,
          };
    }

    const exactMatches = selectExactMatches(expected, observedArtifacts);
    if (exactMatches.length === 1) {
      const { artifact, matchedBy } = exactMatches[0];

      await repository.updateTracking({
        vestingPositionId: vesting.id,
        streamflowLifecycleStatus: "matched",
        streamflowScheduleId: artifact.scheduleId,
        streamflowTreasuryAddress: artifact.treasuryAddress ?? null,
        streamflowEscrowAddress: artifact.escrowAddress ?? null,
        streamflowBeneficiaryAddress: artifact.beneficiaryAddress,
        streamflowMintAddress: artifact.mintAddress,
        streamflowCreationTxSignature: artifact.txSignature ?? null,
        streamflowScheduleCreatedAt: artifact.observedAt,
        streamflowLastReconciledAt: now,
        streamflowNextReconcileAt: null,
        streamflowObservedScheduleState: artifact.observedState,
        streamflowObservedCreationTxSignature: artifact.txSignature ?? null,
        streamflowReconciliationFailureReason: null,
        streamflowManualReviewRequired: false,
        streamflowManualReviewReason: null,
        incrementReconcileAttemptCount: true,
      });

      await repository.recordAttempt({
        vestingPositionId: vesting.id,
        attemptType: "mock-match",
        result: "matched",
        observedScheduleId: artifact.scheduleId,
        observedTxSignature: artifact.txSignature ?? null,
        observedState: artifact.observedState,
        matchedBy,
        detailsJson: toDetailsJson({
          triggeredBy: params.triggeredBy,
          artifactId: artifact.artifactId,
        }),
      });

      return {
        status: "matched",
        vestingPositionId: vesting.id,
        scheduleId: artifact.scheduleId,
        matchedBy,
      };
    }

    if (exactMatches.length > 1) {
      const candidateScheduleIds = exactMatches.map((candidate) => candidate.artifact.scheduleId);

      await repository.updateTracking({
        vestingPositionId: vesting.id,
        streamflowLifecycleStatus: "duplicate_artifact",
        streamflowLastReconciledAt: now,
        streamflowNextReconcileAt: null,
        streamflowReconciliationFailureReason:
          "Multiple mocked Streamflow artifacts matched the same expected lock snapshot.",
        streamflowManualReviewRequired: true,
        streamflowManualReviewReason:
          "Multiple mocked Streamflow artifacts matched the same expected lock snapshot.",
        incrementReconcileAttemptCount: true,
      });

      await repository.recordAttempt({
        vestingPositionId: vesting.id,
        attemptType: "mock-search",
        result: "duplicate_artifact",
        errorMessage: "Multiple mocked Streamflow artifacts matched the same expected lock snapshot.",
        detailsJson: toDetailsJson({
          triggeredBy: params.triggeredBy,
          candidateScheduleIds,
        }),
      });

      return {
        status: "duplicate_artifact",
        vestingPositionId: vesting.id,
        candidateScheduleIds,
      };
    }

    const likelyCandidates = observedArtifacts.filter((artifact) =>
      isHighConfidenceCandidate(expected, artifact),
    );
    const mismatchArtifact = likelyCandidates[0] ?? observedArtifacts[0];
    const mismatchReason = classifyMismatch(expected, mismatchArtifact);

    await repository.updateTracking({
      vestingPositionId: vesting.id,
      streamflowLifecycleStatus: "mismatched",
      streamflowScheduleId: mismatchArtifact.scheduleId,
      streamflowObservedScheduleState: mismatchArtifact.observedState,
      streamflowObservedCreationTxSignature: mismatchArtifact.txSignature ?? null,
      streamflowLastReconciledAt: now,
      streamflowNextReconcileAt: null,
      streamflowReconciliationFailureReason: mismatchReason,
      streamflowManualReviewRequired: true,
      streamflowManualReviewReason: `Mocked Streamflow artifact mismatch: ${mismatchReason}.`,
      incrementReconcileAttemptCount: true,
    });

    await repository.recordAttempt({
      vestingPositionId: vesting.id,
      attemptType: "mock-search",
      result: "mismatched",
      observedScheduleId: mismatchArtifact.scheduleId,
      observedTxSignature: mismatchArtifact.txSignature ?? null,
      observedState: mismatchArtifact.observedState,
      errorMessage: mismatchReason,
      detailsJson: toDetailsJson({
        triggeredBy: params.triggeredBy,
        artifactId: mismatchArtifact.artifactId,
      }),
    });

    return {
      status: "mismatched",
      vestingPositionId: vesting.id,
      scheduleId: mismatchArtifact.scheduleId,
      reason: mismatchReason,
      manualReviewRequired: true,
    };
  } catch (error) {
    const retryAt = computeRetryAt(vesting.streamflowReconcileAttemptCount);
    const nextAttemptCount = vesting.streamflowReconcileAttemptCount + 1;
    const message = error instanceof Error ? error.message : "Unknown mock Streamflow reconciliation error.";
    const requiresManualReview = nextAttemptCount >= MAX_RETRYABLE_FAILURE_ATTEMPTS;

    await repository.updateTracking({
      vestingPositionId: vesting.id,
      streamflowLifecycleStatus: requiresManualReview ? "manual_review" : "retryable_failure",
      streamflowLastReconciledAt: now,
      streamflowNextReconcileAt: requiresManualReview ? null : retryAt,
      streamflowReconciliationFailureReason: message,
      streamflowManualReviewRequired: requiresManualReview,
      streamflowManualReviewReason: requiresManualReview
        ? "Mocked Streamflow reconciliation kept failing and now requires manual review."
        : null,
      incrementReconcileAttemptCount: true,
    });

    await repository.recordAttempt({
      vestingPositionId: vesting.id,
      attemptType: "mock-search",
      result: requiresManualReview ? "manual_review" : "retryable_failure",
      errorMessage: message,
      detailsJson: toDetailsJson({
        triggeredBy: params.triggeredBy,
        attemptCount: nextAttemptCount,
      }),
    });

    return requiresManualReview
      ? {
          status: "manual_review",
          vestingPositionId: vesting.id,
          reason: "Mocked Streamflow reconciliation kept failing and now requires manual review.",
        }
      : {
          status: "retryable_failure",
          vestingPositionId: vesting.id,
          reason: message,
          retryAt,
        };
  }
}

export async function listEligibleMockStreamflowVestingPositionIds(params?: {
  limit?: number;
}) {
  const { db } = await import("@/lib/db");
  const now = new Date();

  const items = await db.vestingPosition.findMany({
    where: {
      vestingProvider: "streamflow",
      streamflowManualReviewRequired: false,
      AND: [
        {
          OR: [
            {
              streamflowLifecycleStatus: null,
            },
            {
              streamflowLifecycleStatus: {
                in: ["expected_only", "pending_reconciliation", "missing_artifact", "retryable_failure"],
              },
            },
          ],
        },
        {
          OR: [
            {
              streamflowNextReconcileAt: null,
            },
            {
              streamflowNextReconcileAt: {
                lte: now,
              },
            },
          ],
        },
      ],
    },
    orderBy: [
      {
        streamflowNextReconcileAt: "asc",
      },
      {
        createdAt: "asc",
      },
    ],
    take: params?.limit,
    select: {
      id: true,
    },
  });

  return items.map((item) => item.id);
}

export async function reconcileEligibleVestingPositionsWithMockStreamflow(params: {
  triggeredBy: string;
  artifactSource: MockStreamflowObservedArtifactSource;
  limit?: number;
}) {
  const vestingPositionIds = await listEligibleMockStreamflowVestingPositionIds({
    limit: params.limit,
  });

  const summary = createEmptySummary();
  const results: StreamflowReconcileResult[] = [];

  for (const vestingPositionId of vestingPositionIds) {
    const result = await reconcileVestingPositionWithMockStreamflow({
      vestingPositionId,
      triggeredBy: params.triggeredBy,
      artifactSource: params.artifactSource,
    });

    results.push(result);
    addResultToSummary(summary, result);
  }

  return {
    vestingPositionIds,
    processedCount: results.length,
    summary,
    results,
  };
}
