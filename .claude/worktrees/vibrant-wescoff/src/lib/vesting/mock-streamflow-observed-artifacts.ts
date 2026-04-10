import type { StreamflowVestingKind } from "./streamflow-adapter";
import type { StreamflowCreatedArtifactSnapshot } from "./streamflow-match";

export type MockStreamflowObservedArtifact = StreamflowCreatedArtifactSnapshot & {
  artifactId: string;
  provider: "streamflow-mock";
  observedState: "created" | "pending" | "cancelled" | "unknown";
  observedAt: Date;
};

export interface MockStreamflowObservedArtifactSource {
  findArtifacts(params: {
    vestingReference: string;
    clientCorrelationId?: string | null;
    expectedRecipientWalletAddress: string;
    expectedMintAddress: string;
    expectedAmountAtomic: bigint;
    expectedStartAt: Date;
    expectedEndAt: Date;
    expectedVestingKind: StreamflowVestingKind;
  }): Promise<MockStreamflowObservedArtifact[]>;
}

export function createMockStreamflowObservedArtifact(params: {
  artifactId: string;
  vestingReference?: string | null;
  clientCorrelationId?: string | null;
  scheduleId: string;
  beneficiaryAddress: string;
  mintAddress: string;
  amountAtomic: bigint;
  startAt: Date;
  endAt: Date;
  vestingKind: StreamflowVestingKind;
  treasuryAddress?: string | null;
  escrowAddress?: string | null;
  txSignature?: string | null;
  observedState?: "created" | "pending" | "cancelled" | "unknown";
  observedAt?: Date;
}): MockStreamflowObservedArtifact {
  return {
    artifactId: params.artifactId,
    provider: "streamflow-mock",
    vestingReference: params.vestingReference ?? null,
    clientCorrelationId: params.clientCorrelationId ?? null,
    scheduleId: params.scheduleId,
    beneficiaryAddress: params.beneficiaryAddress,
    mintAddress: params.mintAddress,
    amountAtomic: params.amountAtomic,
    startAt: params.startAt,
    endAt: params.endAt,
    vestingKind: params.vestingKind,
    treasuryAddress: params.treasuryAddress ?? null,
    escrowAddress: params.escrowAddress ?? null,
    txSignature: params.txSignature ?? null,
    observedState: params.observedState ?? "created",
    observedAt: params.observedAt ?? new Date(),
  };
}

export class InMemoryMockStreamflowObservedArtifactSource
  implements MockStreamflowObservedArtifactSource
{
  constructor(private readonly artifacts: MockStreamflowObservedArtifact[]) {}

  async findArtifacts(params: {
    vestingReference: string;
    clientCorrelationId?: string | null;
    expectedRecipientWalletAddress: string;
    expectedMintAddress: string;
    expectedAmountAtomic: bigint;
    expectedStartAt: Date;
    expectedEndAt: Date;
    expectedVestingKind: StreamflowVestingKind;
  }): Promise<MockStreamflowObservedArtifact[]> {
    return this.artifacts.filter((artifact) => {
      if (
        params.clientCorrelationId &&
        artifact.clientCorrelationId &&
        artifact.clientCorrelationId === params.clientCorrelationId
      ) {
        return true;
      }

      if (artifact.vestingReference && artifact.vestingReference === params.vestingReference) {
        return true;
      }

      return (
        artifact.beneficiaryAddress === params.expectedRecipientWalletAddress &&
        artifact.mintAddress === params.expectedMintAddress &&
        artifact.amountAtomic === params.expectedAmountAtomic &&
        artifact.startAt.getTime() === params.expectedStartAt.getTime() &&
        artifact.endAt.getTime() === params.expectedEndAt.getTime() &&
        artifact.vestingKind === params.expectedVestingKind
      );
    });
  }
}
