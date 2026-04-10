import "server-only";

import { LedgerReason, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getDerivedNutshellBalance, syncNutshellBalanceCache } from "@/lib/rewards/nutshell-balance";
import {
  NutshellIssuanceValidationError,
  planNutshellIssuance,
} from "@/lib/rewards/nutshell-issuance-plan";
import { getNutshellSupplySnapshot, setNutshellIssuedSupply } from "@/lib/rewards/nutshell-supply";

const SERIALIZABLE_RETRY_LIMIT = 3;
const ISSUE_REASONS = new Set<LedgerReason>(["ADMIN_CREDIT", "DISCORD_REWARD"]);

export class NutshellIssuanceUserNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NutshellIssuanceUserNotFoundError";
  }
}

function isSerializableConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  );
}

function buildDefaultIssuanceNote(reason: LedgerReason, amount: number, walletAddress: string) {
  switch (reason) {
    case "DISCORD_REWARD":
      return `Issued ${amount} Nutshells to ${walletAddress} from the Discord reward pipeline.`;
    case "ADMIN_CREDIT":
      return `Issued ${amount} Nutshells to ${walletAddress} from an internal admin action.`;
    default:
      return `Issued ${amount} Nutshells to ${walletAddress}.`;
  }
}

export async function issueNutshellReward(params: {
  walletAddress: string;
  amount: number;
  reason: LedgerReason;
  triggeredBy: string;
  note?: string | null;
}) {
  if (!ISSUE_REASONS.has(params.reason)) {
    throw new NutshellIssuanceValidationError("Reward reason must be ADMIN_CREDIT or DISCORD_REWARD.");
  }

  const walletAddress = params.walletAddress.trim();

  if (!walletAddress) {
    throw new NutshellIssuanceValidationError("Wallet address is required for Nutshell issuance.");
  }

  for (let attempt = 1; attempt <= SERIALIZABLE_RETRY_LIMIT; attempt += 1) {
    try {
      return await db.$transaction(
        async (tx) => {
          const user = await tx.user.findUnique({
            where: { walletAddress },
            select: {
              id: true,
              walletAddress: true,
            },
          });

          if (!user) {
            throw new NutshellIssuanceUserNotFoundError(
              `No user exists for wallet ${walletAddress}.`,
            );
          }

          const [balance, supply] = await Promise.all([
            getDerivedNutshellBalance(tx, user.id),
            getNutshellSupplySnapshot(tx),
          ]);

          const plan = planNutshellIssuance({
            amount: params.amount,
            currentIssuedSupply: supply.issued,
            cap: supply.cap,
            currentUserBalance: balance,
          });

          const ledgerEntry = await tx.nutshellLedger.create({
            data: {
              userId: user.id,
              delta: params.amount,
              reason: params.reason,
              note: params.note?.trim() || buildDefaultIssuanceNote(params.reason, params.amount, walletAddress),
              createdBy: params.triggeredBy,
            },
            select: {
              id: true,
              createdAt: true,
            },
          });

          await syncNutshellBalanceCache(tx, user.id, plan.nextUserBalance);
          await setNutshellIssuedSupply({
            dbClient: tx,
            nextIssuedSupply: plan.nextIssuedSupply,
            updatedBy: params.triggeredBy,
            reason: `Issued ${params.amount} Nutshells to ${walletAddress}.`,
          });

          return {
            ledgerEntryId: ledgerEntry.id,
            walletAddress,
            userId: user.id,
            amount: params.amount,
            reason: params.reason,
            note: params.note?.trim() || buildDefaultIssuanceNote(params.reason, params.amount, walletAddress),
            issuedSupply: plan.nextIssuedSupply,
            remainingSupply: plan.remainingSupply,
            userBalance: plan.nextUserBalance,
            createdAt: ledgerEntry.createdAt.toISOString(),
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

  throw new Error("Unable to issue Nutshell rewards after multiple retries.");
}
