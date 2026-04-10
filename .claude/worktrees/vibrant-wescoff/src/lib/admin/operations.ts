import "server-only";

import { WithdrawalStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getTreasuryBalanceSnapshot } from "@/lib/withdrawals/solana-payout";

export async function getAdminOperationalOverview(staleProcessingMs: number) {
  const staleCutoff = new Date(Date.now() - staleProcessingMs);

  const [
    workerStatuses,
    staleProcessingCount,
    pendingCount,
    awaitingSignaturesCount,
    submittedCount,
    failedCount,
  ] = await Promise.all([
    db.withdrawalWorkerStatus.findMany({
      orderBy: {
        updatedAt: "desc",
      },
    }),
    db.withdrawal.count({
      where: {
        status: WithdrawalStatus.PROCESSING,
        solanaTxSignature: null,
        updatedAt: {
          lt: staleCutoff,
        },
      },
    }),
    db.withdrawal.count({
      where: {
        status: WithdrawalStatus.PENDING,
      },
    }),
    db.withdrawal.count({
      where: {
        status: WithdrawalStatus.AWAITING_SIGNATURES,
      },
    }),
    db.withdrawal.count({
      where: {
        status: WithdrawalStatus.SUBMITTED,
      },
    }),
    db.withdrawal.count({
      where: {
        status: WithdrawalStatus.FAILED,
      },
    }),
  ]);

  let treasuryBalance: Awaited<ReturnType<typeof getTreasuryBalanceSnapshot>> | null = null;
  let treasuryError: string | null = null;

  try {
    treasuryBalance = await getTreasuryBalanceSnapshot();
  } catch (error) {
    treasuryError =
      error instanceof Error
        ? error.message
        : "Unable to load treasury balance.";
  }

  return {
    workerStatuses: workerStatuses.map((worker) => ({
      actor: worker.actor,
      currentMode: worker.currentMode,
      isRunning: worker.isRunning,
      lastHeartbeatAt: worker.lastHeartbeatAt?.toISOString() ?? null,
      lastRunStartedAt: worker.lastRunStartedAt?.toISOString() ?? null,
      lastRunCompletedAt: worker.lastRunCompletedAt?.toISOString() ?? null,
      lastSummary: worker.lastSummary,
      lastError: worker.lastError,
      updatedAt: worker.updatedAt.toISOString(),
    })),
    treasuryBalance: treasuryBalance
      ? {
          ...treasuryBalance,
        }
      : null,
    treasuryError,
    queueStats: {
      staleProcessingCount,
      pendingCount,
      awaitingSignaturesCount,
      submittedCount,
      failedCount,
    },
  };
}
