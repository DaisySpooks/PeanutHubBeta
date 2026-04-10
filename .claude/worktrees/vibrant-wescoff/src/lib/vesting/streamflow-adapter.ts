export class StreamflowAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StreamflowAdapterError";
  }
}

export type StreamflowVestingKind = "token_lock" | "token_vesting";

export type StreamflowScheduleRequest = {
  vestingPositionId: string;
  exchangeId: string;
  vestingReference: string;
  clientCorrelationId?: string | null;
  recipientWalletAddress: string;
  mintAddress: string;
  amountAtomic: bigint;
  startAt: Date;
  endAt: Date;
  vestingKind: StreamflowVestingKind;
  clientOrderRef?: string | null;
  treasuryAddress?: string | null;
};

export type StreamflowPreparedSchedule = {
  provider: "streamflow";
  vestingReference: string;
  clientCorrelationId?: string | null;
  expectedRecipientWalletAddress: string;
  expectedMintAddress: string;
  expectedAmountAtomic: bigint;
  expectedStartAt: Date;
  expectedEndAt: Date;
  expectedVestingKind: StreamflowVestingKind;
  preparedAt: Date;
};

export type StreamflowCreatedSchedule = {
  provider: "streamflow";
  scheduleId: string;
  treasuryAddress?: string | null;
  escrowAddress?: string | null;
  beneficiaryAddress: string;
  mintAddress: string;
  amountAtomic: bigint;
  startAt: Date;
  endAt: Date;
  vestingKind: StreamflowVestingKind;
  txSignature?: string | null;
  state: string;
  createdAt: Date;
};

type StreamflowObservedScheduleFields = {
  scheduleId: string;
  txSignature?: string | null;
  beneficiaryAddress: string;
  mintAddress: string;
  amountAtomic: bigint;
  startAt: Date;
  endAt: Date;
  vestingKind: StreamflowVestingKind;
  treasuryAddress?: string | null;
  escrowAddress?: string | null;
};

export type StreamflowScheduleStatus =
  | {
      state: "pending_creation";
      statusRaw: string;
      lastCheckedAt: Date;
    }
  | ({
      state: "created";
      statusRaw: string;
      lastCheckedAt: Date;
    } & StreamflowObservedScheduleFields)
  | ({
      state: "confirmed";
      statusRaw: string;
      confirmedAt: Date;
      lastCheckedAt: Date;
    } & StreamflowObservedScheduleFields)
  | {
      state: "cancelled";
      statusRaw: string;
      scheduleId?: string;
      reason?: string;
      lastCheckedAt: Date;
    };

export type StreamflowScheduleSearchRequest = {
  vestingReference: string;
  clientCorrelationId?: string | null;
  expectedRecipientWalletAddress: string;
  expectedMintAddress: string;
  expectedAmountAtomic: bigint;
  expectedStartAt: Date;
  expectedEndAt: Date;
  expectedVestingKind: StreamflowVestingKind;
  searchWindowStart: Date;
  searchWindowEnd: Date;
};

export type StreamflowScheduleSearchResult =
  | {
      state: "not_found";
      searchedAt: Date;
    }
  | {
      state: "match_found";
      matchedBy: "vesting_reference" | "artifact_tuple";
      scheduleId: string;
      beneficiaryAddress: string;
      mintAddress: string;
      amountAtomic: bigint;
      startAt: Date;
      endAt: Date;
      vestingKind: StreamflowVestingKind;
      escrowAddress?: string | null;
      treasuryAddress?: string | null;
      txSignature?: string | null;
      stateRaw?: string | null;
      detectedAt: Date;
      searchedAt: Date;
    }
  | {
      state: "ambiguous";
      candidateScheduleIds: string[];
      searchedAt: Date;
    };

export interface StreamflowAdapter {
  prepareSchedule(request: StreamflowScheduleRequest): Promise<StreamflowPreparedSchedule>;
  createSchedule(request: StreamflowScheduleRequest): Promise<StreamflowCreatedSchedule>;
  getScheduleStatus(params: {
    vestingReference: string;
    scheduleId: string;
  }): Promise<StreamflowScheduleStatus>;
  searchForSchedule(
    request: StreamflowScheduleSearchRequest,
  ): Promise<StreamflowScheduleSearchResult>;
}
