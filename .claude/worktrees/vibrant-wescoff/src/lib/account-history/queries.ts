import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getExchangeConfig } from "@/lib/system-config/exchange-config";
import { getBooleanSystemConfig } from "@/lib/system-config/values";
import { getDerivedVestingStatus, getWithdrawalEligibility } from "@/lib/vesting/status";
import { calculateWithdrawalFeeAmounts, getWithdrawalFeeTier } from "@/lib/withdrawals/fee-schedule";

const historySelect = {
  id: true,
  nutshellAmount: true,
  tokenAmount: true,
  exchangeRate: true,
  status: true,
  failureReason: true,
  createdAt: true,
  updatedAt: true,
  vestingPosition: {
    select: {
      id: true,
      walletAddress: true,
      totalAmount: true,
      withdrawnAmount: true,
      lockedAt: true,
      unlockAt: true,
      status: true,
      pdaAddress: true,
      vestingProvider: true,
      streamflowLifecycleStatus: true,
      vestingReference: true,
      streamflowScheduleId: true,
      streamflowObservedScheduleState: true,
      streamflowManualReviewRequired: true,
      createdAt: true,
      updatedAt: true,
      withdrawals: {
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          grossAmount: true,
          feeAmount: true,
          netAmount: true,
          feePercent: true,
          daysAfterUnlock: true,
          status: true,
          solanaTxSignature: true,
          solanaConfirmedAt: true,
          failureReason: true,
          createdAt: true,
          updatedAt: true,
          transitionAudits: {
            orderBy: {
              createdAt: "desc",
            },
            select: {
              id: true,
              triggeredBy: true,
              fromStatus: true,
              toStatus: true,
              note: true,
              createdAt: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.TokenExchangeSelect;

type HistoryRecord = Prisma.TokenExchangeGetPayload<{
  select: typeof historySelect;
}>;

type SerializedWithdrawal = {
  id: string;
  grossAmount: string;
  feeAmount: string;
  netAmount: string;
  feePercent: string;
  daysAfterUnlock: number;
  status: string;
  solanaTxSignature: string | null;
  solanaConfirmedAt: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
  transitionAudits: {
    id: string;
    triggeredBy: string;
    fromStatus: string;
    toStatus: string;
    note: string | null;
    createdAt: string;
  }[];
};

export type AccountHistoryItem = {
  id: string;
  nutshellAmount: number;
  tokenAmount: string;
  exchangeRate: string;
  status: string;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
  vestingPosition: {
    id: string;
    walletAddress: string;
    totalAmount: string;
    lockedAmount: string;
    withdrawnAmount: string;
    lockedAt: string;
    unlockAt: string;
    status: string;
    isUnlocked: boolean;
    canWithdraw: boolean;
    remainingAmount: string;
    withdrawalsEnabled: boolean;
    currentFeeTier: {
      thresholdDaysAfterUnlock: number;
      feePercent: string;
      label: string | null;
      currentDaysAfterUnlock: number;
    } | null;
    currentFeePreview: {
      estimatedFeeAmount: string;
      estimatedNetAmount: string;
    } | null;
    pdaAddress: string | null;
    vestingProvider: string | null;
    streamflowLifecycleStatus: string | null;
    vestingReference: string | null;
    streamflowScheduleId: string | null;
    streamflowObservedScheduleState: string | null;
    streamflowManualReviewRequired: boolean;
    createdAt: string;
    updatedAt: string;
    latestWithdrawalStatus: string | null;
    withdrawals: SerializedWithdrawal[];
  } | null;
};

function serializeHistoryItem(
  record: HistoryRecord,
  options: {
    withdrawalsEnabled: boolean;
    currentFeeTiers: Map<string, Awaited<ReturnType<typeof getWithdrawalFeeTier>>>;
  },
): AccountHistoryItem {
  const vesting = record.vestingPosition;
  const eligibility = vesting
    ? getWithdrawalEligibility({
        unlockAt: vesting.unlockAt,
        totalAmount: vesting.totalAmount,
        withdrawnAmount: vesting.withdrawnAmount,
      })
    : null;
  const currentDaysAfterUnlock = vesting
    ? Math.max(
        0,
        Math.floor((Date.now() - vesting.unlockAt.getTime()) / (1000 * 60 * 60 * 24)),
      )
    : 0;
  const currentFeeTier = vesting ? options.currentFeeTiers.get(vesting.id) ?? null : null;

  return {
    id: record.id,
    nutshellAmount: record.nutshellAmount,
    tokenAmount: record.tokenAmount.toString(),
    exchangeRate: record.exchangeRate.toString(),
    status: record.status,
    failureReason: record.failureReason,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    vestingPosition: vesting
      ? {
          id: vesting.id,
          walletAddress: vesting.walletAddress,
          totalAmount: vesting.totalAmount.toString(),
          lockedAmount: eligibility?.remainingAmount.toString() ?? "0",
          withdrawnAmount: vesting.withdrawnAmount.toString(),
          lockedAt: vesting.lockedAt.toISOString(),
          unlockAt: vesting.unlockAt.toISOString(),
          status: getDerivedVestingStatus({
            currentStatus: vesting.status,
            unlockAt: vesting.unlockAt,
            totalAmount: vesting.totalAmount,
            withdrawnAmount: vesting.withdrawnAmount,
          }),
          isUnlocked: eligibility?.isUnlocked ?? false,
          canWithdraw: eligibility?.canWithdraw ?? false,
          remainingAmount: eligibility?.remainingAmount.toString() ?? "0",
          withdrawalsEnabled: options.withdrawalsEnabled,
          currentFeeTier: currentFeeTier
            ? {
                thresholdDaysAfterUnlock: currentFeeTier.daysAfterUnlock,
                feePercent: currentFeeTier.feePercent.toString(),
                label: currentFeeTier.label,
                currentDaysAfterUnlock,
              }
            : null,
          currentFeePreview:
            currentFeeTier && eligibility
              ? {
                  estimatedFeeAmount: calculateWithdrawalFeeAmounts(
                    eligibility.remainingAmount,
                    currentFeeTier.feePercent,
                  ).feeAmount.toString(),
                  estimatedNetAmount: calculateWithdrawalFeeAmounts(
                    eligibility.remainingAmount,
                    currentFeeTier.feePercent,
                  ).netAmount.toString(),
                }
              : null,
          pdaAddress: vesting.pdaAddress,
          vestingProvider: vesting.vestingProvider,
          streamflowLifecycleStatus: vesting.streamflowLifecycleStatus,
          vestingReference: vesting.vestingReference,
          streamflowScheduleId: vesting.streamflowScheduleId,
          streamflowObservedScheduleState: vesting.streamflowObservedScheduleState,
          streamflowManualReviewRequired: vesting.streamflowManualReviewRequired,
          createdAt: vesting.createdAt.toISOString(),
          updatedAt: vesting.updatedAt.toISOString(),
          latestWithdrawalStatus: vesting.withdrawals[0]?.status ?? null,
          withdrawals: vesting.withdrawals.map((withdrawal) => ({
            id: withdrawal.id,
            grossAmount: withdrawal.grossAmount.toString(),
            feeAmount: withdrawal.feeAmount.toString(),
            netAmount: withdrawal.netAmount.toString(),
            feePercent: withdrawal.feePercent.toString(),
            daysAfterUnlock: withdrawal.daysAfterUnlock,
            status: withdrawal.status,
            solanaTxSignature: withdrawal.solanaTxSignature,
            solanaConfirmedAt: withdrawal.solanaConfirmedAt?.toISOString() ?? null,
            failureReason: withdrawal.failureReason,
            createdAt: withdrawal.createdAt.toISOString(),
            updatedAt: withdrawal.updatedAt.toISOString(),
            transitionAudits: withdrawal.transitionAudits.map((audit) => ({
              id: audit.id,
              triggeredBy: audit.triggeredBy,
              fromStatus: audit.fromStatus,
              toStatus: audit.toStatus,
              note: audit.note,
              createdAt: audit.createdAt.toISOString(),
            })),
          })),
        }
      : null,
  };
}

export async function getAccountHistory(userId: string) {
  const [config, withdrawalsEnabled, exchanges] = await Promise.all([
    getExchangeConfig(db),
    getBooleanSystemConfig(db, "withdrawals_enabled"),
    db.tokenExchange.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: historySelect,
    }),
  ]);

  const vestingPositions = exchanges
    .map((exchange) => exchange.vestingPosition)
    .filter((vesting): vesting is NonNullable<typeof vesting> => Boolean(vesting));

  const feeTierEntries = await Promise.all(
    vestingPositions.map(async (vesting) => {
      const currentDaysAfterUnlock = Math.max(
        0,
        Math.floor((Date.now() - vesting.unlockAt.getTime()) / (1000 * 60 * 60 * 24)),
      );

      return [
        vesting.id,
        await getWithdrawalFeeTier(db, currentDaysAfterUnlock),
      ] as const;
    }),
  );

  const currentFeeTiers = new Map(feeTierEntries);

  return {
    config: {
      exchangeRate: config.exchangeRate.toString(),
      vestingDays: config.vestingDays,
      peanutTokenDecimals: config.peanutTokenDecimals,
      peanutTokenMintAddress: config.peanutTokenMintAddress,
    },
    items: exchanges.map((exchange) =>
      serializeHistoryItem(exchange, {
        withdrawalsEnabled,
        currentFeeTiers,
      }),
    ),
  };
}
