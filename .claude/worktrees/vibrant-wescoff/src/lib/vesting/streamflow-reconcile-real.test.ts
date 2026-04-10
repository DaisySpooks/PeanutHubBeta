import assert from "node:assert/strict";
import test from "node:test";
import type { StreamflowAdapter, StreamflowScheduleStatus } from "./streamflow-adapter";

type MockTrackedVestingPosition = {
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

class InMemoryRealReconcileRepository {
  public readonly attempts: Array<Record<string, unknown>> = [];
  public readonly trackingUpdates: Array<Record<string, unknown>> = [];

  constructor(public trackedVesting: MockTrackedVestingPosition | null) {}

  async getTrackedVestingPosition() {
    return this.trackedVesting;
  }

  async updateTracking(params: Record<string, unknown>) {
    this.trackingUpdates.push(params);
  }

  async recordAttempt(params: Record<string, unknown>) {
    this.attempts.push(params);
  }
}

class StatusAdapter implements StreamflowAdapter {
  constructor(private readonly status: StreamflowScheduleStatus | Error) {}

  async prepareSchedule() {
    throw new Error("Not used in this test.");
  }

  async createSchedule() {
    throw new Error("Not used in this test.");
  }

  async getScheduleStatus() {
    if (this.status instanceof Error) {
      throw this.status;
    }

    return this.status;
  }

  async searchForSchedule() {
    throw new Error("Not used in this test.");
  }
}

function createTrackedVesting(
  overrides?: Partial<MockTrackedVestingPosition>,
): MockTrackedVestingPosition {
  return {
    id: "vesting-1",
    exchangeId: "exchange-1",
    vestingProvider: "streamflow",
    streamflowLifecycleStatus: "created",
    vestingReference: "exchange:exchange-1:streamflow-lock:v1",
    streamflowClientCorrelationId: "streamflow-client:exchange-1:v1",
    streamflowExpectedRecipientWalletAddress: "11111111111111111111111111111112",
    streamflowExpectedMintAddress: "11111111111111111111111111111113",
    streamflowExpectedAmountAtomic: BigInt(1_000_000),
    streamflowExpectedStartAt: new Date("2026-04-03T00:00:00.000Z"),
    streamflowExpectedEndAt: new Date("2026-05-03T00:00:00.000Z"),
    streamflowExpectedVestingKind: "token_lock",
    streamflowScheduleId: "schedule-1",
    streamflowManualReviewRequired: false,
    streamflowManualReviewReason: null,
    ...overrides,
  };
}

function applyTestEnv() {
  process.env.DATABASE_URL = "https://example.com/db";
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL = "https://api.devnet.solana.com";
  process.env.SOLANA_RPC_URL = "https://api.devnet.solana.com";
  process.env.PEANUT_TOKEN_MINT_ADDRESS = "11111111111111111111111111111113";
  process.env.WALLET_AUTH_MESSAGE = "test-wallet-auth-message";
  process.env.JWT_SECRET = "test-secret-string-with-at-least-32-characters";
  process.env.STREAMFLOW_INTEGRATION_ENABLED = "true";
  process.env.STREAMFLOW_ADAPTER_MODE = "sdk";
  process.env.STREAMFLOW_RECONCILE_ENABLED = "true";
  process.env.STREAMFLOW_SDK_ALLOW_PRODUCTION = "false";
  process.env.STREAMFLOW_TREASURY_ADDRESS = "11111111111111111111111111111114";
}

async function loadRealReconcileModule() {
  applyTestEnv();
  return import(`./streamflow-reconcile-real.ts?test=${Date.now()}-${Math.random()}`);
}

test("reconciles a real Streamflow schedule and persists a matched result", async () => {
  const { reconcileRealStreamflowScheduleForVestingPosition } = await loadRealReconcileModule();
  const repository = new InMemoryRealReconcileRepository(createTrackedVesting());
  const adapter = new StatusAdapter({
    state: "confirmed",
    statusRaw: "lock",
    scheduleId: "schedule-1",
    txSignature: "tx-1",
    confirmedAt: new Date("2026-04-03T00:10:00.000Z"),
    beneficiaryAddress: "11111111111111111111111111111112",
    mintAddress: "11111111111111111111111111111113",
    amountAtomic: BigInt(1_000_000),
    startAt: new Date("2026-04-03T00:00:00.000Z"),
    endAt: new Date("2026-05-03T00:00:00.000Z"),
    vestingKind: "token_lock",
    treasuryAddress: "11111111111111111111111111111114",
    escrowAddress: "escrow-1",
    lastCheckedAt: new Date("2026-04-03T00:11:00.000Z"),
  });

  const result = await reconcileRealStreamflowScheduleForVestingPosition({
    vestingPositionId: "vesting-1",
    triggeredBy: "test",
    repository: repository as never,
    adapter,
  });

  assert.equal(result.status, "matched");
  assert.equal(result.providerState, "confirmed");
  assert.equal(repository.attempts[0]?.attemptType, "sdk-status-requested");
  assert.equal(repository.attempts.at(-1)?.result, "confirmed");
  assert.equal(repository.trackingUpdates.at(-1)?.streamflowLifecycleStatus, "matched");
});

test("moves a real Streamflow mismatch into manual review", async () => {
  const { reconcileRealStreamflowScheduleForVestingPosition } = await loadRealReconcileModule();
  const repository = new InMemoryRealReconcileRepository(createTrackedVesting());
  const adapter = new StatusAdapter({
    state: "confirmed",
    statusRaw: "lock",
    scheduleId: "schedule-1",
    txSignature: "tx-1",
    confirmedAt: new Date("2026-04-03T00:10:00.000Z"),
    beneficiaryAddress: "11111111111111111111111111111111",
    mintAddress: "11111111111111111111111111111113",
    amountAtomic: BigInt(1_000_000),
    startAt: new Date("2026-04-03T00:00:00.000Z"),
    endAt: new Date("2026-05-03T00:00:00.000Z"),
    vestingKind: "token_lock",
    treasuryAddress: "11111111111111111111111111111114",
    escrowAddress: "escrow-1",
    lastCheckedAt: new Date("2026-04-03T00:11:00.000Z"),
  });

  const result = await reconcileRealStreamflowScheduleForVestingPosition({
    vestingPositionId: "vesting-1",
    triggeredBy: "test",
    repository: repository as never,
    adapter,
  });

  assert.equal(result.status, "manual_review");
  assert.match(result.reason, /recipient_mismatch/);
  assert.equal(repository.attempts.at(-1)?.result, "mismatched");
  assert.equal(repository.trackingUpdates.at(-1)?.streamflowLifecycleStatus, "manual_review");
});

test("records retryable failure when provider status fetch fails", async () => {
  const { reconcileRealStreamflowScheduleForVestingPosition } = await loadRealReconcileModule();
  const repository = new InMemoryRealReconcileRepository(createTrackedVesting());
  const adapter = new StatusAdapter(new Error("rpc unavailable"));

  const result = await reconcileRealStreamflowScheduleForVestingPosition({
    vestingPositionId: "vesting-1",
    triggeredBy: "test",
    repository: repository as never,
    adapter,
  });

  assert.equal(result.status, "retryable_failure");
  assert.equal(repository.attempts.at(-1)?.result, "retryable_failure");
  assert.equal(repository.trackingUpdates.at(-1)?.streamflowLifecycleStatus, "retryable_failure");
});
