import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getDerivedNutshellBalance } from "@/lib/rewards/nutshell-balance";
import { getExchangeConfig } from "@/lib/system-config/exchange-config";

const exchangeSummarySelect = {
  id: true,
  nutshellAmount: true,
  tokenAmount: true,
  exchangeRate: true,
  status: true,
  failureReason: true,
  createdAt: true,
  vestingPosition: {
    select: {
      id: true,
      unlockAt: true,
      status: true,
      vestingProvider: true,
      streamflowLifecycleStatus: true,
      vestingReference: true,
      streamflowScheduleId: true,
    },
  },
} satisfies Prisma.TokenExchangeSelect;

const ledgerSummarySelect = {
  id: true,
  delta: true,
  reason: true,
  note: true,
  createdAt: true,
  exchangeId: true,
} satisfies Prisma.NutshellLedgerSelect;

type ExchangeSummaryRecord = Prisma.TokenExchangeGetPayload<{
  select: typeof exchangeSummarySelect;
}>;

type LedgerSummaryRecord = Prisma.NutshellLedgerGetPayload<{
  select: typeof ledgerSummarySelect;
}>;

export type ExchangeSummary = {
  id: string;
  nutshellAmount: number;
  tokenAmount: string;
  exchangeRate: string;
  status: ExchangeSummaryRecord["status"];
  failureReason: string | null;
  createdAt: string;
  vestingPosition: {
    id: string;
    unlockAt: string;
    status: NonNullable<ExchangeSummaryRecord["vestingPosition"]>["status"];
    vestingProvider: string | null;
    streamflowLifecycleStatus: string | null;
    vestingReference: string | null;
    streamflowScheduleId: string | null;
  } | null;
};

export type NutshellActivityItem = {
  id: string;
  delta: number;
  reason: LedgerSummaryRecord["reason"];
  note: string | null;
  createdAt: string;
  exchangeId: string | null;
};

function serializeExchange(exchange: ExchangeSummaryRecord): ExchangeSummary {
  return {
    id: exchange.id,
    nutshellAmount: exchange.nutshellAmount,
    tokenAmount: exchange.tokenAmount.toString(),
    exchangeRate: exchange.exchangeRate.toString(),
    status: exchange.status,
    failureReason: exchange.failureReason,
    createdAt: exchange.createdAt.toISOString(),
    vestingPosition: exchange.vestingPosition
      ? {
          id: exchange.vestingPosition.id,
          unlockAt: exchange.vestingPosition.unlockAt.toISOString(),
          status: exchange.vestingPosition.status,
          vestingProvider: exchange.vestingPosition.vestingProvider,
          streamflowLifecycleStatus: exchange.vestingPosition.streamflowLifecycleStatus,
          vestingReference: exchange.vestingPosition.vestingReference,
          streamflowScheduleId: exchange.vestingPosition.streamflowScheduleId,
        }
      : null,
  };
}

function serializeLedgerEntry(entry: LedgerSummaryRecord): NutshellActivityItem {
  return {
    id: entry.id,
    delta: entry.delta,
    reason: entry.reason,
    note: entry.note,
    createdAt: entry.createdAt.toISOString(),
    exchangeId: entry.exchangeId,
  };
}

export async function getExchangeDashboardData(userId: string) {
  const [balance, config, exchanges, ledgerEntries] = await Promise.all([
    getDerivedNutshellBalance(db, userId),
    getExchangeConfig(db),
    db.tokenExchange.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: exchangeSummarySelect,
    }),
    db.nutshellLedger.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: ledgerSummarySelect,
    }),
  ]);

  return {
    nutshellBalance: balance,
    config: {
      exchangeRate: config.exchangeRate.toString(),
      vestingDays: config.vestingDays,
      peanutTokenDecimals: config.peanutTokenDecimals,
      peanutTokenMintAddress: config.peanutTokenMintAddress,
    },
    exchanges: exchanges.map(serializeExchange),
    recentNutshellActivity: ledgerEntries.map(serializeLedgerEntry),
  };
}
