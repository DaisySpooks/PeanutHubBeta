import { db } from "../db";

function truncateMessage(message?: string | null) {
  if (!message) {
    return null;
  }

  return message.slice(0, 1_000);
}

export async function logWithdrawalPayoutAttempt(params: {
  withdrawalId: string;
  actor: string;
  jobId?: string | null;
  attemptNumber?: number;
  eventType: string;
  message?: string | null;
  solanaTxSignature?: string | null;
}) {
  await db.withdrawalPayoutAttempt.create({
    data: {
      withdrawalId: params.withdrawalId,
      actor: params.actor,
      jobId: params.jobId ?? null,
      attemptNumber: params.attemptNumber,
      eventType: params.eventType,
      message: truncateMessage(params.message),
      solanaTxSignature: params.solanaTxSignature ?? null,
    },
  });
}
