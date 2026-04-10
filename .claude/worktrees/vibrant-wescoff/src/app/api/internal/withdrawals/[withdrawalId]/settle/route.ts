import { getInternalSettlementActor, isAuthorizedInternalAdminRequest } from "@/lib/internal-auth";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { getClientIpFromHeaders } from "@/lib/security/request-meta";
import { isMultisigPayoutEnabled } from "@/lib/withdrawals/multisig-runtime";
import {
  beginWithdrawalProcessing,
  completeWithdrawalProcessing,
  failWithdrawalProcessing,
} from "@/lib/withdrawals/settlement";
import { confirmStoredWithdrawalPayout } from "@/lib/withdrawals/solana-payout";
import { logWithdrawalPayoutAttempt } from "@/lib/withdrawals/payout-attempts";
import {
  reconcileAwaitingSignaturesWithdrawal,
  reconcileSubmittedWithdrawal,
} from "@/lib/withdrawals/multisig-flow";
import { runInternalSettlementRoute } from "./route-handler";

type RouteContext = {
  params: Promise<{
    withdrawalId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { withdrawalId } = await context.params;
  return runInternalSettlementRoute({
    request,
    withdrawalId,
    deps: {
      isAuthorizedInternalAdminRequest,
      getInternalSettlementActor,
      getClientIpFromHeaders,
      enforceRateLimit,
      beginWithdrawalProcessing,
      confirmStoredWithdrawalPayout,
      completeWithdrawalProcessing,
      failWithdrawalProcessing,
      isMultisigPayoutEnabled,
      reconcileAwaitingSignaturesWithdrawal,
      reconcileSubmittedWithdrawal,
      logWithdrawalPayoutAttempt,
    },
  });
}
