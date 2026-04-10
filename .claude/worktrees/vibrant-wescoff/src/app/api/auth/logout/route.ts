import { NextResponse } from "next/server";
import { AUTH_NONCE_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/lib/auth/session";

export async function POST() {
  const response = NextResponse.json({ ok: true });

  response.cookies.delete(SESSION_COOKIE_NAME);
  response.cookies.delete(AUTH_NONCE_COOKIE_NAME);

  return response;
}
