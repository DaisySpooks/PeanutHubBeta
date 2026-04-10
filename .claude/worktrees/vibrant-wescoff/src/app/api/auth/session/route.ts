import { NextResponse } from "next/server";
import { getProtectedRouteResult } from "@/lib/nft-gating/require-collection-access";

export async function GET() {
  const result = await getProtectedRouteResult();

  if (result.status === "unauthenticated") {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  if (result.status === "forbidden") {
    return NextResponse.json(
      {
        authenticated: true,
        hasAccess: false,
        user: result.user,
      },
      { status: 403 },
    );
  }

  return NextResponse.json({
    authenticated: true,
    hasAccess: true,
    user: result.user,
  });
}
