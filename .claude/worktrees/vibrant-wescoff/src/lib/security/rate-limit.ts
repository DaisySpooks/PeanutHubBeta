import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export class RateLimitError extends Error {
  constructor(
    message: string,
    public readonly retryAfterSeconds: number,
  ) {
    super(message);
    this.name = "RateLimitError";
  }
}

export async function enforceRateLimit(params: {
  key: string;
  limit: number;
  windowMs: number;
}) {
  const now = new Date();
  const windowMs = Math.max(1_000, params.windowMs);
  const expiresAt = new Date(now.getTime() + windowMs);

  const result = await db.$transaction(async (tx) => {
    const bucket = await tx.rateLimitBucket.findUnique({
      where: {
        key: params.key,
      },
    });

    if (!bucket || bucket.expiresAt.getTime() <= now.getTime()) {
      await tx.rateLimitBucket.upsert({
        where: {
          key: params.key,
        },
        update: {
          count: 1,
          windowStartedAt: now,
          expiresAt,
        },
        create: {
          key: params.key,
          count: 1,
          windowStartedAt: now,
          expiresAt,
        },
      });

      return {
        allowed: true,
        retryAfterSeconds: Math.ceil(windowMs / 1000),
      };
    }

    if (bucket.count >= params.limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((bucket.expiresAt.getTime() - now.getTime()) / 1000),
        ),
      };
    }

    await tx.rateLimitBucket.update({
      where: {
        key: params.key,
      },
      data: {
        count: {
          increment: 1,
        },
      },
    });

    return {
      allowed: true,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((bucket.expiresAt.getTime() - now.getTime()) / 1000),
      ),
    };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  if (!result.allowed) {
    throw new RateLimitError("Too many requests. Please slow down and try again shortly.", result.retryAfterSeconds);
  }

  return result;
}
