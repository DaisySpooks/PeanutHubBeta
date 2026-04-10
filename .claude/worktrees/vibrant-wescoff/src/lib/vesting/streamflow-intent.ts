import "server-only";

import type { StreamflowScheduleRequest, StreamflowVestingKind } from "./streamflow-adapter";

export function buildStreamflowVestingReference(exchangeId: string) {
  return `exchange:${exchangeId}:streamflow-lock:v1`;
}

export function buildStreamflowClientCorrelationId(exchangeId: string) {
  return `streamflow-client:${exchangeId}:v1`;
}

export function getDefaultStreamflowVestingKind(): StreamflowVestingKind {
  return "token_lock";
}

export function buildExpectedStreamflowSchedule(params: {
  vestingPositionId: string;
  exchangeId: string;
  recipientWalletAddress: string;
  mintAddress: string;
  amountAtomic: bigint;
  startAt: Date;
  endAt: Date;
  vestingKind?: StreamflowVestingKind;
  clientOrderRef?: string | null;
  treasuryAddress?: string | null;
}): StreamflowScheduleRequest {
  return {
    vestingPositionId: params.vestingPositionId,
    exchangeId: params.exchangeId,
    vestingReference: buildStreamflowVestingReference(params.exchangeId),
    clientCorrelationId: buildStreamflowClientCorrelationId(params.exchangeId),
    recipientWalletAddress: params.recipientWalletAddress,
    mintAddress: params.mintAddress,
    amountAtomic: params.amountAtomic,
    startAt: params.startAt,
    endAt: params.endAt,
    vestingKind: params.vestingKind ?? getDefaultStreamflowVestingKind(),
    clientOrderRef: params.clientOrderRef ?? null,
    treasuryAddress: params.treasuryAddress ?? null,
  };
}
