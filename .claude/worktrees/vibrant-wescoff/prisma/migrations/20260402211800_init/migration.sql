-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ExchangeStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "VestingStatus" AS ENUM ('LOCKED', 'UNLOCKED', 'FULLY_WITHDRAWN');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "LedgerReason" AS ENUM ('DISCORD_REWARD', 'EXCHANGE_DEBIT', 'ADMIN_CREDIT', 'ADMIN_DEBIT', 'REFUND');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "discordId" TEXT,
    "discordUsername" TEXT,
    "nutshellBalance" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NutshellLedger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" "LedgerReason" NOT NULL,
    "note" TEXT,
    "exchangeId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NutshellLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenExchange" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nutshellAmount" INTEGER NOT NULL,
    "tokenAmount" BIGINT NOT NULL,
    "exchangeRate" DECIMAL(18,8) NOT NULL,
    "status" "ExchangeStatus" NOT NULL DEFAULT 'PENDING',
    "solanaTxSignature" TEXT,
    "solanaConfirmedAt" TIMESTAMP(3),
    "jobId" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TokenExchange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VestingPosition" (
    "id" TEXT NOT NULL,
    "exchangeId" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "totalAmount" BIGINT NOT NULL,
    "withdrawnAmount" BIGINT NOT NULL DEFAULT 0,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unlockAt" TIMESTAMP(3) NOT NULL,
    "status" "VestingStatus" NOT NULL DEFAULT 'LOCKED',
    "pdaAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VestingPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Withdrawal" (
    "id" TEXT NOT NULL,
    "vestingPositionId" TEXT NOT NULL,
    "grossAmount" BIGINT NOT NULL,
    "feeAmount" BIGINT NOT NULL,
    "netAmount" BIGINT NOT NULL,
    "feePercent" DECIMAL(5,2) NOT NULL,
    "daysAfterUnlock" INTEGER NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'PENDING',
    "solanaTxSignature" TEXT,
    "solanaConfirmedAt" TIMESTAMP(3),
    "jobId" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Withdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeSchedule" (
    "id" TEXT NOT NULL,
    "daysAfterUnlock" INTEGER NOT NULL,
    "feePercent" DECIMAL(5,2) NOT NULL,
    "label" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeeSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_walletAddress_key" ON "User"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "User_discordId_key" ON "User"("discordId");

-- CreateIndex
CREATE INDEX "User_walletAddress_idx" ON "User"("walletAddress");

-- CreateIndex
CREATE INDEX "User_discordId_idx" ON "User"("discordId");

-- CreateIndex
CREATE INDEX "NutshellLedger_userId_createdAt_idx" ON "NutshellLedger"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "NutshellLedger_exchangeId_idx" ON "NutshellLedger"("exchangeId");

-- CreateIndex
CREATE INDEX "TokenExchange_userId_createdAt_idx" ON "TokenExchange"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "TokenExchange_status_idx" ON "TokenExchange"("status");

-- CreateIndex
CREATE UNIQUE INDEX "VestingPosition_exchangeId_key" ON "VestingPosition"("exchangeId");

-- CreateIndex
CREATE INDEX "VestingPosition_walletAddress_status_idx" ON "VestingPosition"("walletAddress", "status");

-- CreateIndex
CREATE INDEX "VestingPosition_unlockAt_idx" ON "VestingPosition"("unlockAt");

-- CreateIndex
CREATE INDEX "Withdrawal_vestingPositionId_idx" ON "Withdrawal"("vestingPositionId");

-- CreateIndex
CREATE INDEX "Withdrawal_status_idx" ON "Withdrawal"("status");

-- CreateIndex
CREATE UNIQUE INDEX "FeeSchedule_daysAfterUnlock_key" ON "FeeSchedule"("daysAfterUnlock");

-- CreateIndex
CREATE INDEX "FeeSchedule_daysAfterUnlock_idx" ON "FeeSchedule"("daysAfterUnlock");

-- AddForeignKey
ALTER TABLE "NutshellLedger" ADD CONSTRAINT "NutshellLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutshellLedger" ADD CONSTRAINT "NutshellLedger_exchangeId_fkey" FOREIGN KEY ("exchangeId") REFERENCES "TokenExchange"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenExchange" ADD CONSTRAINT "TokenExchange_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VestingPosition" ADD CONSTRAINT "VestingPosition_exchangeId_fkey" FOREIGN KEY ("exchangeId") REFERENCES "TokenExchange"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_vestingPositionId_fkey" FOREIGN KEY ("vestingPositionId") REFERENCES "VestingPosition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
