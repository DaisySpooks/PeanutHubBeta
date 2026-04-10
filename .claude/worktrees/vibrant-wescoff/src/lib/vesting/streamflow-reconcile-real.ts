import { db } from "@/lib/db";
import { serverEnv } from "@/lib/config/server-env";
import type { StreamflowVestingKind } from "./streamflow-adapter";
import {
  StreamflowAdapterError,
  type StreamflowAdapter,
  type StreamflowScheduleStatus,
} from "./streamflow-adapter";
import {
  StreamflowPayloadValidationError,
  type StreamflowPayloadSource,
  buildStreamflowPayloadFromSource,
  toPersistedObservedScheduleFromStatus,
} from "./streamflow-payload";
import { matchCreatedStreamflowArtifactToExpectedLock } from "./streamflow-match";
import {
  recordVestingStreamflowReconciliationAttempt,
  updateVestingStreamflowTracking,
} from "./streamflow-reconciliation";

type ReconcileTrackedVestingPosition = {
  id: string;
  exchangeId: string;
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
  streamflowManualReviewRequired: boolean;
  streamflowManualReviewReason: string | null;
};

type StreamflowRealReconcileRepository = {
  getTrackedVestingPosition(
    vestingPositionId: string,
  ): Promise<ReconcileTrackedVestingPosition | null>;
  updateTracking(
    params: Parameters<typeof updateVestingStreamflowTracking>[0],
  ): Promise<void>;
  recordAttempt(
    params: Parameters<typeof recordVestingStreamflowReconciliationAttempt>[0],
  ): Promise<void>;
};

class PrismaStreamflowRealReconcileRepository implements StreamflowRealReconcileRepository {
  async getTrackedVestingPosition(vestingPositionId: string) {
    return db.vestingPosition.findUnique({
      where: { id: vestingPositionId },
      select: {
        id: true,
        exchangeId: true,
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
        streamflowManualReviewRequired: true,
        streamflowManualReviewReason: true,
      },
    });
  }

  async updateTracking(params: Parameters<typeof updateVestingStreamflowTracking>[0]) {
    await updateVestingStreamflowTracking(params);
  }

  async recordAttempt(
    params: Parameters<typeof recordVestingStreamflowReconciliationAttempt>[0],
  ) {
    await recordVestingStreamflowReconciliationAttempt(params);
  }
}

export class StreamflowRealReconcileEligibilityError extends StreamflowAdapterError {
  constructor(message: string) {
    super(message);
    this.name = "StreamflowRealReconcileEligibilityError";
  }
}

export class StreamflowRealReconcileExecutionGuardError extends StreamflowAdapterError {
  constructor(message: string) {
    super(message);
    this.name = "StreamflowRealReconcileExecutionGuardError";
  }
}

export type StreamflowRealReconcileResult =
  | {
      status: "pending_creation";
      vestingPositionId: string;
      scheduleId: string;
      providerState: "pending_creation";
    }
  | {
      status: "matched";
      vestingPositionId: string;
      scheduleId: string;
      providerState: "created" | "confirmed";
    }
  | {
      status: "manual_review";
      vestingPositionId: string;
      scheduleId: string | null;
      reason: string;
      providerState?: string | null;
    }
  | {
      status: "validation_failed";
      vestingPositionId: string;
      scheduleId: string | null;
      reason: string;
    }
  | {
      status: "retryable_failure";
      vestingPositionId: string;
      scheduleId: string | null;
      reason: string;
    };

function toDetailsJson(value: unknown) {
  return JSON.stringify(value, (_key, nestedValue) =>
    typeof nestedValue === "bigint" ? nestedValue.toString() : nestedValue,
  );
}

function assertRealReconcileEnabled() {
  if (!serverEnv.STREAMFLOW_INTEGRATION_ENABLED) {
    throw new StreamflowRealReconcileExecutionGuardError(
      "Streamflow integration is disabled. Enable it explicitly before attempting real reconciliation.",
    );
  }

  if (serverEnv.STREAMFLOW_ADAPTER_MODE !== "sdk") {
    throw new StreamflowRealReconcileExecutionGuardError(
      "Real Streamflow reconciliation requires STREAMFLOW_ADAPTER_MODE=sdk.",
    );
  }

  if (!serverEnv.STREAMFLOW_RECONCILE_ENABLED) {
    throw new StreamflowRealReconcileExecutionGuardError(
      "STREAMFLOW_RECONCILE_ENABLED must be true before real Streamflow reconciliation can run.",
    );
  }

  if (process.env.NODE_ENV === "production" && !serverEnv.STREAMFLOW_SDK_ALLOW_PRODUCTION) {
    throw new StreamflowRealReconcileExecutionGuardError(
      "Real Streamflow reconciliation is blocked in production until STREAMFLOW_SDK_ALLOW_PRODUCTION is explicitly enabled.",
    );
  }
}

function toPayloadSource(vesting: ReconcileTrackedVestingPosition): StreamflowPayloadSource {
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

function classifyEligibility(vesting: ReconcileTrackedVestingPosition) {
  if (vesting.vestingProvider !== "streamflow") {
    return `Vesting position ${vesting.id} is not configured for Streamflow.`;
  }

  if (!vesting.streamflowScheduleId) {
    return `Vesting position ${vesting.id} does not have a Streamflow schedule id to reconcile.`;
  }

  if (vesting.streamflowManualReviewRequired) {
    return (
      vesting.streamflowManualReviewReason ??
      `Vesting position ${vesting.id} is already flagged for Streamflow manual review.`
    );
  }

  return null;
}

function buildObservedSnapshot(params: {
  status: Extract<StreamflowScheduleStatus, { state: "created" | "confirmed" }>;
  vestingReference: string;
  clientCorrelationId?: string | null;
}) {
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

async function recordAudit(params: {
  repository: StreamflowRealReconcileRepository;
  vestingPositionId: string;
  attemptType: string;
  result: string;
  triggeredBy: string;
  observedScheduleId?: string | null;
  observedTxSignature?: string | null;
  observedState?: string | null;
  errorMessage?: string | null;
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

export async function reconcileRealStreamflowScheduleForVestingPosition(params: {
  vestingPositionId: string;
  triggeredBy: string;
  adapter?: StreamflowAdapter;
  repository?: StreamflowRealReconcileRepository;
}): Promise<StreamflowRealReconcileResult> {
  assertRealReconcileEnabled();

  const repository = params.repository ?? new PrismaStreamflowRealReconcileRepository();
  const adapter =
    params.adapter ??
    (await import("./configured-streamflow-adapter")).getConfiguredStreamflowAdapter();
  const vesting = await repository.getTrackedVestingPosition(params.vestingPositionId);

  if (!vesting) {
    throw new StreamflowRealReconcileEligibilityError("Vesting position not found.");
  }

  const blockedReason = classifyEligibility(vesting);
  if (blockedReason) {
    await recordAudit({
      repository,
      vestingPositionId: vesting.id,
      attemptType: "sdk-status-refused",
      result: "refused",
      triggeredBy: params.triggeredBy,
      observedScheduleId: vesting.streamflowScheduleId ?? null,
      errorMessage: blockedReason,
    });

    throw new StreamflowRealReconcileEligibilityError(blockedReason);
  }

  try {
    const { request } = buildStreamflowPayloadFromSource(toPayloadSource(vesting));

    await recordAudit({
      repository,
      vestingPositionId: vesting.id,
      attemptType: "sdk-status-requested",
      result: "pending",
      triggeredBy: params.triggeredBy,
      observedScheduleId: vesting.streamflowScheduleId,
      details: {
        vestingReference: request.vestingReference,
        clientCorrelationId: request.clientCorrelationId ?? null,
      },
    });

    const status = await adapter.getScheduleStatus({
      vestingReference: request.vestingReference,
      scheduleId: vesting.streamflowScheduleId!,
    });

    if (status.state === "pending_creation") {
      await repository.updateTracking({
        vestingPositionId: vesting.id,
        streamflowLifecycleStatus: "pending_reconciliation",
        streamflowLastReconciledAt: new Date(),
        streamflowNextReconcileAt: new Date(),
        streamflowObservedScheduleState: status.statusRaw,
        streamflowReconciliationFailureReason: null,
        streamflowManualReviewRequired: false,
        streamflowManualReviewReason: null,
        incrementReconcileAttemptCount: true,
      });

      await recordAudit({
        repository,
        vestingPositionId: vesting.id,
        attemptType: "sdk-status",
        result: "pending_creation",
        triggeredBy: params.triggeredBy,
        observedScheduleId: vesting.streamflowScheduleId,
        observedState: status.statusRaw,
      });

      return {
        status: "pending_creation",
        vestingPositionId: vesting.id,
        scheduleId: vesting.streamflowScheduleId!,
        providerState: "pending_creation",
      };
    }

    if (status.state === "cancelled") {
      const reason = status.reason ?? "Streamflow reported the schedule as cancelled.";

      await repository.updateTracking({
        vestingPositionId: vesting.id,
        streamflowLifecycleStatus: "manual_review",
        streamflowLastReconciledAt: new Date(),
        streamflowNextReconcileAt: null,
        streamflowObservedScheduleState: status.statusRaw,
        streamflowReconciliationFailureReason: reason,
        streamflowManualReviewRequired: true,
        streamflowManualReviewReason: reason,
        incrementReconcileAttemptCount: true,
      });

      await recordAudit({
        repository,
        vestingPositionId: vesting.id,
        attemptType: "sdk-status",
        result: "cancelled",
        triggeredBy: params.triggeredBy,
        observedScheduleId: status.scheduleId ?? vesting.streamflowScheduleId,
        observedState: status.statusRaw,
        errorMessage: reason,
      });

      return {
        status: "manual_review",
        vestingPositionId: vesting.id,
        scheduleId: status.scheduleId ?? vesting.streamflowScheduleId,
        reason,
        providerState: status.statusRaw,
      };
    }

    const observedSnapshot = buildObservedSnapshot({
      status,
      vestingReference: request.vestingReference,
      clientCorrelationId: request.clientCorrelationId ?? null,
    });
    const expectedSnapshot = {
      vestingReference: request.vestingReference,
      clientCorrelationId: request.clientCorrelationId ?? null,
      recipientWalletAddress: request.recipientWalletAddress,
      mintAddress: request.mintAddress,
      amountAtomic: request.amountAtomic,
      startAt: request.startAt,
      endAt: request.endAt,
      vestingKind: request.vestingKind as StreamflowVestingKind,
    };
    const match = matchCreatedStreamflowArtifactToExpectedLock(expectedSnapshot, observedSnapshot);

    if (!match.matches) {
      const reason = `Observed Streamflow schedule does not match expected ${match.reason}.`;

      await repository.updateTracking({
        vestingPositionId: vesting.id,
        streamflowLifecycleStatus: "manual_review",
        streamflowScheduleId: status.scheduleId,
        streamflowTreasuryAddress: status.treasuryAddress ?? null,
        streamflowEscrowAddress: status.escrowAddress ?? null,
        streamflowBeneficiaryAddress: status.beneficiaryAddress,
        streamflowMintAddress: status.mintAddress,
        streamflowCreationTxSignature: status.txSignature ?? null,
        streamflowConfirmedAt: status.state === "confirmed" ? status.confirmedAt : null,
        streamflowLastReconciledAt: new Date(),
        streamflowNextReconcileAt: null,
        streamflowObservedScheduleState: status.statusRaw,
        streamflowObservedCreationTxSignature: status.txSignature ?? null,
        streamflowReconciliationFailureReason: reason,
        streamflowManualReviewRequired: true,
        streamflowManualReviewReason: reason,
        incrementReconcileAttemptCount: true,
      });

      await recordAudit({
        repository,
        vestingPositionId: vesting.id,
        attemptType: "sdk-status",
        result: "mismatched",
        triggeredBy: params.triggeredBy,
        observedScheduleId: status.scheduleId,
        observedTxSignature: status.txSignature ?? null,
        observedState: status.statusRaw,
        errorMessage: reason,
        details: {
          mismatchReason: match.reason,
          expected: {
            recipientWalletAddress: request.recipientWalletAddress,
            mintAddress: request.mintAddress,
            amountAtomic: request.amountAtomic.toString(),
            startAt: request.startAt.toISOString(),
            endAt: request.endAt.toISOString(),
            vestingKind: request.vestingKind,
          },
          observed: {
            beneficiaryAddress: status.beneficiaryAddress,
            mintAddress: status.mintAddress,
            amountAtomic: status.amountAtomic.toString(),
            startAt: status.startAt.toISOString(),
            endAt: status.endAt.toISOString(),
            vestingKind: status.vestingKind,
          },
        },
      });

      return {
        status: "manual_review",
        vestingPositionId: vesting.id,
        scheduleId: status.scheduleId,
        reason,
        providerState: status.statusRaw,
      };
    }

    const observed = toPersistedObservedScheduleFromStatus(status);
    const lifecycleStatus = status.state === "confirmed" ? "matched" : "created";

    await repository.updateTracking({
      vestingPositionId: vesting.id,
      streamflowLifecycleStatus: lifecycleStatus,
      streamflowScheduleId: observed.streamflowScheduleId,
      streamflowTreasuryAddress: observed.streamflowTreasuryAddress,
      streamflowEscrowAddress: observed.streamflowEscrowAddress,
      streamflowBeneficiaryAddress: observed.streamflowBeneficiaryAddress,
      streamflowMintAddress: observed.streamflowMintAddress,
      streamflowCreationTxSignature: observed.streamflowCreationTxSignature,
      streamflowScheduleCreatedAt: observed.streamflowScheduleCreatedAt,
      streamflowConfirmedAt: observed.streamflowConfirmedAt,
      streamflowLastReconciledAt: new Date(),
      streamflowNextReconcileAt: null,
      streamflowObservedScheduleState: observed.streamflowObservedScheduleState,
      streamflowObservedCreationTxSignature: observed.streamflowObservedCreationTxSignature,
      streamflowReconciliationFailureReason: null,
      streamflowManualReviewRequired: false,
      streamflowManualReviewReason: null,
      incrementReconcileAttemptCount: true,
    });

    await recordAudit({
      repository,
      vestingPositionId: vesting.id,
      attemptType: "sdk-status",
      result: lifecycleStatus === "matched" ? "confirmed" : "created",
      triggeredBy: params.triggeredBy,
      observedScheduleId: status.scheduleId,
      observedTxSignature: status.txSignature ?? null,
      observedState: status.statusRaw,
      details: {
        providerState: status.state,
        confirmedAt: status.state === "confirmed" ? status.confirmedAt.toISOString() : null,
      },
    });

    return {
      status: "matched",
      vestingPositionId: vesting.id,
      scheduleId: status.scheduleId,
      providerState: status.state,
    };
  } catch (error) {
    if (error instanceof StreamflowPayloadValidationError) {
      const reason = error.issues.map((issue) => issue.message).join(" ");

      await repository.updateTracking({
        vestingPositionId: vesting.id,
        streamflowLifecycleStatus: "manual_review",
        streamflowLastReconciledAt: new Date(),
        streamflowNextReconcileAt: null,
        streamflowReconciliationFailureReason: reason,
        streamflowManualReviewRequired: true,
        streamflowManualReviewReason: reason,
        incrementReconcileAttemptCount: true,
      });

      await recordAudit({
        repository,
        vestingPositionId: vesting.id,
        attemptType: "sdk-status",
        result: "validation_failed",
        triggeredBy: params.triggeredBy,
        observedScheduleId: vesting.streamflowScheduleId,
        errorMessage: reason,
      });

      return {
        status: "validation_failed",
        vestingPositionId: vesting.id,
        scheduleId: vesting.streamflowScheduleId,
        reason,
      };
    }

    const reason =
      error instanceof Error ? error.message : "Unknown Streamflow real reconciliation failure.";

    await repository.updateTracking({
      vestingPositionId: vesting.id,
      streamflowLifecycleStatus: "retryable_failure",
      streamflowLastReconciledAt: new Date(),
      streamflowNextReconcileAt: new Date(),
      streamflowReconciliationFailureReason: reason,
      streamflowManualReviewRequired: false,
      streamflowManualReviewReason: null,
      incrementReconcileAttemptCount: true,
    });

    await recordAudit({
      repository,
      vestingPositionId: vesting.id,
      attemptType: "sdk-status",
      result: "retryable_failure",
      triggeredBy: params.triggeredBy,
      observedScheduleId: vesting.streamflowScheduleId,
      errorMessage: reason,
    });

    return {
      status: "retryable_failure",
      vestingPositionId: vesting.id,
      scheduleId: vesting.streamflowScheduleId,
      reason,
    };
  }
}
