import { NextResponse } from "next/server";
import { z } from "zod";
import { createAuthChallenge, getNonceCookieOptions, AUTH_NONCE_COOKIE_NAME } from "@/lib/auth/session";
import { assertValidWalletAddress } from "@/lib/auth/solana";
import { getClientIpFromHeaders, assertTrustedOrigin } from "@/lib/security/request-meta";
import { enforceRateLimit, RateLimitError } from "@/lib/security/rate-limit";

const challengeSchema = z.object({
  walletAddress: z.string().min(32),
});

export async function POST(request: Request) {
  try {
    assertTrustedOrigin(request);
    const clientIp = getClientIpFromHeaders(request.headers);
    await enforceRateLimit({
      key: `auth-challenge:${clientIp}`,
      limit: 15,
      windowMs: 60_000,
    });

    const body = challengeSchema.parse(await request.json());
    const publicKey = assertValidWalletAddress(body.walletAddress);
    const challenge = createAuthChallenge(publicKey.toBase58());

    const response = NextResponse.json({
      message: challenge.message,
      nonce: challenge.nonce,
      issuedAt: challenge.issuedAt,
      walletAddress: challenge.walletAddress,
    });

    response.cookies.set(AUTH_NONCE_COOKIE_NAME, challenge.nonce, getNonceCookieOptions());

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

    return NextResponse.json({ error: "Unable to create auth challenge." }, { status: 400 });
  }
}
