import bs58 from "bs58";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { buildAuthMessage, createSessionToken, getSessionCookieOptions, AUTH_NONCE_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { verifyWalletSignature } from "@/lib/auth/solana";
import { db } from "@/lib/db";
import { checkRequiredCollectionOwnership } from "@/lib/nft-gating/check-required-collection";
import { getDerivedNutshellBalance } from "@/lib/rewards/nutshell-balance";
import { assertTrustedOrigin, getClientIpFromHeaders } from "@/lib/security/request-meta";
import { enforceRateLimit, RateLimitError } from "@/lib/security/rate-limit";

const verifySchema = z.object({
  walletAddress: z.string().min(32),
  signature: z.string().min(1),
  nonce: z.string().uuid(),
  issuedAt: z.string().datetime(),
});

const CHALLENGE_WINDOW_MS = 1000 * 60 * 5;

export async function POST(request: Request) {
  try {
    assertTrustedOrigin(request);
    const body = verifySchema.parse(await request.json());
    const clientIp = getClientIpFromHeaders(request.headers);
    await enforceRateLimit({
      key: `auth-verify:${clientIp}:${body.walletAddress}`,
      limit: 10,
      windowMs: 60_000,
    });
    const cookieStore = await cookies();
    const cookieNonce = cookieStore.get(AUTH_NONCE_COOKIE_NAME)?.value;

    if (!cookieNonce || cookieNonce !== body.nonce) {
      return NextResponse.json({ error: "Authentication challenge has expired." }, { status: 401 });
    }

    const issuedAtMs = Date.parse(body.issuedAt);
    if (Number.isNaN(issuedAtMs) || Date.now() - issuedAtMs > CHALLENGE_WINDOW_MS) {
      return NextResponse.json({ error: "Authentication challenge is too old. Please try again." }, { status: 401 });
    }

    const message = buildAuthMessage({
      walletAddress: body.walletAddress,
      nonce: body.nonce,
      issuedAt: body.issuedAt,
    });

    const signature = bs58.decode(body.signature);
    const isValid = verifyWalletSignature({
      walletAddress: body.walletAddress,
      message,
      signature,
    });

    if (!isValid) {
      return NextResponse.json({ error: "Wallet signature verification failed." }, { status: 401 });
    }

    const ownership = await checkRequiredCollectionOwnership(body.walletAddress);

    const userRecord = await db.user.upsert({
      where: { walletAddress: body.walletAddress },
      update: {
        lastSeenAt: new Date(),
        isActive: true,
        hasRequiredCollectionAccess: ownership.hasAccess,
        requiredCollectionMint: ownership.matchedMint,
        requiredCollectionCheckedAt: new Date(),
      },
      create: {
        walletAddress: body.walletAddress,
        lastSeenAt: new Date(),
        hasRequiredCollectionAccess: ownership.hasAccess,
        requiredCollectionMint: ownership.matchedMint,
        requiredCollectionCheckedAt: new Date(),
      },
      select: {
        id: true,
        walletAddress: true,
        hasRequiredCollectionAccess: true,
        requiredCollectionMint: true,
      },
    });

    const nutshellBalance = await getDerivedNutshellBalance(db, userRecord.id);

    const user =
      nutshellBalance === 0
        ? {
            ...userRecord,
            nutshellBalance,
          }
        : await db.user.update({
            where: { id: userRecord.id },
            data: {
              nutshellBalance,
            },
            select: {
              id: true,
              walletAddress: true,
              nutshellBalance: true,
              hasRequiredCollectionAccess: true,
              requiredCollectionMint: true,
            },
          });

    const token = await createSessionToken({ walletAddress: user.walletAddress });
    const response = NextResponse.json({
      token,
      user,
      access: {
        hasRequiredCollectionAccess: ownership.hasAccess,
        requiredCollectionMint: ownership.matchedMint,
      },
    });

    response.cookies.set(SESSION_COOKIE_NAME, token, getSessionCookieOptions());
    response.cookies.delete(AUTH_NONCE_COOKIE_NAME);

    return response;
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json(
        { error: error.message },
        {
          status: 429,
          headers: {
            "Retry-After": String(error.retryAfterSeconds),
          },
        },
      );
    }

    if (error instanceof Error && error.message === "Cross-site request blocked.") {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return NextResponse.json({ error: "Unable to verify wallet signature." }, { status: 400 });
  }
}
