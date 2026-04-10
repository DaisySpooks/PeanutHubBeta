-- CreateTable
CREATE TABLE "WithdrawalTransitionAudit" (
    "id" TEXT NOT NULL,
    "withdrawalId" TEXT NOT NULL,
    "triggeredBy" TEXT NOT NULL,
    "fromStatus" "WithdrawalStatus" NOT NULL,
    "toStatus" "WithdrawalStatus" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WithdrawalTransitionAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WithdrawalTransitionAudit_withdrawalId_createdAt_idx" ON "WithdrawalTransitionAudit"("withdrawalId", "createdAt");

-- CreateIndex
CREATE INDEX "WithdrawalTransitionAudit_createdAt_idx" ON "WithdrawalTransitionAudit"("createdAt");

-- AddForeignKey
ALTER TABLE "WithdrawalTransitionAudit" ADD CONSTRAINT "WithdrawalTransitionAudit_withdrawalId_fkey" FOREIGN KEY ("withdrawalId") REFERENCES "Withdrawal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
