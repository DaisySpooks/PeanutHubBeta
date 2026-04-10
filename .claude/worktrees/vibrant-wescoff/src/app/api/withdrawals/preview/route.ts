import { getProtectedRouteResult } from "@/lib/nft-gating/require-collection-access";
import { getWithdrawalPreview } from "@/lib/withdrawals/preview-withdrawal";
import { assertTrustedOrigin } from "@/lib/security/request-meta";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { createWithdrawalPreviewRouteHandler } from "./route-handler";

export const POST = createWithdrawalPreviewRouteHandler({
  getProtectedRouteResult,
  assertTrustedOrigin,
  enforceRateLimit,
  getWithdrawalPreview,
});
