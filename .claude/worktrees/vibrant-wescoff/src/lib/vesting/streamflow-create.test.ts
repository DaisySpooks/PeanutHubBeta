import assert from "node:assert/strict";
import test from "node:test";
import { VestingStatus } from "@prisma/client";
import type {
  StreamflowAdapter,
  StreamflowCreatedSchedule,
  StreamflowScheduleStatus,
} from "./streamflow-adapter";

type MockTrackedVestingPosition = {
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

class InMemoryCreateRepository {
  public readonly attempts: Array<Record<string, unknown>> = [];
  public readonly trackingUpdates: Array<Record<string, unknown>> = [];

  constructor(public trackedVesting: MockTrackedVestingPosition | null) {}

  async getTrackedVestingPosition() {
    return this.trackedVesting;
  }

  async claimForCreate() {
    if (!this.trackedVesting) {
      return false;
    }

    if (this.trackedVesting.streamflowScheduleId !== null) {
      return false;
    }

    this.trackedVesting.streamflowLifecycleStatus = "pending_creation";
    return true;
  }

  async updateTracking(params: Record<string, unknown>) {
    this.trackingUpdates.push(params);

    if (!this.trackedVesting) {
      return;
    }

    if ("streamflowLifecycleStatus" in params) {
      this.trackedVesting.streamflowLifecycleStatus =
        (params.streamflowLifecycleStatus as string | null | undefined) ?? null;
    }

    if ("streamflowManualReviewRequired" in params) {
      this.trackedVesting.streamflowManualReviewRequired = Boolean(
        params.streamflowManualReviewRequired,
      );
    }

    if ("streamflowScheduleId" in params && typeof params.streamflowScheduleId === "string") {
      this.trackedVesting.streamflowScheduleId = params.streamflowScheduleId;
    }
  }

  async recordAttempt(params: Record<string, unknown>) {
    this.attempts.push(params);
  }
}

class SuccessfulAdapter implements StreamflowAdapter {
  async prepareSchedule() {
    throw new Error("Not used in this test.");
  }

  async createSchedule(): Promise<StreamflowCreatedSchedule> {
    return {
      provider: "streamflow",
      scheduleId: "schedule-1",
      treasuryAddress: "11111111111111111111111111111114",
      escrowAddress: "escrow-1",
      beneficiaryAddress: "11111111111111111111111111111112",
      mintAddress: "11111111111111111111111111111113",
      amountAtomic: BigInt(1_000_000),
      startAt: new Date("2026-04-03T00:00:00.000Z"),
      endAt: new Date("2026-05-03T00:00:00.000Z"),
      vestingKind: "token_lock",
      txSignature: "tx-1",
      state: "created",
      createdAt: new Date("2026-04-03T00:10:00.000Z"),
    };
  }

  async getScheduleStatus() {
    return {
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
    } satisfies StreamflowScheduleStatus;
  }

  async searchForSchedule() {
    throw new Error("Not used in this test.");
  }
}

class StatusAdapter extends SuccessfulAdapter {
  constructor(private readonly status: StreamflowScheduleStatus | Error) {
    super();
  }

  override async getScheduleStatus() {
    if (this.status instanceof Error) {
      throw this.status;
    }

    return this.status;
  }
}

function createTrackedVesting(
  overrides?: Partial<MockTrackedVestingPosition>,
): MockTrackedVestingPosition {
  return {
    id: "vesting-1",
    exchangeId: "exchange-1",
    status: VestingStatus.LOCKED,
    withdrawnAmount: BigInt(0),
    vestingProvider: "streamflow",
    streamflowLifecycleStatus: "expected_only",
    vestingReference: "exchange:exchange-1:streamflow-lock:v1",
    streamflowClientCorrelationId: "streamflow-client:exchange-1:v1",
    streamflowExpectedRecipientWalletAddress: "11111111111111111111111111111112",
    streamflowExpectedMintAddress: "11111111111111111111111111111113",
    streamflowExpectedAmountAtomic: BigInt(1_000_000),
    streamflowExpectedStartAt: new Date("2026-04-03T00:00:00.000Z"),
    streamflowExpectedEndAt: new Date("2026-05-03T00:00:00.000Z"),
    streamflowExpectedVestingKind: "token_lock",
    streamflowScheduleId: null,
    streamflowCreationTxSignature: null,
    streamflowObservedCreationTxSignature: null,
    streamflowScheduleCreatedAt: null,
    streamflowObservedScheduleState: null,
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
  process.env.STREAMFLOW_CREATE_ENABLED = "true";
  process.env.STREAMFLOW_SDK_EXECUTION_ENABLED = "true";
  process.env.STREAMFLOW_SDK_ALLOW_PRODUCTION = "false";
  process.env.STREAMFLOW_TREASURY_ADDRESS = "11111111111111111111111111111114";
}

async function loadCreateModule() {
  applyTestEnv();
  return import(`./streamflow-create.ts?test=${Date.now()}-${Math.random()}`);
}

test("creates a guarded Streamflow schedule and records audit attempts", async () => {
  const { createStreamflowScheduleForVestingPosition } = await loadCreateModule();
  const repository = new InMemoryCreateRepository(createTrackedVesting());
  const adapter = new SuccessfulAdapter();

  const result = await createStreamflowScheduleForVestingPosition({
    vestingPositionId: "vesting-1",
    triggeredBy: "test",
    repository: repository as never,
    adapter,
  });

  assert.equal(result.status, "created");
  assert.equal(result.scheduleId, "schedule-1");
  assert.equal(result.providerState, "confirmed");
  assert.equal(result.verificationState, "verified");
  assert.equal(repository.attempts[0]?.attemptType, "sdk-create-requested");
  assert.equal(repository.attempts.at(-1)?.attemptType, "sdk-create-verify");
  assert.equal(repository.attempts.at(-1)?.result, "confirmed");
  assert.equal(repository.trackingUpdates.at(-1)?.streamflowLifecycleStatus, "matched");
});

test("sends invalid payloads to manual review instead of executing", async () => {
  const { createStreamflowScheduleForVestingPosition } = await loadCreateModule();
  const repository = new InMemoryCreateRepository(
    createTrackedVesting({
      streamflowExpectedRecipientWalletAddress: "not-a-wallet",
    }),
  );
  const adapter = new SuccessfulAdapter();

  const result = await createStreamflowScheduleForVestingPosition({
    vestingPositionId: "vesting-1",
    triggeredBy: "test",
    repository: repository as never,
    adapter,
  });

  assert.equal(result.status, "validation_failed");
  assert.equal(repository.attempts.at(-1)?.result, "validation_failed");
  assert.equal(repository.trackingUpdates.at(-1)?.streamflowLifecycleStatus, "manual_review");
});

test("refuses duplicate create attempts when a schedule already exists", async () => {
  const { StreamflowCreateEligibilityError, createStreamflowScheduleForVestingPosition } =
    await loadCreateModule();
  const repository = new InMemoryCreateRepository(
    createTrackedVesting({
      streamflowScheduleId: "existing-schedule",
    }),
  );
  const adapter = new SuccessfulAdapter();

  await assert.rejects(
    () =>
      createStreamflowScheduleForVestingPosition({
        vestingPositionId: "vesting-1",
        triggeredBy: "test",
        repository: repository as never,
        adapter,
      }),
    StreamflowCreateEligibilityError,
  );

  assert.equal(repository.attempts.at(-1)?.attemptType, "sdk-create-refused");
});

test("moves the create flow into manual review when immediate real verification finds a mismatch", async () => {
  const { createStreamflowScheduleForVestingPosition } = await loadCreateModule();
  const repository = new InMemoryCreateRepository(createTrackedVesting());
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

  const result = await createStreamflowScheduleForVestingPosition({
    vestingPositionId: "vesting-1",
    triggeredBy: "test",
    repository: repository as never,
    adapter,
  });

  assert.equal(result.status, "manual_review");
  assert.equal(result.scheduleId, "schedule-1");
  assert.match(result.reason, /recipient_mismatch/);
  assert.equal(repository.attempts.at(-1)?.attemptType, "sdk-create-verify");
  assert.equal(repository.attempts.at(-1)?.result, "mismatched");
  assert.equal(repository.trackingUpdates.at(-1)?.streamflowLifecycleStatus, "manual_review");
});

test("keeps the create happy path successful when immediate verification is temporarily unavailable", async () => {
  const { createStreamflowScheduleForVestingPosition } = await loadCreateModule();
  const repository = new InMemoryCreateRepository(createTrackedVesting());
  const adapter = new StatusAdapter(new Error("rpc temporarily unavailable"));

  const result = await createStreamflowScheduleForVestingPosition({
    vestingPositionId: "vesting-1",
    triggeredBy: "test",
    repository: repository as never,
    adapter,
  });

  assert.equal(result.status, "created");
  assert.equal(result.scheduleId, "schedule-1");
  assert.equal(result.verificationState, "deferred");
  assert.match(result.verificationReason ?? "", /temporarily unavailable/);
  assert.equal(repository.attempts.at(-1)?.attemptType, "sdk-create-verify");
  assert.equal(repository.attempts.at(-1)?.result, "deferred");
  assert.equal(repository.trackingUpdates.at(-1)?.streamflowLifecycleStatus, "created");
});
