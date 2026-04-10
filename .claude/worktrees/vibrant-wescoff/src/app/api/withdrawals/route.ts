import { getProtectedRouteResult } from "@/lib/nft-gating/require-collection-access";
import { createWithdrawal } from "@/lib/withdrawals/create-withdrawal";
import { assertTrustedOrigin } from "@/lib/security/request-meta";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { createWithdrawalRouteHandler } from "./route-handler";

export const POST = createWithdrawalRouteHandler({
  getProtectedRouteResult,
  assertTrustedOrigin,
  enforceRateLimit,
  createWithdrawal,
});
