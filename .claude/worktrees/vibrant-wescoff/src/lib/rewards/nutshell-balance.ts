import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";

type BalanceDbClient = PrismaClient | Prisma.TransactionClient;

export async function getDerivedNutshellBalance(dbClient: BalanceDbClient, userId: string) {
  const result = await dbClient.nutshellLedger.aggregate({
    where: { userId },
    _sum: {
      delta: true,
    },
  });

  return result._sum.delta ?? 0;
}

export async function syncNutshellBalanceCache(
  dbClient: BalanceDbClient,
  userId: string,
  balance: number,
) {
  await dbClient.user.update({
    where: { id: userId },
    data: {
      nutshellBalance: balance,
    },
  });
}
