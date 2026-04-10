ALTER TABLE "Withdrawal"
ADD COLUMN "squadsVaultIndex" INTEGER,
ADD COLUMN "squadsTransactionIndex" TEXT,
ADD COLUMN "squadsTransactionPda" TEXT,
ADD COLUMN "squadsProposalPda" TEXT,
ADD COLUMN "executionDetectedAt" TIMESTAMP(3),
ADD COLUMN "executionDetectionSource" TEXT,
ADD COLUMN "nextReconcileAt" TIMESTAMP(3),
ADD COLUMN "reconcileAttemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastSignatureSearchAt" TIMESTAMP(3),
ADD COLUMN "signatureSearchAttemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastObservedProposalState" TEXT,
ADD COLUMN "lastObservedExecutionState" TEXT,
ADD COLUMN "reconciliationFailureReason" TEXT,
ADD COLUMN "manualReviewRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "manualReviewReason" TEXT;

CREATE TABLE "WithdrawalSquadsReconciliationAttempt" (
    "id" TEXT NOT NULL,
    "withdrawalId" TEXT NOT NULL,
    "attemptType" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "proposalState" TEXT,
    "executionState" TEXT,
    "txSignature" TEXT,
    "matchedBy" TEXT,
    "errorMessage" TEXT,
    "detailsJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WithdrawalSquadsReconciliationAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Withdrawal_multisigProvider_squadsTransactionIndex_idx"
ON "Withdrawal"("multisigProvider", "squadsTransactionIndex");

CREATE INDEX "Withdrawal_multisigProvider_squadsProposalPda_idx"
ON "Withdrawal"("multisigProvider", "squadsProposalPda");

CREATE INDEX "Withdrawal_multisigProvider_nextReconcileAt_idx"
ON "Withdrawal"("multisigProvider", "nextReconcileAt");

CREATE INDEX "Withdrawal_manualReviewRequired_status_idx"
ON "Withdrawal"("manualReviewRequired", "status");

CREATE INDEX "WithdrawalSquadsReconciliationAttempt_withdrawalId_createdAt_idx"
ON "WithdrawalSquadsReconciliationAttempt"("withdrawalId", "createdAt");

CREATE INDEX "WithdrawalSquadsReconciliationAttempt_attemptType_createdAt_idx"
ON "WithdrawalSquadsReconciliationAttempt"("attemptType", "createdAt");

CREATE INDEX "WithdrawalSquadsReconciliationAttempt_result_createdAt_idx"
ON "WithdrawalSquadsReconciliationAttempt"("result", "createdAt");

CREATE UNIQUE INDEX "Withdrawal_multisigProvider_squadsTransactionIndex_key"
ON "Withdrawal"("multisigProvider", "squadsTransactionIndex")
WHERE "squadsTransactionIndex" IS NOT NULL;

CREATE UNIQUE INDEX "Withdrawal_multisigProvider_squadsProposalPda_key"
ON "Withdrawal"("multisigProvider", "squadsProposalPda")
WHERE "squadsProposalPda" IS NOT NULL;

ALTER TABLE "WithdrawalSquadsReconciliationAttempt"
ADD CONSTRAINT "WithdrawalSquadsReconciliationAttempt_withdrawalId_fkey"
FOREIGN KEY ("withdrawalId") REFERENCES "Withdrawal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
