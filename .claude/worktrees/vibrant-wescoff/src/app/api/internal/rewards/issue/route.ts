import { getInternalSettlementActor, isAuthorizedInternalAdminRequest } from "@/lib/internal-auth";
import { issueNutshellReward } from "@/lib/rewards/issue-nutshells";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { getClientIpFromHeaders } from "@/lib/security/request-meta";
import { runInternalRewardsIssueRoute } from "./route-handler";

export async function POST(request: Request) {
  return runInternalRewardsIssueRoute({
    request,
    deps: {
      isAuthorizedInternalAdminRequest,
      getInternalSettlementActor,
      getClientIpFromHeaders,
      enforceRateLimit,
      issueNutshellReward,
    },
  });
}
