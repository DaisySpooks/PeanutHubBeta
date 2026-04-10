import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

type ConfigDbClient = typeof db | Prisma.TransactionClient;

async function getSystemConfigRow(dbClient: ConfigDbClient, key: string) {
  const config = await dbClient.systemConfig.findUnique({
    where: { key },
    select: {
      key: true,
      value: true,
    },
  });

  if (!config) {
    throw new Error(`Missing required system config: ${key}`);
  }

  return config;
}

export async function getBooleanSystemConfig(
  dbClient: ConfigDbClient,
  key: string,
) {
  const config = await getSystemConfigRow(dbClient, key);
  const normalized = config.value.trim().toLowerCase();

  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  throw new Error(`System config ${key} must be either true or false.`);
}
