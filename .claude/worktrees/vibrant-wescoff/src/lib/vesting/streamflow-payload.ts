import { PublicKey } from "@solana/web3.js";
import {
  StreamflowAdapterError,
  type StreamflowCreatedSchedule,
  type StreamflowPreparedSchedule,
  type StreamflowScheduleRequest,
  type StreamflowScheduleStatus,
  type StreamflowScheduleSearchResult,
  type StreamflowVestingKind,
} from "./streamflow-adapter";

export type StreamflowPayloadSource = {
  vestingPositionId: string;
  exchangeId: string;
  vestingReference: string | null;
  clientCorrelationId: string | null;
  expectedRecipientWalletAddress: string | null;
  expectedMintAddress: string | null;
  expectedAmountAtomic: bigint | null;
  expectedStartAt: Date | null;
  expectedEndAt: Date | null;
  expectedVestingKind: string | null;
  clientOrderRef?: string | null;
  treasuryAddress?: string | null;
};

export type StreamflowPayloadValidationIssueCode =
  | "missing_wallet"
  | "invalid_wallet"
  | "missing_mint"
  | "invalid_mint"
  | "missing_amount"
  | "invalid_amount"
  | "missing_start_at"
  | "missing_end_at"
  | "invalid_schedule_dates"
  | "missing_vesting_reference"
  | "missing_client_correlation_id"
  | "missing_vesting_kind"
  | "invalid_vesting_kind";

export type StreamflowPayloadValidationIssue = {
  code: StreamflowPayloadValidationIssueCode;
  field: string;
  message: string;
};

export type StreamflowPayloadValidationResult =
  | {
      ok: true;
      request: StreamflowScheduleRequest;
    }
  | {
      ok: false;
      issues: StreamflowPayloadValidationIssue[];
    };

export class StreamflowPayloadValidationError extends StreamflowAdapterError {
  constructor(public readonly issues: StreamflowPayloadValidationIssue[]) {
    super(
      issues.length === 1
        ? issues[0].message
        : `Streamflow payload validation failed with ${issues.length} issues.`,
    );
    this.name = "StreamflowPayloadValidationError";
  }
}

export type StreamflowCreateSchedulePayloadRequired = {
  recipientWalletAddress: string;
  mintAddress: string;
  amountAtomic: string;
  startAtIso: string;
  endAtIso: string;
  vestingKind: StreamflowVestingKind;
  clientCorrelationId: string;
  vestingReference: string;
};

export type StreamflowCreateSchedulePayloadOptional = {
  clientOrderRef?: string | null;
  treasuryAddress?: string | null;
};

export type StreamflowCreateSchedulePayload = {
  provider: "streamflow";
  payloadVersion: "v1";
  internal: {
    vestingPositionId: string;
    exchangeId: string;
  };
  required: StreamflowCreateSchedulePayloadRequired;
  optional: StreamflowCreateSchedulePayloadOptional;
};

export type StreamflowPayloadBuildResult = {
  request: StreamflowScheduleRequest;
  payload: StreamflowCreateSchedulePayload;
  expectedSnapshot: StreamflowPreparedSchedule;
};

export type StreamflowObservedSchedulePersistence = {
  streamflowScheduleId: string;
  streamflowTreasuryAddress: string | null;
  streamflowEscrowAddress: string | null;
  streamflowBeneficiaryAddress: string;
  streamflowMintAddress: string;
  streamflowCreationTxSignature: string | null;
  streamflowScheduleCreatedAt: Date | null;
  streamflowConfirmedAt: Date | null;
  streamflowObservedScheduleState: string;
  streamflowObservedCreationTxSignature: string | null;
};

function isValidPublicKey(value: string) {
  try {
    void new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

function isValidVestingKind(value: string | null): value is StreamflowVestingKind {
  return value === "token_lock" || value === "token_vesting";
}

function toPreparedSchedule(request: StreamflowScheduleRequest, preparedAt: Date): StreamflowPreparedSchedule {
  return {
    provider: "streamflow",
    vestingReference: request.vestingReference,
    clientCorrelationId: request.clientCorrelationId ?? null,
    expectedRecipientWalletAddress: request.recipientWalletAddress,
    expectedMintAddress: request.mintAddress,
    expectedAmountAtomic: request.amountAtomic,
    expectedStartAt: request.startAt,
    expectedEndAt: request.endAt,
    expectedVestingKind: request.vestingKind,
    preparedAt,
  };
}

export function validateStreamflowPayloadSource(
  source: StreamflowPayloadSource,
): StreamflowPayloadValidationResult {
  const issues: StreamflowPayloadValidationIssue[] = [];

  if (!source.vestingReference?.trim()) {
    issues.push({
      code: "missing_vesting_reference",
      field: "vestingReference",
      message: "Streamflow vesting reference is required before payload creation.",
    });
  }

  if (!source.clientCorrelationId?.trim()) {
    issues.push({
      code: "missing_client_correlation_id",
      field: "clientCorrelationId",
      message: "Streamflow client correlation id is required before payload creation.",
    });
  }

  if (!source.expectedRecipientWalletAddress?.trim()) {
    issues.push({
      code: "missing_wallet",
      field: "expectedRecipientWalletAddress",
      message: "Recipient wallet address is required for Streamflow payload creation.",
    });
  } else if (!isValidPublicKey(source.expectedRecipientWalletAddress)) {
    issues.push({
      code: "invalid_wallet",
      field: "expectedRecipientWalletAddress",
      message: "Recipient wallet address is not a valid Solana public key.",
    });
  }

  if (!source.expectedMintAddress?.trim()) {
    issues.push({
      code: "missing_mint",
      field: "expectedMintAddress",
      message: "Token mint address is required for Streamflow payload creation.",
    });
  } else if (!isValidPublicKey(source.expectedMintAddress)) {
    issues.push({
      code: "invalid_mint",
      field: "expectedMintAddress",
      message: "Token mint address is not a valid Solana public key.",
    });
  }

  if (source.expectedAmountAtomic === null) {
    issues.push({
      code: "missing_amount",
      field: "expectedAmountAtomic",
      message: "Token amount is required for Streamflow payload creation.",
    });
  } else if (source.expectedAmountAtomic <= BigInt(0)) {
    issues.push({
      code: "invalid_amount",
      field: "expectedAmountAtomic",
      message: "Token amount must be greater than zero for Streamflow payload creation.",
    });
  }

  if (!source.expectedStartAt) {
    issues.push({
      code: "missing_start_at",
      field: "expectedStartAt",
      message: "Streamflow start date is required.",
    });
  }

  if (!source.expectedEndAt) {
    issues.push({
      code: "missing_end_at",
      field: "expectedEndAt",
      message: "Streamflow end date is required.",
    });
  }

  if (source.expectedStartAt && source.expectedEndAt && source.expectedEndAt <= source.expectedStartAt) {
    issues.push({
      code: "invalid_schedule_dates",
      field: "expectedEndAt",
      message: "Streamflow end date must be later than the start date.",
    });
  }

  if (!source.expectedVestingKind) {
    issues.push({
      code: "missing_vesting_kind",
      field: "expectedVestingKind",
      message: "Streamflow vesting kind is required.",
    });
  } else if (!isValidVestingKind(source.expectedVestingKind)) {
    issues.push({
      code: "invalid_vesting_kind",
      field: "expectedVestingKind",
      message: "Streamflow vesting kind must be token_lock or token_vesting.",
    });
  }

  if (issues.length > 0) {
    return {
      ok: false,
      issues,
    };
  }

  return {
    ok: true,
    request: {
      vestingPositionId: source.vestingPositionId,
      exchangeId: source.exchangeId,
      vestingReference: source.vestingReference!.trim(),
      clientCorrelationId: source.clientCorrelationId!.trim(),
      recipientWalletAddress: source.expectedRecipientWalletAddress!.trim(),
      mintAddress: source.expectedMintAddress!.trim(),
      amountAtomic: source.expectedAmountAtomic!,
      startAt: source.expectedStartAt!,
      endAt: source.expectedEndAt!,
      vestingKind: source.expectedVestingKind as StreamflowVestingKind,
      clientOrderRef: source.clientOrderRef ?? null,
      treasuryAddress: source.treasuryAddress ?? null,
    },
  };
}

export function assertValidStreamflowPayloadSource(source: StreamflowPayloadSource) {
  const result = validateStreamflowPayloadSource(source);

  if (!result.ok) {
    throw new StreamflowPayloadValidationError(result.issues);
  }

  return result.request;
}

export function buildStreamflowCreateSchedulePayload(
  request: StreamflowScheduleRequest,
): StreamflowCreateSchedulePayload {
  return {
    provider: "streamflow",
    payloadVersion: "v1",
    internal: {
      vestingPositionId: request.vestingPositionId,
      exchangeId: request.exchangeId,
    },
    required: {
      recipientWalletAddress: request.recipientWalletAddress,
      mintAddress: request.mintAddress,
      amountAtomic: request.amountAtomic.toString(),
      startAtIso: request.startAt.toISOString(),
      endAtIso: request.endAt.toISOString(),
      vestingKind: request.vestingKind,
      clientCorrelationId: request.clientCorrelationId ?? "",
      vestingReference: request.vestingReference,
    },
    optional: {
      clientOrderRef: request.clientOrderRef ?? null,
      treasuryAddress: request.treasuryAddress ?? null,
    },
  };
}

export function buildStreamflowPayloadFromSource(
  source: StreamflowPayloadSource,
): StreamflowPayloadBuildResult {
  const request = assertValidStreamflowPayloadSource(source);
  const preparedAt = new Date();

  return {
    request,
    payload: buildStreamflowCreateSchedulePayload(request),
    expectedSnapshot: toPreparedSchedule(request, preparedAt),
  };
}

export function toPersistedObservedSchedule(
  createdSchedule: StreamflowCreatedSchedule,
): StreamflowObservedSchedulePersistence {
  return {
    streamflowScheduleId: createdSchedule.scheduleId,
    streamflowTreasuryAddress: createdSchedule.treasuryAddress ?? null,
    streamflowEscrowAddress: createdSchedule.escrowAddress ?? null,
    streamflowBeneficiaryAddress: createdSchedule.beneficiaryAddress,
    streamflowMintAddress: createdSchedule.mintAddress,
    streamflowCreationTxSignature: createdSchedule.txSignature ?? null,
    streamflowScheduleCreatedAt: createdSchedule.createdAt,
    streamflowConfirmedAt: null,
    streamflowObservedScheduleState: createdSchedule.state,
    streamflowObservedCreationTxSignature: createdSchedule.txSignature ?? null,
  };
}

export function toPersistedObservedScheduleFromStatus(
  status: Extract<StreamflowScheduleStatus, { state: "created" | "confirmed" }>,
): StreamflowObservedSchedulePersistence {
  return {
    streamflowScheduleId: status.scheduleId,
    streamflowTreasuryAddress: status.treasuryAddress ?? null,
    streamflowEscrowAddress: status.escrowAddress ?? null,
    streamflowBeneficiaryAddress: status.beneficiaryAddress,
    streamflowMintAddress: status.mintAddress,
    streamflowCreationTxSignature: status.txSignature ?? null,
    streamflowScheduleCreatedAt: status.state === "confirmed" ? status.confirmedAt : null,
    streamflowConfirmedAt: status.state === "confirmed" ? status.confirmedAt : null,
    streamflowObservedScheduleState: status.statusRaw,
    streamflowObservedCreationTxSignature: status.txSignature ?? null,
  };
}

export function toPersistedObservedScheduleFromSearchMatch(
  result: Extract<StreamflowScheduleSearchResult, { state: "match_found" }>,
): StreamflowObservedSchedulePersistence {
  return {
    streamflowScheduleId: result.scheduleId,
    streamflowTreasuryAddress: result.treasuryAddress ?? null,
    streamflowEscrowAddress: result.escrowAddress ?? null,
    streamflowBeneficiaryAddress: result.beneficiaryAddress,
    streamflowMintAddress: result.mintAddress,
    streamflowCreationTxSignature: result.txSignature ?? null,
    streamflowScheduleCreatedAt: result.detectedAt,
    streamflowConfirmedAt: null,
    streamflowObservedScheduleState: result.stateRaw ?? "created",
    streamflowObservedCreationTxSignature: result.txSignature ?? null,
  };
}
