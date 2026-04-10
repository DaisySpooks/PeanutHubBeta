import "server-only";

import { ExchangeStatus, Prisma, type User } from "@prisma/client";
import { db } from "@/lib/db";
import { getDerivedNutshellBalance, syncNutshellBalanceCache } from "@/lib/rewards/nutshell-balance";
import { getExchangeConfig } from "@/lib/system-config/exchange-config";
import {
  buildStreamflowClientCorrelationId,
  buildStreamflowVestingReference,
  getDefaultStreamflowVestingKind,
} from "@/lib/vesting/streamflow-intent";

const SERIALIZABLE_RETRY_LIMIT = 3;

export class ExchangeValidationError extends Error {}

type ExchangeActor = Pick<User, "id" | "walletAddress">;

function parseDecimalToFraction(value: string) {
  const normalized = value.trim();

  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new ExchangeValidationError("Exchange rate config is invalid.");
  }

  const [wholePart, fractionalPart = ""] = normalized.split(".");
  const denominator = BigInt(10) ** BigInt(fractionalPart.length);
  const numerator = BigInt(`${wholePart}${fractionalPart}`);

  return {
    numerator,
    denominator,
  };
}

function calculateTokenAmountAtomic(
  nutshellAmount: number,
  exchangeRate: Prisma.Decimal,
  peanutTokenDecimals: number,
) {
  const { numerator, denominator } = parseDecimalToFraction(exchangeRate.toString());
  const atomicScale = BigInt(10) ** BigInt(peanutTokenDecimals);

  return (BigInt(nutshellAmount) * numerator * atomicScale) / denominator;
}

function buildUnlockDate(vestingDays: number) {
  const unlockAt = new Date();
  unlockAt.setUTCDate(unlockAt.getUTCDate() + vestingDays);
  return unlockAt;
}

function isSerializableConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  );
}

export async function createExchange(actor: ExchangeActor, nutshellAmount: number) {
  if (!Number.isInteger(nutshellAmount) || nutshellAmount <= 0) {
    throw new ExchangeValidationError("Exchange amount must be a positive whole number.");
  }

  for (let attempt = 1; attempt <= SERIALIZABLE_RETRY_LIMIT; attempt += 1) {
    try {
      return await db.$transaction(
        async (tx) => {
          const [config, balance] = await Promise.all([
            getExchangeConfig(tx),
            getDerivedNutshellBalance(tx, actor.id),
          ]);

          if (nutshellAmount > balance) {
            throw new ExchangeValidationError("Insufficient Nutshell balance for this exchange.");
          }

          const tokenAmount = calculateTokenAmountAtomic(
            nutshellAmount,
            config.exchangeRate,
            config.peanutTokenDecimals,
          );

          if (tokenAmount <= BigInt(0)) {
            throw new ExchangeValidationError(
              "Exchange amount is too small for the current configured rate.",
            );
          }

          const exchange = await tx.tokenExchange.create({
            data: {
              userId: actor.id,
              nutshellAmount,
              tokenAmount,
              exchangeRate: config.exchangeRate,
              status: ExchangeStatus.PENDING,
            },
            select: {
              id: true,
              nutshellAmount: true,
              tokenAmount: true,
              exchangeRate: true,
              status: true,
              createdAt: true,
            },
          });

          const lockedAt = new Date();
          const unlockAt = buildUnlockDate(config.vestingDays);
          const vestingReference = buildStreamflowVestingReference(exchange.id);
          const streamflowClientCorrelationId = buildStreamflowClientCorrelationId(exchange.id);

          const vestingPosition = await tx.vestingPosition.create({
            data: {
              exchangeId: exchange.id,
              walletAddress: actor.walletAddress,
              totalAmount: tokenAmount,
              lockedAt,
              unlockAt,
              vestingProvider: "streamflow",
              streamflowLifecycleStatus: "expected_only",
              vestingReference,
              streamflowClientCorrelationId,
              streamflowExpectedVestingKind: getDefaultStreamflowVestingKind(),
              streamflowExpectedRecipientWalletAddress: actor.walletAddress,
              streamflowExpectedMintAddress: config.peanutTokenMintAddress,
              streamflowExpectedAmountAtomic: tokenAmount,
              streamflowExpectedStartAt: lockedAt,
              streamflowExpectedEndAt: unlockAt,
              streamflowPreparedAt: lockedAt,
              streamflowNextReconcileAt: lockedAt,
            },
            select: {
              id: true,
              unlockAt: true,
              status: true,
            },
          });

          await tx.nutshellLedger.create({
            data: {
              userId: actor.id,
              delta: -nutshellAmount,
              reason: "EXCHANGE_DEBIT",
              note: `Exchange ${exchange.id} created for ${nutshellAmount} Nutshells.`,
              exchangeId: exchange.id,
              createdBy: actor.walletAddress,
            },
          });

          await syncNutshellBalanceCache(tx, actor.id, balance - nutshellAmount);

          return {
            id: exchange.id,
            nutshellAmount: exchange.nutshellAmount,
            tokenAmount: exchange.tokenAmount.toString(),
            exchangeRate: exchange.exchangeRate.toString(),
            status: exchange.status,
            createdAt: exchange.createdAt.toISOString(),
            vestingPosition: {
              id: vestingPosition.id,
              unlockAt: vestingPosition.unlockAt.toISOString(),
              status: vestingPosition.status,
            },
            config: {
              exchangeRate: config.exchangeRate.toString(),
              vestingDays: config.vestingDays,
              peanutTokenDecimals: config.peanutTokenDecimals,
              peanutTokenMintAddress: config.peanutTokenMintAddress,
            },
            remainingBalance: balance - nutshellAmount,
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

  throw new Error("Unable to create exchange after multiple retries.");
}
