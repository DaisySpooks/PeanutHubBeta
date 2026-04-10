import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

type FeeScheduleDbClient = typeof db | Prisma.TransactionClient;

export type WithdrawalFeeTier = {
  id: string;
  daysAfterUnlock: number;
  feePercent: Prisma.Decimal;
  label: string | null;
};

function parsePercentToBasisPoints(feePercent: Prisma.Decimal) {
  const normalized = feePercent.toFixed(2);
  const [wholePart, fractionalPart = "00"] = normalized.split(".");

  return BigInt(`${wholePart}${fractionalPart.padEnd(2, "0").slice(0, 2)}`);
}

export function calculateWithdrawalFeeAmounts(
  grossAmount: bigint,
  feePercent: Prisma.Decimal,
) {
  const basisPoints = parsePercentToBasisPoints(feePercent);
  const feeAmount = (grossAmount * basisPoints) / BigInt(10_000);
  const netAmount = grossAmount - feeAmount;

  return {
    feeAmount,
    netAmount,
  };
}

export async function getWithdrawalFeeTier(
  dbClient: FeeScheduleDbClient,
  daysAfterUnlock: number,
): Promise<WithdrawalFeeTier> {
  const feeTier = await dbClient.feeSchedule.findFirst({
    where: {
      isActive: true,
      daysAfterUnlock: {
        lte: daysAfterUnlock,
      },
    },
    orderBy: {
      daysAfterUnlock: "desc",
    },
    select: {
      id: true,
      daysAfterUnlock: true,
      feePercent: true,
      label: true,
    },
  });

  if (!feeTier) {
    throw new Error(
      "No active FeeSchedule tier applies to this withdrawal. Configure a tier at or below the unlock day offset.",
    );
  }

  return feeTier;
}
