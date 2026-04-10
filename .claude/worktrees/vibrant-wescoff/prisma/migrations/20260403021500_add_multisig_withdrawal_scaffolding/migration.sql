ALTER TYPE "WithdrawalStatus" ADD VALUE IF NOT EXISTS 'AWAITING_SIGNATURES';
ALTER TYPE "WithdrawalStatus" ADD VALUE IF NOT EXISTS 'SUBMITTED';

ALTER TABLE "Withdrawal"
ADD COLUMN "payoutReference" TEXT,
ADD COLUMN "multisigProvider" TEXT,
ADD COLUMN "multisigAccountAddress" TEXT,
ADD COLUMN "multisigProposalId" TEXT,
ADD COLUMN "multisigProposalStatus" TEXT,
ADD COLUMN "preparedInstructionHash" TEXT,
ADD COLUMN "preparedAt" TIMESTAMP(3),
ADD COLUMN "submittedTxSignature" TEXT,
ADD COLUMN "submittedAt" TIMESTAMP(3),
ADD COLUMN "confirmedAt" TIMESTAMP(3),
ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "lastReconciledAt" TIMESTAMP(3),
ADD COLUMN "recoveryLockId" TEXT,
ADD COLUMN "recoveryLockedAt" TIMESTAMP(3);

CREATE TABLE "WithdrawalPayoutEvent" (
    "id" TEXT NOT NULL,
    "withdrawalId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "triggeredBy" TEXT NOT NULL,
    "proposalId" TEXT,
    "txSignature" TEXT,
    "detailsJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WithdrawalPayoutEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SystemConfigAudit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "changedBy" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemConfigAudit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Withdrawal_payoutReference_key" ON "Withdrawal"("payoutReference");
CREATE UNIQUE INDEX "Withdrawal_multisigProposalId_key" ON "Withdrawal"("multisigProposalId");
CREATE UNIQUE INDEX "Withdrawal_submittedTxSignature_key" ON "Withdrawal"("submittedTxSignature");
CREATE INDEX "Withdrawal_multisigProposalStatus_idx" ON "Withdrawal"("multisigProposalStatus");
CREATE INDEX "Withdrawal_lastReconciledAt_idx" ON "Withdrawal"("lastReconciledAt");

CREATE INDEX "WithdrawalPayoutEvent_withdrawalId_createdAt_idx" ON "WithdrawalPayoutEvent"("withdrawalId", "createdAt");
CREATE INDEX "WithdrawalPayoutEvent_eventType_createdAt_idx" ON "WithdrawalPayoutEvent"("eventType", "createdAt");
CREATE INDEX "SystemConfigAudit_key_createdAt_idx" ON "SystemConfigAudit"("key", "createdAt");
CREATE INDEX "SystemConfigAudit_createdAt_idx" ON "SystemConfigAudit"("createdAt");

ALTER TABLE "WithdrawalPayoutEvent"
ADD CONSTRAINT "WithdrawalPayoutEvent_withdrawalId_fkey"
FOREIGN KEY ("withdrawalId") REFERENCES "Withdrawal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
