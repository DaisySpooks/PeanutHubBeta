CREATE TABLE "WithdrawalPayoutAttempt" (
    "id" TEXT NOT NULL,
    "withdrawalId" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "jobId" TEXT,
    "attemptNumber" INTEGER,
    "eventType" TEXT NOT NULL,
    "message" TEXT,
    "solanaTxSignature" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WithdrawalPayoutAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WithdrawalWorkerStatus" (
    "actor" TEXT NOT NULL,
    "currentMode" TEXT,
    "isRunning" BOOLEAN NOT NULL DEFAULT false,
    "lastHeartbeatAt" TIMESTAMP(3),
    "lastRunStartedAt" TIMESTAMP(3),
    "lastRunCompletedAt" TIMESTAMP(3),
    "lastSummary" TEXT,
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WithdrawalWorkerStatus_pkey" PRIMARY KEY ("actor")
);

CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowStartedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "WithdrawalPayoutAttempt_withdrawalId_createdAt_idx" ON "WithdrawalPayoutAttempt"("withdrawalId", "createdAt");
CREATE INDEX "WithdrawalPayoutAttempt_eventType_createdAt_idx" ON "WithdrawalPayoutAttempt"("eventType", "createdAt");
CREATE INDEX "WithdrawalWorkerStatus_lastHeartbeatAt_idx" ON "WithdrawalWorkerStatus"("lastHeartbeatAt");
CREATE INDEX "RateLimitBucket_expiresAt_idx" ON "RateLimitBucket"("expiresAt");

ALTER TABLE "WithdrawalPayoutAttempt"
ADD CONSTRAINT "WithdrawalPayoutAttempt_withdrawalId_fkey"
FOREIGN KEY ("withdrawalId") REFERENCES "Withdrawal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
