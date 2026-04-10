import "server-only";

import { Prisma, WithdrawalStatus, type User } from "@prisma/client";
import { db } from "@/lib/db";
import { getExchangeConfig } from "@/lib/system-config/exchange-config";
import { getBooleanSystemConfig } from "@/lib/system-config/values";
import { getDerivedVestingStatus, getRemainingVestedAmount, getWithdrawalEligibility } from "@/lib/vesting/status";
import {
  assertWithdrawalEntryEligibility,
  assertWithdrawalEntryVestingAccess,
} from "@/lib/withdrawals/withdrawal-entry-validation";
import {
  assertWithdrawalsEnabled,
  parseWithdrawalRequestedAmountAtomic,
} from "@/lib/withdrawals/withdrawal-entry-request";
import { calculateWithdrawalFeeAmounts, getWithdrawalFeeTier } from "@/lib/withdrawals/fee-schedule";
import { WithdrawalValidationError } from "@/lib/withdrawals/withdrawal-validation-error";

const SERIALIZABLE_RETRY_LIMIT = 3;

type WithdrawalActor = Pick<User, "id" | "walletAddress">;

function isSerializableConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  );
}

export async function createWithdrawal(
  actor: WithdrawalActor,
  vestingPositionId: string,
  requestedAmount: string,
) {
  if (!vestingPositionId) {
    throw new WithdrawalValidationError("A vesting position is required.");
  }

  for (let attempt = 1; attempt <= SERIALIZABLE_RETRY_LIMIT; attempt += 1) {
    try {
      return await db.$transaction(
        async (tx) => {
          const [config, withdrawalsEnabled] = await Promise.all([
            getExchangeConfig(tx),
            getBooleanSystemConfig(tx, "withdrawals_enabled"),
          ]);

          assertWithdrawalsEnabled(withdrawalsEnabled);

          const atomicAmount = parseWithdrawalRequestedAmountAtomic({
            requestedAmount,
            peanutTokenDecimals: config.peanutTokenDecimals,
          });

          const vestingPosition = await tx.vestingPosition.findFirst({
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

          assertWithdrawalEntryEligibility({
            requestedAmountAtomic: atomicAmount,
            eligibility,
          });

          const now = new Date();
          const daysAfterUnlock = Math.max(
            0,
            Math.floor((now.getTime() - accessibleVestingPosition.unlockAt.getTime()) / (1000 * 60 * 60 * 24)),
          );
          const feeTier = await getWithdrawalFeeTier(tx, daysAfterUnlock);
          const { feeAmount, netAmount } = calculateWithdrawalFeeAmounts(
            atomicAmount,
            feeTier.feePercent,
          );

          if (netAmount < BigInt(0)) {
            throw new WithdrawalValidationError("Calculated withdrawal net amount is invalid.");
          }

          const nextWithdrawnAmount = accessibleVestingPosition.withdrawnAmount + atomicAmount;
          const nextStatus = getDerivedVestingStatus({
            currentStatus: accessibleVestingPosition.status,
            unlockAt: accessibleVestingPosition.unlockAt,
            totalAmount: accessibleVestingPosition.totalAmount,
            withdrawnAmount: nextWithdrawnAmount,
            now,
          });

          const withdrawal = await tx.withdrawal.create({
            data: {
              vestingPositionId: accessibleVestingPosition.id,
              grossAmount: atomicAmount,
              feeAmount,
              netAmount,
              feePercent: feeTier.feePercent,
              daysAfterUnlock,
              status: WithdrawalStatus.PENDING,
            },
            select: {
              id: true,
              grossAmount: true,
              feeAmount: true,
              netAmount: true,
              feePercent: true,
              daysAfterUnlock: true,
              status: true,
              createdAt: true,
            },
          });

          await tx.vestingPosition.update({
            where: { id: accessibleVestingPosition.id },
            data: {
              withdrawnAmount: nextWithdrawnAmount,
              status: nextStatus,
            },
          });

          return {
            id: withdrawal.id,
            grossAmount: withdrawal.grossAmount.toString(),
            feeAmount: withdrawal.feeAmount.toString(),
            netAmount: withdrawal.netAmount.toString(),
            feePercent: withdrawal.feePercent.toString(),
            daysAfterUnlock: withdrawal.daysAfterUnlock,
            status: withdrawal.status,
            createdAt: withdrawal.createdAt.toISOString(),
            vestingPosition: {
              id: accessibleVestingPosition.id,
              remainingAmount: getRemainingVestedAmount(
                accessibleVestingPosition.totalAmount,
                nextWithdrawnAmount,
              ).toString(),
              withdrawnAmount: nextWithdrawnAmount.toString(),
              status: nextStatus,
            },
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    } catch (error) {
      if (isSerializableConflict(error) && attempt < SERIALIZABLE_RETRY_LIMIT) {
        continue;
      }

      throw error;
    }
  }

  throw new Error("Unable to create withdrawal after multiple retries.");
}
