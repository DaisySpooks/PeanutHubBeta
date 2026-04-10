import "server-only";

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { serverEnv } from "@/lib/config/server-env";

export const INTERNAL_ADMIN_SESSION_COOKIE_NAME = "peanut-bank-internal-admin";

function timingSafeEqualString(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

const internalAdminSecret = new TextEncoder().encode(serverEnv.JWT_SECRET);

export function getInternalSettlementActor() {
  return serverEnv.INTERNAL_ADMIN_ACTOR_NAME;
}

export function isValidInternalAdminKey(providedKey: string) {
  if (!serverEnv.INTERNAL_ADMIN_API_KEY) {
    return false;
  }

  return timingSafeEqualString(providedKey, serverEnv.INTERNAL_ADMIN_API_KEY);
}

export function isAuthorizedInternalAdminRequest(request: Request) {
  const providedKey = request.headers.get("x-internal-admin-key");

  if (!providedKey) {
    return false;
  }

  return isValidInternalAdminKey(providedKey);
}

export async function createInternalAdminSessionToken(actor: string) {
  return new SignJWT({ role: "internal_admin", actor })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(actor)
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(internalAdminSecret);
}

export async function verifyInternalAdminSessionToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, internalAdminSecret);

    if (payload.role !== "internal_admin") {
      return null;
    }

    const actor = typeof payload.actor === "string" ? payload.actor : payload.sub;

    if (!actor) {
      return null;
    }

    return {
      actor,
      role: "internal_admin" as const,
    };
  } catch {
    return null;
  }
}

export async function getInternalAdminSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(INTERNAL_ADMIN_SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  return verifyInternalAdminSessionToken(token);
}

export async function getAuthorizedInternalAdminActor(request: Request) {
  if (isAuthorizedInternalAdminRequest(request)) {
    return getInternalSettlementActor();
  }

  const session = await getInternalAdminSession();
  return session?.actor ?? null;
}

export function getInternalAdminCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  };
}
