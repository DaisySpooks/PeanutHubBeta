import "server-only";

import { db } from "@/lib/db";
import { getExchangeConfig } from "@/lib/system-config/exchange-config";
import { getBooleanSystemConfig } from "@/lib/system-config/values";
import { getWithdrawalEligibility } from "@/lib/vesting/status";
import {
  assertWithdrawalEntryEligibility,
  assertWithdrawalEntryVestingAccess,
} from "@/lib/withdrawals/withdrawal-entry-validation";
import { assertWithdrawalsEnabled } from "@/lib/withdrawals/withdrawal-entry-request";
import { calculateWithdrawalFeeAmounts, getWithdrawalFeeTier } from "@/lib/withdrawals/fee-schedule";
import { resolveWithdrawalPreviewAmountAtomic } from "@/lib/withdrawals/withdrawal-preview-amount";

export async function getWithdrawalPreview(
  actor: {
    id: string;
    walletAddress: string;
  },
  vestingPositionId: string,
  requestedAmount?: string,
) {
  const [config, withdrawalsEnabled] = await Promise.all([
    getExchangeConfig(db),
    getBooleanSystemConfig(db, "withdrawals_enabled"),
  ]);

  assertWithdrawalsEnabled(withdrawalsEnabled);

  const vestingPosition = await db.vestingPosition.findFirst({
    where: {
      id: vestingPositionId,
      exchange: {
        userId: actor.id,
      },
    },
    select: {
      id: true,
      walletAddress: true,
      totalAmount: true,
      withdrawnAmount: true,
      unlockAt: true,
      status: true,
    },
  });

  const accessibleVestingPosition = assertWithdrawalEntryVestingAccess({
    vestingPosition,
    actorWalletAddress: actor.walletAddress,
  });

  const eligibility = getWithdrawalEligibility({
    unlockAt: accessibleVestingPosition.unlockAt,
    totalAmount: accessibleVestingPosition.totalAmount,
    withdrawnAmount: accessibleVestingPosition.withdrawnAmount,
  });

  const now = new Date();
  const daysAfterUnlock = Math.max(
    0,
    Math.floor((now.getTime() - accessibleVestingPosition.unlockAt.getTime()) / (1000 * 60 * 60 * 24)),
  );
  const feeTier = await getWithdrawalFeeTier(db, daysAfterUnlock);

  const previewAmountAtomic = resolveWithdrawalPreviewAmountAtomic({
    requestedAmount,
    peanutTokenDecimals: config.peanutTokenDecimals,
    eligibility,
  });

  assertWithdrawalEntryEligibility({
    requestedAmountAtomic: previewAmountAtomic,
    eligibility,
  });

  const { feeAmount, netAmount } = calculateWithdrawalFeeAmounts(
    previewAmountAtomic,
    feeTier.feePercent,
  );

  return {
    vestingPositionId: accessibleVestingPosition.id,
    requestedAmount: previewAmountAtomic.toString(),
    remainingAmount: eligibility.remainingAmount.toString(),
    daysAfterUnlock,
    selectedTier: {
      id: feeTier.id,
      thresholdDaysAfterUnlock: feeTier.daysAfterUnlock,
      feePercent: feeTier.feePercent.toString(),
      label: feeTier.label,
    },
    estimatedFeeAmount: feeAmount.toString(),
    estimatedNetAmount: netAmount.toString(),
    peanutTokenDecimals: config.peanutTokenDecimals,
    withdrawalsEnabled,
  };
}
