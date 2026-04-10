import "server-only";

import { db } from "@/lib/db";

function truncateDetails(detailsJson?: string | null) {
  if (!detailsJson) {
    return null;
  }

  return detailsJson.slice(0, 10_000);
}

export async function recordWithdrawalPayoutEvent(params: {
  withdrawalId: string;
  eventType: string;
  triggeredBy: string;
  proposalId?: string | null;
  txSignature?: string | null;
  detailsJson?: string | null;
}) {
  await db.withdrawalPayoutEvent.create({
    data: {
      withdrawalId: params.withdrawalId,
      eventType: params.eventType,
      triggeredBy: params.triggeredBy,
      proposalId: params.proposalId ?? null,
      txSignature: params.txSignature ?? null,
      detailsJson: truncateDetails(params.detailsJson),
    },
  });
}
