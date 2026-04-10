ALTER TABLE "VestingPosition"
RENAME COLUMN "vestingProviderStatus" TO "streamflowLifecycleStatus";

ALTER TABLE "VestingPosition"
RENAME COLUMN "streamflowExpectedAmount" TO "streamflowExpectedAmountAtomic";

ALTER TABLE "VestingPosition"
RENAME COLUMN "streamflowCreatedTxSignature" TO "streamflowCreationTxSignature";

ALTER TABLE "VestingPosition"
RENAME COLUMN "streamflowCreatedAt" TO "streamflowScheduleCreatedAt";

ALTER TABLE "VestingPosition"
RENAME COLUMN "streamflowLastObservedState" TO "streamflowObservedScheduleState";

ALTER TABLE "VestingPosition"
RENAME COLUMN "streamflowLastObservedTxSignature" TO "streamflowObservedCreationTxSignature";

ALTER TABLE "VestingPosition"
ADD COLUMN "streamflowClientCorrelationId" TEXT;

CREATE UNIQUE INDEX "VestingPosition_streamflowClientCorrelationId_key"
ON "VestingPosition"("streamflowClientCorrelationId");

DROP INDEX "VestingPosition_vestingProvider_vestingProviderStatus_idx";

CREATE INDEX "VestingPosition_vestingProvider_streamflowLifecycleStatus_idx"
ON "VestingPosition"("vestingProvider", "streamflowLifecycleStatus");

ALTER INDEX "VestingPosition_streamflowCreatedTxSignature_key"
RENAME TO "VestingPosition_streamflowCreationTxSignature_key";
