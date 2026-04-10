import "server-only";

import { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { checkRequiredCollectionOwnership, type OwnershipResult } from "@/lib/nft-gating/check-required-collection";
import { getDerivedNutshellBalance, syncNutshellBalanceCache } from "@/lib/rewards/nutshell-balance";

export const protectedUserSelect = {
  id: true,
  walletAddress: true,
  nutshellBalance: true,
  hasRequiredCollectionAccess: true,
  requiredCollectionMint: true,
  requiredCollectionCheckedAt: true,
  createdAt: true,
  lastSeenAt: true,
} satisfies Prisma.UserSelect;

export type ProtectedUser = Prisma.UserGetPayload<{
  select: typeof protectedUserSelect;
}>;

type ProtectedRouteResult =
  | {
      status: "unauthenticated";
    }
  | {
      status: "forbidden";
      user: ProtectedUser;
      ownership: OwnershipResult;
    }
  | {
      status: "authorized";
      user: ProtectedUser;
      ownership: OwnershipResult;
    };

function needsUserPersistenceUpdate(user: ProtectedUser, ownership: OwnershipResult, balance: number) {
  if (user.hasRequiredCollectionAccess !== ownership.hasAccess) {
    return true;
  }

  if ((user.requiredCollectionMint ?? null) !== ownership.matchedMint) {
    return true;
  }

  if (!user.requiredCollectionCheckedAt) {
    return true;
  }

  if (user.requiredCollectionCheckedAt.getTime() < ownership.checkedAt.getTime()) {
    return true;
  }

  return user.nutshellBalance !== balance;
}

export async function getProtectedRouteResult(): Promise<ProtectedRouteResult> {
  const session = await getSession();

  if (!session) {
    return {
      status: "unauthenticated",
    };
  }

  const existingUser = await db.user.findUnique({
    where: { walletAddress: session.walletAddress },
    select: protectedUserSelect,
  });

  if (!existingUser) {
    return {
      status: "unauthenticated",
    };
  }

  const [ownership, balance] = await Promise.all([
    checkRequiredCollectionOwnership(session.walletAddress),
    getDerivedNutshellBalance(db, existingUser.id),
  ]);

  const user = needsUserPersistenceUpdate(existingUser, ownership, balance)
    ? await db.user.update({
        where: { walletAddress: session.walletAddress },
        data: {
          hasRequiredCollectionAccess: ownership.hasAccess,
          requiredCollectionMint: ownership.matchedMint,
          requiredCollectionCheckedAt: ownership.checkedAt,
          nutshellBalance: balance,
        },
        select: protectedUserSelect,
      })
    : existingUser;

  if (user.nutshellBalance !== balance) {
    await syncNutshellBalanceCache(db, user.id, balance);
  }

  if (!ownership.hasAccess) {
    return {
      status: "forbidden",
      user,
      ownership,
    };
  }

  return {
    status: "authorized",
    user,
    ownership,
  };
}
