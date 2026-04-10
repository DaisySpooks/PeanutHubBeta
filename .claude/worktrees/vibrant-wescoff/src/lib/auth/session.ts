import "server-only";

import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { serverEnv } from "@/lib/config/server-env";

export const SESSION_COOKIE_NAME = "peanut-bank-session";
export const AUTH_NONCE_COOKIE_NAME = "peanut-bank-auth-nonce";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const AUTH_NONCE_MAX_AGE_SECONDS = 60 * 5;

const secret = new TextEncoder().encode(serverEnv.JWT_SECRET);

type SessionPayload = {
  walletAddress: string;
};

type AuthChallenge = {
  walletAddress: string;
  nonce: string;
  issuedAt: string;
};

export function createAuthChallenge(walletAddress: string) {
  const nonce = crypto.randomUUID();
  const issuedAt = new Date().toISOString();

  return {
    walletAddress,
    nonce,
    issuedAt,
    message: buildAuthMessage({ walletAddress, nonce, issuedAt }),
  };
}

export function buildAuthMessage({ walletAddress, nonce, issuedAt }: AuthChallenge) {
  return [
    serverEnv.WALLET_AUTH_MESSAGE,
    "",
    `Wallet: ${walletAddress}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");
}

export async function createSessionToken(payload: SessionPayload) {
  return new SignJWT({ walletAddress: payload.walletAddress })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.walletAddress)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secret);
}

export async function verifySessionToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, secret);
    const walletAddress = typeof payload.walletAddress === "string" ? payload.walletAddress : payload.sub;

    if (!walletAddress) {
      return null;
    }

    return { walletAddress };
  } catch {
    return null;
  }
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  return verifySessionToken(token);
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

export function getNonceCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: AUTH_NONCE_MAX_AGE_SECONDS,
  };
}
