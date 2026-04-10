import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

const EXCHANGE_CONFIG_KEYS = [
  "exchange_rate",
  "vesting_days",
  "peanut_token_decimals",
  "peanut_token_mint_address",
] as const;

type ExchangeConfigKey = (typeof EXCHANGE_CONFIG_KEYS)[number];

type ConfigDbClient = typeof db | Prisma.TransactionClient;

export type ExchangeConfig = {
  exchangeRate: Prisma.Decimal;
  vestingDays: number;
  peanutTokenDecimals: number;
  peanutTokenMintAddress: string;
};

function getConfigValue(configs: Map<string, string>, key: ExchangeConfigKey) {
  const value = configs.get(key);

  if (!value) {
    throw new Error(`Missing required system config: ${key}`);
  }

  return value;
}

export async function getExchangeConfig(dbClient: ConfigDbClient = db): Promise<ExchangeConfig> {
  const configRows = await dbClient.systemConfig.findMany({
    where: {
      key: {
        in: [...EXCHANGE_CONFIG_KEYS],
      },
    },
  });

  const configs = new Map(configRows.map((row) => [row.key, row.value]));

  const exchangeRate = new Prisma.Decimal(getConfigValue(configs, "exchange_rate"));
  const vestingDays = Number.parseInt(getConfigValue(configs, "vesting_days"), 10);
  const peanutTokenDecimals = Number.parseInt(
    getConfigValue(configs, "peanut_token_decimals"),
    10,
  );
  const peanutTokenMintAddress = getConfigValue(configs, "peanut_token_mint_address");

  if (!exchangeRate.isFinite() || exchangeRate.lte(0)) {
    throw new Error("System config exchange_rate must be greater than zero.");
  }

  if (!Number.isInteger(vestingDays) || vestingDays <= 0) {
    throw new Error("System config vesting_days must be a positive integer.");
  }

  if (!Number.isInteger(peanutTokenDecimals) || peanutTokenDecimals < 0 || peanutTokenDecimals > 18) {
    throw new Error("System config peanut_token_decimals must be between 0 and 18.");
  }

  return {
    exchangeRate,
    vestingDays,
    peanutTokenDecimals,
    peanutTokenMintAddress,
  };
}
