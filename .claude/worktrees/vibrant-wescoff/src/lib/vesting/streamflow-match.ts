import type { StreamflowVestingKind } from "./streamflow-adapter";

export type StreamflowLockSnapshot = {
  vestingReference: string;
  clientCorrelationId?: string | null;
  recipientWalletAddress: string;
  mintAddress: string;
  amountAtomic: bigint;
  startAt: Date;
  endAt: Date;
  vestingKind: StreamflowVestingKind;
};

export type StreamflowCreatedArtifactSnapshot = {
  artifactId?: string | null;
  vestingReference?: string | null;
  clientCorrelationId?: string | null;
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
};

export type StreamflowLockMatchResult =
  | {
      matches: true;
    }
  | {
      matches: false;
      reason:
        | "recipient_mismatch"
        | "mint_mismatch"
        | "amount_mismatch"
        | "start_at_mismatch"
        | "end_at_mismatch"
        | "vesting_kind_mismatch";
    };

export type StreamflowArtifactMatchStrength =
  | "client_correlation_id"
  | "vesting_reference"
  | "artifact_tuple";

export function getStreamflowArtifactMatchStrength(
  expected: StreamflowLockSnapshot,
  observed: StreamflowCreatedArtifactSnapshot,
): StreamflowArtifactMatchStrength | null {
  if (
    expected.clientCorrelationId &&
    observed.clientCorrelationId &&
    expected.clientCorrelationId === observed.clientCorrelationId
  ) {
    return "client_correlation_id";
  }

  if (
    expected.vestingReference &&
    observed.vestingReference &&
    expected.vestingReference === observed.vestingReference
  ) {
    return "vesting_reference";
  }

  const tupleMatch = matchCreatedStreamflowArtifactToExpectedLock(expected, observed);
  if (tupleMatch.matches) {
    return "artifact_tuple";
  }

  return null;
}

export function matchCreatedStreamflowArtifactToExpectedLock(
  expected: StreamflowLockSnapshot,
  observed: StreamflowCreatedArtifactSnapshot,
): StreamflowLockMatchResult {
  if (expected.recipientWalletAddress !== observed.beneficiaryAddress) {
    return { matches: false, reason: "recipient_mismatch" };
  }

  if (expected.mintAddress !== observed.mintAddress) {
    return { matches: false, reason: "mint_mismatch" };
  }

  if (expected.amountAtomic !== observed.amountAtomic) {
    return { matches: false, reason: "amount_mismatch" };
  }

  if (expected.startAt.getTime() !== observed.startAt.getTime()) {
    return { matches: false, reason: "start_at_mismatch" };
  }

  if (expected.endAt.getTime() !== observed.endAt.getTime()) {
    return { matches: false, reason: "end_at_mismatch" };
  }

  if (expected.vestingKind !== observed.vestingKind) {
    return { matches: false, reason: "vesting_kind_mismatch" };
  }

  return { matches: true };
}
