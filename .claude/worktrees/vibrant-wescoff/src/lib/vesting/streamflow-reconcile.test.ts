import test from "node:test";
import assert from "node:assert/strict";

import {
  InMemoryMockStreamflowObservedArtifactSource,
  type MockStreamflowObservedArtifact,
} from "./mock-streamflow-observed-artifacts";
import {
  buildMockObservedArtifactFixture,
  buildMockTrackedVestingPositionFixture,
  type MockTrackedVestingPositionFixture,
} from "./streamflow-reconcile.fixtures";
import {
  reconcileVestingPositionWithMockStreamflow,
  type StreamflowReconciliationRepository,
} from "./streamflow-reconcile";

class InMemoryStreamflowReconciliationRepository implements StreamflowReconciliationRepository {
  public readonly attempts: Array<Parameters<StreamflowReconciliationRepository["recordAttempt"]>[0]> = [];
  public readonly trackingUpdates: Array<Parameters<StreamflowReconciliationRepository["updateTracking"]>[0]> = [];

  constructor(private trackedVesting: MockTrackedVestingPositionFixture | null) {}

  async getTrackedVestingPosition() {
    return this.trackedVesting;
  }

  async updateTracking(params: Parameters<StreamflowReconciliationRepository["updateTracking"]>[0]) {
    this.trackingUpdates.push(params);

    if (this.trackedVesting) {
      if (params.incrementReconcileAttemptCount) {
        this.trackedVesting.streamflowReconcileAttemptCount += 1;
      }

      if (typeof params.streamflowManualReviewRequired === "boolean") {
        this.trackedVesting.streamflowManualReviewRequired = params.streamflowManualReviewRequired;
      }
    }
  }

  async recordAttempt(params: Parameters<StreamflowReconciliationRepository["recordAttempt"]>[0]) {
    this.attempts.push(params);
  }
}

function createHarness(params?: {
  vesting?: Partial<MockTrackedVestingPositionFixture>;
  artifacts?: MockStreamflowObservedArtifact[];
}) {
  const repository = new InMemoryStreamflowReconciliationRepository(
    buildMockTrackedVestingPositionFixture(params?.vesting),
  );
  const artifactSource = new InMemoryMockStreamflowObservedArtifactSource(params?.artifacts ?? []);

  return { repository, artifactSource };
}

test("reconciles happy path with an exact mock artifact match", async () => {
  const { repository, artifactSource } = createHarness({
    artifacts: [buildMockObservedArtifactFixture()],
  });

  const result = await reconcileVestingPositionWithMockStreamflow({
    vestingPositionId: "vesting-1",
    triggeredBy: "test",
    repository,
    artifactSource,
  });

  assert.equal(result.status, "matched");
  assert.equal(repository.attempts.at(-1)?.result, "matched");
  assert.equal(repository.trackingUpdates.at(-1)?.streamflowLifecycleStatus, "matched");
});

test("marks missing artifact as retryable before manual review threshold", async () => {
  const { repository, artifactSource } = createHarness();

  const result = await reconcileVestingPositionWithMockStreamflow({
    vestingPositionId: "vesting-1",
    triggeredBy: "test",
    repository,
    artifactSource,
  });

  assert.equal(result.status, "missing_artifact");
  assert.ok(result.retryAt instanceof Date);
  assert.equal(repository.attempts.at(-1)?.result, "missing_artifact");
  assert.equal(repository.trackingUpdates.at(-1)?.streamflowLifecycleStatus, "missing_artifact");
});

test("flags wrong wallet as a mismatch requiring manual review", async () => {
  const { repository, artifactSource } = createHarness({
    artifacts: [
      buildMockObservedArtifactFixture({
        beneficiaryAddress: "wallet-wrong",
      }),
    ],
  });

  const result = await reconcileVestingPositionWithMockStreamflow({
    vestingPositionId: "vesting-1",
    triggeredBy: "test",
    repository,
    artifactSource,
  });

  assert.equal(result.status, "mismatched");
  assert.equal(result.reason, "recipient_mismatch");
  assert.equal(result.manualReviewRequired, true);
  assert.equal(repository.trackingUpdates.at(-1)?.streamflowLifecycleStatus, "mismatched");
});

test("flags wrong amount as a mismatch requiring manual review", async () => {
  const { repository, artifactSource } = createHarness({
    artifacts: [
      buildMockObservedArtifactFixture({
        amountAtomic: BigInt(999),
      }),
    ],
  });

  const result = await reconcileVestingPositionWithMockStreamflow({
    vestingPositionId: "vesting-1",
    triggeredBy: "test",
    repository,
    artifactSource,
  });

  assert.equal(result.status, "mismatched");
  assert.equal(result.reason, "amount_mismatch");
});

test("flags wrong mint as a mismatch requiring manual review", async () => {
  const { repository, artifactSource } = createHarness({
    artifacts: [
      buildMockObservedArtifactFixture({
        mintAddress: "mint-wrong",
      }),
    ],
  });

  const result = await reconcileVestingPositionWithMockStreamflow({
    vestingPositionId: "vesting-1",
    triggeredBy: "test",
    repository,
    artifactSource,
  });

  assert.equal(result.status, "mismatched");
  assert.equal(result.reason, "mint_mismatch");
});

test("flags duplicate matching artifacts for manual review", async () => {
  const { repository, artifactSource } = createHarness({
    artifacts: [
      buildMockObservedArtifactFixture({ artifactId: "artifact-1", scheduleId: "schedule-1" }),
      buildMockObservedArtifactFixture({ artifactId: "artifact-2", scheduleId: "schedule-2" }),
    ],
  });

  const result = await reconcileVestingPositionWithMockStreamflow({
    vestingPositionId: "vesting-1",
    triggeredBy: "test",
    repository,
    artifactSource,
  });

  assert.equal(result.status, "duplicate_artifact");
  assert.deepEqual(result.candidateScheduleIds.sort(), ["schedule-1", "schedule-2"]);
  assert.equal(repository.trackingUpdates.at(-1)?.streamflowLifecycleStatus, "duplicate_artifact");
});

test("matches an artifact found on retry", async () => {
  const repository = new InMemoryStreamflowReconciliationRepository(
    buildMockTrackedVestingPositionFixture(),
  );

  const missingSource = new InMemoryMockStreamflowObservedArtifactSource([]);
  const firstResult = await reconcileVestingPositionWithMockStreamflow({
    vestingPositionId: "vesting-1",
    triggeredBy: "test",
    repository,
    artifactSource: missingSource,
  });

  assert.equal(firstResult.status, "missing_artifact");

  const matchingSource = new InMemoryMockStreamflowObservedArtifactSource([
    buildMockObservedArtifactFixture(),
  ]);
  const secondResult = await reconcileVestingPositionWithMockStreamflow({
    vestingPositionId: "vesting-1",
    triggeredBy: "test",
    repository,
    artifactSource: matchingSource,
  });

  assert.equal(secondResult.status, "matched");
  assert.equal(repository.attempts.at(-1)?.result, "matched");
});

test("moves a repeatedly missing artifact into manual review", async () => {
  const { repository, artifactSource } = createHarness({
    vesting: {
      streamflowReconcileAttemptCount: 2,
    },
  });

  const result = await reconcileVestingPositionWithMockStreamflow({
    vestingPositionId: "vesting-1",
    triggeredBy: "test",
    repository,
    artifactSource,
  });

  assert.equal(result.status, "manual_review");
  assert.equal(repository.trackingUpdates.at(-1)?.streamflowLifecycleStatus, "manual_review");
  assert.equal(repository.trackingUpdates.at(-1)?.streamflowManualReviewRequired, true);
});

test("returns manual_review immediately when the item is already flagged and force is false", async () => {
  const { repository, artifactSource } = createHarness({
    vesting: {
      streamflowManualReviewRequired: true,
    },
    artifacts: [buildMockObservedArtifactFixture()],
  });

  const result = await reconcileVestingPositionWithMockStreamflow({
    vestingPositionId: "vesting-1",
    triggeredBy: "test",
    repository,
    artifactSource,
  });

  assert.equal(result.status, "manual_review");
  assert.equal(repository.attempts.length, 0);
});
