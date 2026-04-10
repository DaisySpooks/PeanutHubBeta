import { VestingStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { serverEnv } from "@/lib/config/server-env";
import {
  StreamflowAdapterError,
  type StreamflowAdapter,
  type StreamflowCreatedSchedule,
} from "./streamflow-adapter";
import {
  StreamflowPayloadValidationError,
  type StreamflowPayloadSource,
  buildStreamflowPayloadFromSource,
  toPersistedObservedSchedule,
  toPersistedObservedScheduleFromStatus,
} from "./streamflow-payload";
import {
  matchCreatedStreamflowArtifactToExpectedLock,
  type StreamflowCreatedArtifactSnapshot,
  type StreamflowLockSnapshot,
} from "./streamflow-match";
import {
  recordVestingStreamflowReconciliationAttempt,
  updateVestingStreamflowTracking,
} from "./streamflow-reconciliation";

const ELIGIBLE_LIFECYCLE_STATUSES = [null, "expected_only", "retryable_failure"];

export type StreamflowCreateResult =
  | {
      status: "created";
      vestingPositionId: string;
      scheduleId: string;
      txSignature: string | null;
      providerState?: "pending_creation" | "created" | "confirmed" | null;
      verificationState?: "verified" | "deferred";
      verificationReason?: string | null;
    }
  | {
      status: "manual_review";
      vestingPositionId: string;
      reason: string;
      scheduleId?: string | null;
      txSignature?: string | null;
      providerState?: string | null;
    }
  | {
      status: "validation_failed";
      vestingPositionId: string;
      reason: string;
    }
  | {
      status: "retryable_failure";
      vestingPositionId: string;
      reason: string;
    };

type CreateTrackedVestingPosition = {
  id: string;
  exchangeId: string;
  status: VestingStatus;
  withdrawnAmount: bigint;
  vestingProvider: string | null;
  streamflowLifecycleStatus: string | null;
  vestingReference: string | null;
  streamflowClientCorrelationId: string | null;
  streamflowExpectedRecipientWalletAddress: string | null;
  streamflowExpectedMintAddress: string | null;
  streamflowExpectedAmountAtomic: bigint | null;
  streamflowExpectedStartAt: Date | null;
  streamflowExpectedEndAt: Date | null;
  streamflowExpectedVestingKind: string | null;
  streamflowScheduleId: string | null;
  streamflowCreationTxSignature: string | null;
  streamflowObservedCreationTxSignature: string | null;
  streamflowScheduleCreatedAt: Date | null;
  streamflowObservedScheduleState: string | null;
  streamflowManualReviewRequired: boolean;
  streamflowManualReviewReason: string | null;
};

type StreamflowCreateRepository = {
  getTrackedVestingPosition(vestingPositionId: string): Promise<CreateTrackedVestingPosition | null>;
  claimForCreate(vestingPositionId: string): Promise<boolean>;
  updateTracking(
    params: Parameters<typeof updateVestingStreamflowTracking>[0],
  ): Promise<void>;
  recordAttempt(
    params: Parameters<typeof recordVestingStreamflowReconciliationAttempt>[0],
  ): Promise<void>;
};

class PrismaStreamflowCreateRepository implements StreamflowCreateRepository {
  async getTrackedVestingPosition(vestingPositionId: string) {
    return db.vestingPosition.findUnique({
      where: {
        id: vestingPositionId,
      },
      select: {
        id: true,
        exchangeId: true,
        status: true,
        withdrawnAmount: true,
        vestingProvider: true,
        streamflowLifecycleStatus: true,
        vestingReference: true,
        streamflowClientCorrelationId: true,
        streamflowExpectedRecipientWalletAddress: true,
        streamflowExpectedMintAddress: true,
        streamflowExpectedAmountAtomic: true,
        streamflowExpectedStartAt: true,
        streamflowExpectedEndAt: true,
        streamflowExpectedVestingKind: true,
        streamflowScheduleId: true,
        streamflowCreationTxSignature: true,
        streamflowObservedCreationTxSignature: true,
        streamflowScheduleCreatedAt: true,
        streamflowObservedScheduleState: true,
        streamflowManualReviewRequired: true,
        streamflowManualReviewReason: true,
      },
    });
  }

  async claimForCreate(vestingPositionId: string) {
    const result = await db.vestingPosition.updateMany({
      where: {
        id: vestingPositionId,
        vestingProvider: "streamflow",
        status: VestingStatus.LOCKED,
        streamflowManualReviewRequired: false,
        streamflowScheduleId: null,
        OR: ELIGIBLE_LIFECYCLE_STATUSES.map((status) =>
          status === null
            ? {
                streamflowLifecycleStatus: null,
              }
            : {
                streamflowLifecycleStatus: status,
              },
        ),
      },
      data: {
        streamflowLifecycleStatus: "pending_creation",
        streamflowReconciliationFailureReason: null,
        streamflowLastReconciledAt: new Date(),
      },
    });

    return result.count === 1;
  }

  async updateTracking(params: Parameters<typeof updateVestingStreamflowTracking>[0]) {
    await updateVestingStreamflowTracking(params);
  }

  async recordAttempt(params: Parameters<typeof recordVestingStreamflowReconciliationAttempt>[0]) {
    await recordVestingStreamflowReconciliationAttempt(params);
  }
}

export class StreamflowCreateEligibilityError extends StreamflowAdapterError {
  constructor(message: string) {
    super(message);
    this.name = "StreamflowCreateEligibilityError";
  }
}

export class StreamflowCreateExecutionGuardError extends StreamflowAdapterError {
  constructor(message: string) {
    super(message);
    this.name = "StreamflowCreateExecutionGuardError";
  }
}

function toDetailsJson(value: unknown) {
  return JSON.stringify(value, (_key, nestedValue) =>
    typeof nestedValue === "bigint" ? nestedValue.toString() : nestedValue,
  );
}

function assertCreateExecutionEnabled() {
  if (!serverEnv.STREAMFLOW_INTEGRATION_ENABLED) {
    throw new StreamflowCreateExecutionGuardError(
      "Streamflow integration is disabled. Enable it explicitly before attempting create execution.",
    );
  }

  if (serverEnv.STREAMFLOW_ADAPTER_MODE !== "sdk") {
    throw new StreamflowCreateExecutionGuardError(
      "Real Streamflow create flow requires STREAMFLOW_ADAPTER_MODE=sdk.",
    );
  }

  if (!serverEnv.STREAMFLOW_CREATE_ENABLED) {
    throw new StreamflowCreateExecutionGuardError(
      "STREAMFLOW_CREATE_ENABLED must be true before real Streamflow creation can run.",
    );
  }

  if (process.env.NODE_ENV === "production" && !serverEnv.STREAMFLOW_SDK_ALLOW_PRODUCTION) {
    throw new StreamflowCreateExecutionGuardError(
      "Real Streamflow creation is blocked in production until STREAMFLOW_SDK_ALLOW_PRODUCTION is explicitly enabled.",
    );
  }
}

function hasObservedCreationState(vesting: CreateTrackedVestingPosition) {
  return Boolean(
    vesting.streamflowCreationTxSignature ||
      vesting.streamflowObservedCreationTxSignature ||
      vesting.streamflowScheduleCreatedAt ||
      vesting.streamflowObservedScheduleState,
  );
}

function classifyEligibility(vesting: CreateTrackedVestingPosition) {
  if (vesting.vestingProvider !== "streamflow") {
    return {
      eligible: false,
      reason: `Vesting position ${vesting.id} is not configured for Streamflow.`,
      requiresManualReview: false,
    };
  }

  if (vesting.status !== VestingStatus.LOCKED) {
    return {
      eligible: false,
      reason: `Vesting position ${vesting.id} is not locked and cannot create a Streamflow schedule.`,
      requiresManualReview: false,
    };
  }

  if (vesting.withdrawnAmount > BigInt(0)) {
    return {
      eligible: false,
      reason: `Vesting position ${vesting.id} already has withdrawn funds and is not eligible for first-time Streamflow creation.`,
      requiresManualReview: true,
    };
  }

  if (vesting.streamflowManualReviewRequired) {
    return {
      eligible: false,
      reason: vesting.streamflowManualReviewReason ?? "Vesting position is already flagged for Streamflow manual review.",
      requiresManualReview: true,
    };
  }

  if (vesting.streamflowScheduleId) {
    return {
      eligible: false,
      reason: `Vesting position ${vesting.id} already has a Streamflow schedule id and cannot create again.`,
      requiresManualReview: false,
    };
  }

  if (hasObservedCreationState(vesting)) {
    return {
      eligible: false,
      reason:
        "Observed Streamflow creation state exists without a persisted schedule id. Manual review is required before any retry.",
      requiresManualReview: true,
    };
  }

  if (!ELIGIBLE_LIFECYCLE_STATUSES.includes(vesting.streamflowLifecycleStatus)) {
    return {
      eligible: false,
      reason: `Vesting position ${vesting.id} is in lifecycle state ${vesting.streamflowLifecycleStatus ?? "null"} and cannot create again.`,
      requiresManualReview: false,
    };
  }

  return {
    eligible: true,
    reason: null,
    requiresManualReview: false,
  };
}

function toPayloadSource(vesting: CreateTrackedVestingPosition): StreamflowPayloadSource {
  return {
    vestingPositionId: vesting.id,
    exchangeId: vesting.exchangeId,
    vestingReference: vesting.vestingReference,
    clientCorrelationId: vesting.streamflowClientCorrelationId,
    expectedRecipientWalletAddress: vesting.streamflowExpectedRecipientWalletAddress,
    expectedMintAddress: vesting.streamflowExpectedMintAddress,
    expectedAmountAtomic: vesting.streamflowExpectedAmountAtomic,
    expectedStartAt: vesting.streamflowExpectedStartAt,
    expectedEndAt: vesting.streamflowExpectedEndAt,
    expectedVestingKind: vesting.streamflowExpectedVestingKind,
    treasuryAddress: serverEnv.STREAMFLOW_TREASURY_ADDRESS ?? null,
  };
}

async function recordCreateAudit(params: {
  repository: StreamflowCreateRepository;
  vestingPositionId: string;
  attemptType: string;
  result: string;
  triggeredBy: string;
  errorMessage?: string | null;
  observedScheduleId?: string | null;
  observedTxSignature?: string | null;
  observedState?: string | null;
  details?: Record<string, unknown>;
}) {
  await params.repository.recordAttempt({
    vestingPositionId: params.vestingPositionId,
    attemptType: params.attemptType,
    result: params.result,
    observedScheduleId: params.observedScheduleId ?? null,
    observedTxSignature: params.observedTxSignature ?? null,
    observedState: params.observedState ?? null,
    errorMessage: params.errorMessage ?? null,
    detailsJson: toDetailsJson({
      triggeredBy: params.triggeredBy,
      ...(params.details ?? {}),
    }),
  });
}

async function persistCreateSuccess(params: {
  repository: StreamflowCreateRepository;
  vestingPositionId: string;
  triggeredBy: string;
  createdSchedule: StreamflowCreatedSchedule;
  preparedAt: Date;
}) {
  const observed = toPersistedObservedSchedule(params.createdSchedule);

  await params.repository.updateTracking({
    vestingPositionId: params.vestingPositionId,
    vestingProvider: "streamflow",
    streamflowLifecycleStatus: "created",
    streamflowScheduleId: observed.streamflowScheduleId,
    streamflowTreasuryAddress: observed.streamflowTreasuryAddress,
    streamflowEscrowAddress: observed.streamflowEscrowAddress,
    streamflowBeneficiaryAddress: observed.streamflowBeneficiaryAddress,
    streamflowMintAddress: observed.streamflowMintAddress,
    streamflowCreationTxSignature: observed.streamflowCreationTxSignature,
    streamflowPreparedAt: params.preparedAt,
    streamflowScheduleCreatedAt: observed.streamflowScheduleCreatedAt,
    streamflowConfirmedAt: observed.streamflowConfirmedAt,
    streamflowLastReconciledAt: new Date(),
    streamflowNextReconcileAt: new Date(),
    streamflowObservedScheduleState: observed.streamflowObservedScheduleState,
    streamflowObservedCreationTxSignature: observed.streamflowObservedCreationTxSignature,
    streamflowReconciliationFailureReason: null,
    streamflowManualReviewRequired: false,
    streamflowManualReviewReason: null,
    incrementReconcileAttemptCount: true,
  });

  await params.repository.recordAttempt({
    vestingPositionId: params.vestingPositionId,
    attemptType: "sdk-create",
    result: "created",
    observedScheduleId: observed.streamflowScheduleId,
    observedTxSignature: observed.streamflowCreationTxSignature,
    observedState: observed.streamflowObservedScheduleState,
    detailsJson: toDetailsJson({
      triggeredBy: params.triggeredBy,
      vestingPositionId: params.vestingPositionId,
    }),
  });
}

function buildExpectedSnapshot(
  request: StreamflowPayloadSource & {
    vestingReference: string;
    clientCorrelationId: string | null;
    expectedRecipientWalletAddress: string;
    expectedMintAddress: string;
    expectedAmountAtomic: bigint;
    expectedStartAt: Date;
    expectedEndAt: Date;
    expectedVestingKind: "token_lock" | "token_vesting";
  },
): StreamflowLockSnapshot {
  return {
    vestingReference: request.vestingReference,
    clientCorrelationId: request.clientCorrelationId,
    recipientWalletAddress: request.expectedRecipientWalletAddress,
    mintAddress: request.expectedMintAddress,
    amountAtomic: request.expectedAmountAtomic,
    startAt: request.expectedStartAt,
    endAt: request.expectedEndAt,
    vestingKind: request.expectedVestingKind,
  };
}

function buildObservedSnapshotFromStatus(params: {
  status: Extract<
    Awaited<ReturnType<StreamflowAdapter["getScheduleStatus"]>>,
    { state: "created" | "confirmed" }
  >;
  vestingReference: string;
  clientCorrelationId?: string | null;
}): StreamflowCreatedArtifactSnapshot {
  return {
    artifactId: params.status.scheduleId,
    vestingReference: params.vestingReference,
    clientCorrelationId: params.clientCorrelationId ?? null,
    scheduleId: params.status.scheduleId,
    beneficiaryAddress: params.status.beneficiaryAddress,
    mintAddress: params.status.mintAddress,
    amountAtomic: params.status.amountAtomic,
    startAt: params.status.startAt,
    endAt: params.status.endAt,
    vestingKind: params.status.vestingKind,
    escrowAddress: params.status.escrowAddress ?? null,
    treasuryAddress: params.status.treasuryAddress ?? null,
    txSignature: params.status.txSignature ?? null,
  };
}

async function attemptImmediateCreateVerification(params: {
  repository: StreamflowCreateRepository;
  adapter: StreamflowAdapter;
  triggeredBy: string;
  vestingPositionId: string;
  request: ReturnType<typeof buildStreamflowPayloadFromSource>["request"];
  createdSchedule: StreamflowCreatedSchedule;
}) {
  try {
    const status = await params.adapter.getScheduleStatus({
      vestingReference: params.request.vestingReference,
      scheduleId: params.createdSchedule.scheduleId,
    });

    if (status.state === "pending_creation") {
      await recordCreateAudit({
        repository: params.repository,
        vestingPositionId: params.vestingPositionId,
        attemptType: "sdk-create-verify",
        result: "pending_creation",
        triggeredBy: params.triggeredBy,
        observedScheduleId: params.createdSchedule.scheduleId,
        observedState: status.statusRaw,
      });

      return {
        outcome: "deferred" as const,
        providerState: status.state,
        reason: "Streamflow create succeeded, but the provider still reports pending creation.",
      };
    }

    if (status.state === "cancelled") {
      const reason = status.reason ?? "Streamflow reported the newly created schedule as cancelled.";

      await params.repository.updateTracking({
        vestingPositionId: params.vestingPositionId,
        streamflowLifecycleStatus: "manual_review",
        streamflowScheduleId: status.scheduleId ?? params.createdSchedule.scheduleId,
        streamflowLastReconciledAt: new Date(),
        streamflowNextReconcileAt: null,
        streamflowObservedScheduleState: status.statusRaw,
        streamflowReconciliationFailureReason: reason,
        streamflowManualReviewRequired: true,
        streamflowManualReviewReason: reason,
      });

      await recordCreateAudit({
        repository: params.repository,
        vestingPositionId: params.vestingPositionId,
        attemptType: "sdk-create-verify",
        result: "cancelled",
        triggeredBy: params.triggeredBy,
        observedScheduleId: status.scheduleId ?? params.createdSchedule.scheduleId,
        observedState: status.statusRaw,
        errorMessage: reason,
      });

      return {
        outcome: "manual_review" as const,
        reason,
        scheduleId: status.scheduleId ?? params.createdSchedule.scheduleId,
        txSignature: params.createdSchedule.txSignature ?? null,
        providerState: status.statusRaw,
      };
    }

    const expectedSnapshot = buildExpectedSnapshot({
      vestingPositionId: params.request.vestingPositionId,
      exchangeId: params.request.exchangeId,
      vestingReference: params.request.vestingReference,
      clientCorrelationId: params.request.clientCorrelationId ?? null,
      expectedRecipientWalletAddress: params.request.recipientWalletAddress,
      expectedMintAddress: params.request.mintAddress,
      expectedAmountAtomic: params.request.amountAtomic,
      expectedStartAt: params.request.startAt,
      expectedEndAt: params.request.endAt,
      expectedVestingKind: params.request.vestingKind,
      treasuryAddress: params.request.treasuryAddress ?? null,
    });
    const observedSnapshot = buildObservedSnapshotFromStatus({
      status,
      vestingReference: params.request.vestingReference,
      clientCorrelationId: params.request.clientCorrelationId ?? null,
    });
    const match = matchCreatedStreamflowArtifactToExpectedLock(expectedSnapshot, observedSnapshot);

    if (!match.matches) {
      const reason = `Observed Streamflow schedule does not match expected ${match.reason}.`;

      await params.repository.updateTracking({
        vestingPositionId: params.vestingPositionId,
        streamflowLifecycleStatus: "manual_review",
        streamflowScheduleId: status.scheduleId,
        streamflowTreasuryAddress: status.treasuryAddress ?? null,
        streamflowEscrowAddress: status.escrowAddress ?? null,
        streamflowBeneficiaryAddress: status.beneficiaryAddress,
        streamflowMintAddress: status.mintAddress,
        streamflowCreationTxSignature: status.txSignature ?? params.createdSchedule.txSignature ?? null,
        streamflowConfirmedAt: status.state === "confirmed" ? status.confirmedAt : null,
        streamflowLastReconciledAt: new Date(),
        streamflowNextReconcileAt: null,
        streamflowObservedScheduleState: status.statusRaw,
        streamflowObservedCreationTxSignature: status.txSignature ?? params.createdSchedule.txSignature ?? null,
        streamflowReconciliationFailureReason: reason,
        streamflowManualReviewRequired: true,
        streamflowManualReviewReason: reason,
      });

      await recordCreateAudit({
        repository: params.repository,
        vestingPositionId: params.vestingPositionId,
        attemptType: "sdk-create-verify",
        result: "mismatched",
        triggeredBy: params.triggeredBy,
        observedScheduleId: status.scheduleId,
        observedTxSignature: status.txSignature ?? params.createdSchedule.txSignature ?? null,
        observedState: status.statusRaw,
        errorMessage: reason,
        details: {
          mismatchReason: match.reason,
        },
      });

      return {
        outcome: "manual_review" as const,
        reason,
        scheduleId: status.scheduleId,
        txSignature: status.txSignature ?? params.createdSchedule.txSignature ?? null,
        providerState: status.statusRaw,
      };
    }

    const observed = toPersistedObservedScheduleFromStatus(status);
    const lifecycleStatus = status.state === "confirmed" ? "matched" : "created";

    await params.repository.updateTracking({
      vestingPositionId: params.vestingPositionId,
      streamflowLifecycleStatus: lifecycleStatus,
      streamflowScheduleId: observed.streamflowScheduleId,
      streamflowTreasuryAddress: observed.streamflowTreasuryAddress,
      streamflowEscrowAddress: observed.streamflowEscrowAddress,
      streamflowBeneficiaryAddress: observed.streamflowBeneficiaryAddress,
      streamflowMintAddress: observed.streamflowMintAddress,
      streamflowCreationTxSignature:
        observed.streamflowCreationTxSignature ?? params.createdSchedule.txSignature ?? null,
      streamflowScheduleCreatedAt:
        observed.streamflowScheduleCreatedAt ?? params.createdSchedule.createdAt,
      streamflowConfirmedAt: observed.streamflowConfirmedAt,
      streamflowLastReconciledAt: new Date(),
      streamflowNextReconcileAt: status.state === "confirmed" ? null : new Date(),
      streamflowObservedScheduleState: observed.streamflowObservedScheduleState,
      streamflowObservedCreationTxSignature:
        observed.streamflowObservedCreationTxSignature ?? params.createdSchedule.txSignature ?? null,
      streamflowReconciliationFailureReason: null,
      streamflowManualReviewRequired: false,
      streamflowManualReviewReason: null,
    });

    await recordCreateAudit({
      repository: params.repository,
      vestingPositionId: params.vestingPositionId,
      attemptType: "sdk-create-verify",
      result: status.state === "confirmed" ? "confirmed" : "created",
      triggeredBy: params.triggeredBy,
      observedScheduleId: status.scheduleId,
      observedTxSignature: status.txSignature ?? params.createdSchedule.txSignature ?? null,
      observedState: status.statusRaw,
      details: {
        providerState: status.state,
      },
    });

    return {
      outcome: "verified" as const,
      providerState: status.state,
    };
  } catch (error) {
    const { reason } = describeCreateFailure(error);

    await recordCreateAudit({
      repository: params.repository,
      vestingPositionId: params.vestingPositionId,
      attemptType: "sdk-create-verify",
      result: "deferred",
      triggeredBy: params.triggeredBy,
      observedScheduleId: params.createdSchedule.scheduleId,
      observedTxSignature: params.createdSchedule.txSignature ?? null,
      errorMessage: reason,
    });

    return {
      outcome: "deferred" as const,
      providerState: null,
      reason,
    };
  }
}

async function persistFailure(params: {
  repository: StreamflowCreateRepository;
  vestingPositionId: string;
  triggeredBy: string;
  result: "validation_failed" | "retryable_failure" | "manual_review";
  reason: string;
  manualReviewRequired: boolean;
  details?: Record<string, unknown>;
}) {
  await params.repository.updateTracking({
    vestingPositionId: params.vestingPositionId,
    streamflowLifecycleStatus: params.manualReviewRequired ? "manual_review" : "retryable_failure",
    streamflowLastReconciledAt: new Date(),
    streamflowNextReconcileAt: params.manualReviewRequired ? null : new Date(),
    streamflowReconciliationFailureReason: params.reason,
    streamflowManualReviewRequired: params.manualReviewRequired,
    streamflowManualReviewReason: params.manualReviewRequired ? params.reason : null,
    incrementReconcileAttemptCount: true,
  });

  await params.repository.recordAttempt({
    vestingPositionId: params.vestingPositionId,
    attemptType: "sdk-create",
    result: params.result,
    errorMessage: params.reason,
    detailsJson: toDetailsJson({
      triggeredBy: params.triggeredBy,
      vestingPositionId: params.vestingPositionId,
      ...(params.details ?? {}),
    }),
  });
}

function describeCreateFailure(error: unknown) {
  if (error instanceof StreamflowAdapterError) {
    const context =
      error instanceof Error && "context" in error
        ? (error as Error & { context?: Record<string, unknown> }).context
        : undefined;

    return {
      reason: error.message?.trim() || "Streamflow adapter failure with no message.",
      details: context ?? null,
    };
  }

  if (error instanceof Error) {
    return {
      reason: error.message?.trim() || `${error.name} with no message.`,
      details: {
        name: error.name,
        stack: error.stack ?? null,
        cause:
          "cause" in error
            ? (error as Error & { cause?: unknown }).cause ?? null
            : null,
      },
    };
  }

  return {
    reason: "Unknown Streamflow create failure.",
    details: {
      rawError: error ?? null,
    },
  };
}

export async function createStreamflowScheduleForVestingPosition(params: {
  vestingPositionId: string;
  triggeredBy: string;
  adapter?: StreamflowAdapter;
  repository?: StreamflowCreateRepository;
}): Promise<StreamflowCreateResult> {
  assertCreateExecutionEnabled();

  const repository = params.repository ?? new PrismaStreamflowCreateRepository();
  const adapter =
    params.adapter ??
    (await import("./configured-streamflow-adapter")).getConfiguredStreamflowAdapter();
  const vesting = await repository.getTrackedVestingPosition(params.vestingPositionId);

  if (!vesting) {
    throw new StreamflowCreateEligibilityError("Vesting position not found.");
  }

  const eligibility = classifyEligibility(vesting);
  if (!eligibility.eligible) {
    if (eligibility.requiresManualReview) {
      await recordCreateAudit({
        repository,
        vestingPositionId: vesting.id,
        attemptType: "sdk-create-refused",
        result: "manual_review",
        triggeredBy: params.triggeredBy,
        errorMessage: eligibility.reason ?? "Manual review is required before Streamflow creation can proceed.",
      });

      await persistFailure({
        repository,
        vestingPositionId: vesting.id,
        triggeredBy: params.triggeredBy,
        result: "manual_review",
        reason: eligibility.reason ?? "Manual review is required before Streamflow creation can proceed.",
        manualReviewRequired: true,
      });

      return {
        status: "manual_review",
        vestingPositionId: vesting.id,
        reason: eligibility.reason ?? "Manual review is required before Streamflow creation can proceed.",
      };
    }

    await recordCreateAudit({
      repository,
      vestingPositionId: vesting.id,
      attemptType: "sdk-create-refused",
      result: "refused",
      triggeredBy: params.triggeredBy,
      errorMessage:
        eligibility.reason ?? "Vesting position is not eligible for Streamflow creation.",
    });

    throw new StreamflowCreateEligibilityError(
      eligibility.reason ?? "Vesting position is not eligible for Streamflow creation.",
    );
  }

  const claimed = await repository.claimForCreate(vesting.id);
  if (!claimed) {
    await recordCreateAudit({
      repository,
      vestingPositionId: vesting.id,
      attemptType: "sdk-create-refused",
      result: "refused",
      triggeredBy: params.triggeredBy,
      errorMessage:
        "Vesting position is no longer eligible for Streamflow creation. Another process may have claimed it.",
    });

    throw new StreamflowCreateEligibilityError(
      "Vesting position is no longer eligible for Streamflow creation. Another process may have claimed it.",
    );
  }

  try {
    const { request, expectedSnapshot } = buildStreamflowPayloadFromSource(toPayloadSource(vesting));

    await recordCreateAudit({
      repository,
      vestingPositionId: vesting.id,
      attemptType: "sdk-create-requested",
      result: "pending",
      triggeredBy: params.triggeredBy,
      details: {
        vestingReference: request.vestingReference,
        clientCorrelationId: request.clientCorrelationId ?? null,
        expectedRecipientWalletAddress: request.recipientWalletAddress,
        expectedMintAddress: request.mintAddress,
        expectedAmountAtomic: request.amountAtomic.toString(),
        expectedStartAt: request.startAt.toISOString(),
        expectedEndAt: request.endAt.toISOString(),
        expectedVestingKind: request.vestingKind,
      },
    });

    const createdSchedule = await adapter.createSchedule(request);

    if (!createdSchedule.scheduleId) {
      throw new StreamflowAdapterError(
        "Streamflow create call did not return a schedule id.",
      );
    }

    await persistCreateSuccess({
      repository,
      vestingPositionId: vesting.id,
      triggeredBy: params.triggeredBy,
      createdSchedule,
      preparedAt: expectedSnapshot.preparedAt,
    });

    const verification = await attemptImmediateCreateVerification({
      repository,
      adapter,
      triggeredBy: params.triggeredBy,
      vestingPositionId: vesting.id,
      request,
      createdSchedule,
    });

    if (verification.outcome === "manual_review") {
      return {
        status: "manual_review",
        vestingPositionId: vesting.id,
        reason: verification.reason,
        scheduleId: verification.scheduleId,
        txSignature: verification.txSignature,
        providerState: verification.providerState,
      };
    }

    return {
      status: "created",
      vestingPositionId: vesting.id,
      scheduleId: createdSchedule.scheduleId,
      txSignature: createdSchedule.txSignature ?? null,
      providerState: verification.providerState,
      verificationState: verification.outcome === "verified" ? "verified" : "deferred",
      verificationReason: verification.outcome === "deferred" ? verification.reason : null,
    };
  } catch (error) {
    if (error instanceof StreamflowPayloadValidationError) {
      await persistFailure({
        repository,
        vestingPositionId: vesting.id,
        triggeredBy: params.triggeredBy,
        result: "validation_failed",
        reason: error.issues.map((issue) => issue.message).join(" "),
        manualReviewRequired: true,
      });

      return {
        status: "validation_failed",
        vestingPositionId: vesting.id,
        reason: error.issues.map((issue) => issue.message).join(" "),
      };
    }

    const message = error instanceof Error ? error.message : "Unknown Streamflow create failure.";
    const describedFailure = describeCreateFailure(error);

    await persistFailure({
      repository,
      vestingPositionId: vesting.id,
      triggeredBy: params.triggeredBy,
      result: "retryable_failure",
      reason: describedFailure.reason || message,
      manualReviewRequired: false,
      details: describedFailure.details ?? undefined,
    });

    return {
      status: "retryable_failure",
      vestingPositionId: vesting.id,
      reason: describedFailure.reason || message,
    };
  }
}
