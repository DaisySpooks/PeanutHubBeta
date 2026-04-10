"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  createInternalAdminSessionToken,
  getInternalAdminCookieOptions,
  INTERNAL_ADMIN_SESSION_COOKIE_NAME,
  isValidInternalAdminKey,
} from "@/lib/internal-auth";
import { serverEnv } from "@/lib/config/server-env";
import { getServerActionClientIp } from "@/lib/security/request-meta";
import { enforceRateLimit, RateLimitError } from "@/lib/security/rate-limit";

export async function loginInternalAdminAction(formData: FormData) {
  const adminKey = String(formData.get("adminKey") ?? "");
  const clientIp = await getServerActionClientIp();

  try {
    await enforceRateLimit({
      key: `internal-admin-login:${clientIp}`,
      limit: 5,
      windowMs: 60_000,
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      redirect("/internal/admin/login?error=rate-limited");
    }

    redirect("/internal/admin/login?error=invalid-key");
  }

  if (!isValidInternalAdminKey(adminKey)) {
    redirect("/internal/admin/login?error=invalid-key");
  }

  const token = await createInternalAdminSessionToken(serverEnv.INTERNAL_ADMIN_ACTOR_NAME);
  const cookieStore = await cookies();

  cookieStore.set(INTERNAL_ADMIN_SESSION_COOKIE_NAME, token, getInternalAdminCookieOptions());

  redirect("/internal/admin/settlements");
}

export async function logoutInternalAdminAction() {
  const cookieStore = await cookies();
  cookieStore.delete(INTERNAL_ADMIN_SESSION_COOKIE_NAME);

  redirect("/internal/admin/login");
}
