import type { StreamflowVestingKind } from "./streamflow-adapter";
import { createMockStreamflowObservedArtifact, type MockStreamflowObservedArtifact } from "./mock-streamflow-observed-artifacts";

export type MockTrackedVestingPositionFixture = {
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

export function buildMockTrackedVestingPositionFixture(overrides?: Partial<MockTrackedVestingPositionFixture>) {
  return {
    id: "vesting-1",
    vestingProvider: "streamflow",
    vestingReference: "exchange:exchange-1:streamflow-lock:v1",
    streamflowClientCorrelationId: "streamflow-client:exchange-1:v1",
    streamflowExpectedRecipientWalletAddress: "wallet-1",
    streamflowExpectedMintAddress: "mint-1",
    streamflowExpectedAmountAtomic: BigInt(1_000_000),
    streamflowExpectedStartAt: new Date("2026-04-03T00:00:00.000Z"),
    streamflowExpectedEndAt: new Date("2026-05-03T00:00:00.000Z"),
    streamflowExpectedVestingKind: "token_lock" satisfies StreamflowVestingKind,
    streamflowReconcileAttemptCount: 0,
    streamflowManualReviewRequired: false,
    ...overrides,
  };
}

export function buildMockObservedArtifactFixture(
  overrides?: Partial<MockStreamflowObservedArtifact>,
): MockStreamflowObservedArtifact {
  return createMockStreamflowObservedArtifact({
    artifactId: "artifact-1",
    vestingReference: "exchange:exchange-1:streamflow-lock:v1",
    clientCorrelationId: "streamflow-client:exchange-1:v1",
    scheduleId: "schedule-1",
    beneficiaryAddress: "wallet-1",
    mintAddress: "mint-1",
    amountAtomic: BigInt(1_000_000),
    startAt: new Date("2026-04-03T00:00:00.000Z"),
    endAt: new Date("2026-05-03T00:00:00.000Z"),
    vestingKind: "token_lock",
    treasuryAddress: "treasury-1",
    escrowAddress: "escrow-1",
    txSignature: "tx-1",
    observedState: "created",
    observedAt: new Date("2026-04-03T01:00:00.000Z"),
    ...overrides,
  });
}
