import "server-only";

import {
  type StreamflowAdapter,
  type StreamflowCreatedSchedule,
  type StreamflowScheduleRequest,
  type StreamflowScheduleSearchRequest,
  type StreamflowScheduleSearchResult,
  type StreamflowScheduleStatus,
} from "./streamflow-adapter";
import {
  buildStreamflowPayloadFromSource,
  type StreamflowPayloadSource,
} from "./streamflow-payload";

function sanitizeReference(reference: string) {
  return reference.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 48);
}

export class MockStreamflowAdapter implements StreamflowAdapter {
  async prepareSchedule(request: StreamflowScheduleRequest) {
    return buildStreamflowPayloadFromSource(toPayloadSource(request)).expectedSnapshot;
  }

  async createSchedule(request: StreamflowScheduleRequest): Promise<StreamflowCreatedSchedule> {
    void buildStreamflowPayloadFromSource(toPayloadSource(request));

    const now = new Date();
    const key = sanitizeReference(request.vestingReference);

    return {
      provider: "streamflow",
      scheduleId: `mock-streamflow-schedule-${key}`,
      treasuryAddress: "mock-streamflow-treasury",
      escrowAddress: `mock-streamflow-escrow-${key}`,
      beneficiaryAddress: request.recipientWalletAddress,
      mintAddress: request.mintAddress,
      amountAtomic: request.amountAtomic,
      startAt: request.startAt,
      endAt: request.endAt,
      vestingKind: request.vestingKind,
      txSignature: `mock-streamflow-tx-${key}`,
      state: "created",
      createdAt: now,
    };
  }

  async getScheduleStatus(params: {
    vestingReference: string;
    scheduleId: string;
  }): Promise<StreamflowScheduleStatus> {
    const now = new Date();
    const key = sanitizeReference(params.vestingReference);

    return {
      state: "created",
      statusRaw: `mock:${params.vestingReference}`,
      scheduleId: params.scheduleId,
      txSignature: `mock-streamflow-tx-${key}`,
      beneficiaryAddress: "11111111111111111111111111111112",
      mintAddress: "11111111111111111111111111111113",
      amountAtomic: BigInt(1_000_000),
      startAt: new Date("2026-04-03T00:00:00.000Z"),
      endAt: new Date("2026-05-03T00:00:00.000Z"),
      vestingKind: "token_lock",
      treasuryAddress: "mock-streamflow-treasury",
      escrowAddress: `mock-streamflow-escrow-${key}`,
      lastCheckedAt: now,
    };
  }

  async searchForSchedule(
    request: StreamflowScheduleSearchRequest,
  ): Promise<StreamflowScheduleSearchResult> {
    const now = new Date();
    const key = sanitizeReference(request.vestingReference);

    return {
      state: "match_found",
      matchedBy: "vesting_reference",
      scheduleId: `mock-streamflow-schedule-${key}`,
      beneficiaryAddress: request.expectedRecipientWalletAddress,
      mintAddress: request.expectedMintAddress,
      amountAtomic: request.expectedAmountAtomic,
      startAt: request.expectedStartAt,
      endAt: request.expectedEndAt,
      vestingKind: request.expectedVestingKind,
      escrowAddress: `mock-streamflow-escrow-${key}`,
      treasuryAddress: "mock-streamflow-treasury",
      txSignature: `mock-streamflow-tx-${key}`,
      stateRaw: "created",
      detectedAt: now,
      searchedAt: now,
    };
  }
}

function toPayloadSource(request: StreamflowScheduleRequest): StreamflowPayloadSource {
  return {
    vestingPositionId: request.vestingPositionId,
    exchangeId: request.exchangeId,
    vestingReference: request.vestingReference,
    clientCorrelationId: request.clientCorrelationId ?? null,
    expectedRecipientWalletAddress: request.recipientWalletAddress,
    expectedMintAddress: request.mintAddress,
    expectedAmountAtomic: request.amountAtomic,
    expectedStartAt: request.startAt,
    expectedEndAt: request.endAt,
    expectedVestingKind: request.vestingKind,
    clientOrderRef: request.clientOrderRef ?? null,
    treasuryAddress: request.treasuryAddress ?? null,
  };
}
