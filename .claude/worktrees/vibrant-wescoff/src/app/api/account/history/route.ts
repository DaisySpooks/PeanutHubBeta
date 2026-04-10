import { NextResponse } from "next/server";
import { getAccountHistory } from "@/lib/account-history/queries";
import { getProtectedRouteResult } from "@/lib/nft-gating/require-collection-access";

export async function GET() {
  const result = await getProtectedRouteResult();

  if (result.status === "unauthenticated") {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  if (result.status === "forbidden") {
    return NextResponse.json({ error: "Required collection ownership not found." }, { status: 403 });
  }

  const history = await getAccountHistory(result.user.id);

  return NextResponse.json({
    user: {
      walletAddress: result.user.walletAddress,
    },
    ...history,
  });
}
