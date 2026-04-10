import { headers as nextHeaders } from "next/headers";

export function getClientIpFromHeaders(headers: Headers) {
  const forwardedFor = headers.get("x-forwarded-for");

  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return (
    headers.get("cf-connecting-ip") ??
    headers.get("x-real-ip") ??
    "unknown"
  );
}

function getExpectedOriginFromHeaders(headers: Headers) {
  const forwardedProto = headers.get("x-forwarded-proto");
  const forwardedHost = headers.get("x-forwarded-host");
  const host = forwardedHost ?? headers.get("host");

  if (!host) {
    return null;
  }

  return `${forwardedProto ?? "https"}://${host}`;
}

export function assertTrustedOrigin(request: Request) {
  const expectedOrigin = getExpectedOriginFromHeaders(request.headers);

  if (!expectedOrigin) {
    return;
  }

  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const candidate = origin ?? referer;

  if (!candidate) {
    return;
  }

  let normalizedCandidate: string;

  try {
    normalizedCandidate = new URL(candidate).origin;
  } catch {
    throw new Error("Cross-site request blocked.");
  }

  if (normalizedCandidate !== expectedOrigin) {
    throw new Error("Cross-site request blocked.");
  }
}

export async function getServerActionClientIp() {
  const headerStore = await nextHeaders();
  return getClientIpFromHeaders(new Headers(headerStore));
}
