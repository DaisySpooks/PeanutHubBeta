ALTER TABLE "VestingPosition"
ADD COLUMN "vestingProvider" TEXT,
ADD COLUMN "vestingProviderStatus" TEXT,
ADD COLUMN "vestingReference" TEXT,
ADD COLUMN "streamflowExpectedVestingKind" TEXT,
ADD COLUMN "streamflowExpectedRecipientWalletAddress" TEXT,
ADD COLUMN "streamflowExpectedMintAddress" TEXT,
ADD COLUMN "streamflowExpectedAmount" BIGINT,
ADD COLUMN "streamflowExpectedStartAt" TIMESTAMP(3),
ADD COLUMN "streamflowExpectedEndAt" TIMESTAMP(3),
ADD COLUMN "streamflowScheduleId" TEXT,
ADD COLUMN "streamflowTreasuryAddress" TEXT,
ADD COLUMN "streamflowEscrowAddress" TEXT,
ADD COLUMN "streamflowBeneficiaryAddress" TEXT,
ADD COLUMN "streamflowMintAddress" TEXT,
ADD COLUMN "streamflowCreatedTxSignature" TEXT,
ADD COLUMN "streamflowPreparedAt" TIMESTAMP(3),
ADD COLUMN "streamflowCreatedAt" TIMESTAMP(3),
ADD COLUMN "streamflowConfirmedAt" TIMESTAMP(3),
ADD COLUMN "streamflowLastReconciledAt" TIMESTAMP(3),
ADD COLUMN "streamflowNextReconcileAt" TIMESTAMP(3),
ADD COLUMN "streamflowReconcileAttemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "streamflowLastObservedState" TEXT,
ADD COLUMN "streamflowLastObservedTxSignature" TEXT,
ADD COLUMN "streamflowReconciliationFailureReason" TEXT,
ADD COLUMN "streamflowManualReviewRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "streamflowManualReviewReason" TEXT;

CREATE UNIQUE INDEX "VestingPosition_vestingReference_key"
ON "VestingPosition"("vestingReference");

CREATE UNIQUE INDEX "VestingPosition_streamflowScheduleId_key"
ON "VestingPosition"("streamflowScheduleId");

CREATE UNIQUE INDEX "VestingPosition_streamflowCreatedTxSignature_key"
ON "VestingPosition"("streamflowCreatedTxSignature");

CREATE INDEX "VestingPosition_vestingProvider_vestingProviderStatus_idx"
ON "VestingPosition"("vestingProvider", "vestingProviderStatus");

CREATE INDEX "VestingPosition_streamflowNextReconcileAt_streamflowManualReviewRequired_idx"
ON "VestingPosition"("streamflowNextReconcileAt", "streamflowManualReviewRequired");

CREATE INDEX "VestingPosition_streamflowManualReviewRequired_status_idx"
ON "VestingPosition"("streamflowManualReviewRequired", "status");

CREATE TABLE "VestingStreamflowReconciliationAttempt" (
  "id" TEXT NOT NULL,
  "vestingPositionId" TEXT NOT NULL,
  "attemptType" TEXT NOT NULL,
  "result" TEXT NOT NULL,
  "observedScheduleId" TEXT,
  "observedTxSignature" TEXT,
  "observedState" TEXT,
  "matchedBy" TEXT,
  "errorMessage" TEXT,
  "detailsJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "VestingStreamflowReconciliationAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VestingStreamflowReconciliationAttempt_vestingPositionId_createdAt_idx"
ON "VestingStreamflowReconciliationAttempt"("vestingPositionId", "createdAt");

CREATE INDEX "VestingStreamflowReconciliationAttempt_attemptType_createdAt_idx"
ON "VestingStreamflowReconciliationAttempt"("attemptType", "createdAt");

CREATE INDEX "VestingStreamflowReconciliationAttempt_result_createdAt_idx"
ON "VestingStreamflowReconciliationAttempt"("result", "createdAt");

ALTER TABLE "VestingStreamflowReconciliationAttempt"
ADD CONSTRAINT "VestingStreamflowReconciliationAttempt_vestingPositionId_fkey"
FOREIGN KEY ("vestingPositionId") REFERENCES "VestingPosition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
