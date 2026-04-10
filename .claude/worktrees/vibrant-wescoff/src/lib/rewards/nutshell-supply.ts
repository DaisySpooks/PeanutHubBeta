import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export const NUTSHELL_SUPPLY_CAP = 21_000_000;
export const NUTSHELL_SUPPLY_CAP_KEY = "nutshell_supply_cap";
export const NUTSHELL_SUPPLY_ISSUED_KEY = "nutshell_supply_issued";

type ConfigDbClient = typeof db | Prisma.TransactionClient;

function parseWholeNumber(value: string, key: string) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`System config ${key} must be a non-negative whole number.`);
  }

  return parsed;
}

export async function ensureNutshellSupplyConfig(
  dbClient: ConfigDbClient,
) {
  await Promise.all([
    dbClient.systemConfig.upsert({
      where: { key: NUTSHELL_SUPPLY_CAP_KEY },
      update: {},
      create: {
        key: NUTSHELL_SUPPLY_CAP_KEY,
        value: String(NUTSHELL_SUPPLY_CAP),
        description: "Hard cap for total Nutshell rewards that may ever be issued.",
        updatedBy: "system",
      },
    }),
    dbClient.systemConfig.upsert({
      where: { key: NUTSHELL_SUPPLY_ISSUED_KEY },
      update: {},
      create: {
        key: NUTSHELL_SUPPLY_ISSUED_KEY,
        value: "0",
        description: "Total Nutshell rewards issued so far across all users.",
        updatedBy: "system",
      },
    }),
  ]);
}

export async function getNutshellSupplySnapshot(dbClient: ConfigDbClient = db) {
  await ensureNutshellSupplyConfig(dbClient);

  const configs = await dbClient.systemConfig.findMany({
    where: {
      key: {
        in: [NUTSHELL_SUPPLY_CAP_KEY, NUTSHELL_SUPPLY_ISSUED_KEY],
      },
    },
    select: {
      key: true,
      value: true,
    },
  });

  const configMap = new Map(configs.map((config) => [config.key, config.value]));
  const cap = parseWholeNumber(configMap.get(NUTSHELL_SUPPLY_CAP_KEY) ?? "", NUTSHELL_SUPPLY_CAP_KEY);
  const issued = parseWholeNumber(
    configMap.get(NUTSHELL_SUPPLY_ISSUED_KEY) ?? "",
    NUTSHELL_SUPPLY_ISSUED_KEY,
  );

  if (issued > cap) {
    throw new Error("System config nutshell_supply_issued cannot exceed nutshell_supply_cap.");
  }

  return {
    cap,
    issued,
    remaining: cap - issued,
  };
}

export async function setNutshellIssuedSupply(params: {
  dbClient: ConfigDbClient;
  nextIssuedSupply: number;
  updatedBy: string;
  reason?: string | null;
}) {
  const snapshot = await getNutshellSupplySnapshot(params.dbClient);

  if (params.nextIssuedSupply < 0 || params.nextIssuedSupply > snapshot.cap) {
    throw new Error("Nutshell issued supply must stay between zero and the configured cap.");
  }

  await params.dbClient.systemConfig.update({
    where: { key: NUTSHELL_SUPPLY_ISSUED_KEY },
    data: {
      value: String(params.nextIssuedSupply),
      updatedBy: params.updatedBy,
    },
  });

  await params.dbClient.systemConfigAudit.create({
    data: {
      key: NUTSHELL_SUPPLY_ISSUED_KEY,
      oldValue: String(snapshot.issued),
      newValue: String(params.nextIssuedSupply),
      changedBy: params.updatedBy,
      reason: params.reason ?? null,
    },
  });
}
