import { WithdrawalStatus } from "@prisma/client";

export async function recoverStaleProcessingTransition(params: {
  withdrawalId: string;
  currentStatus: WithdrawalStatus;
  currentJobId: string | null;
  expectedJobId: string;
  solanaTxSignature: string | null;
  reason: string;
  updateRecovery: () => Promise<number>;
  recordTransitionAudit: () => Promise<void>;
  createError: (message: string) => Error;
}) {
  if (params.currentStatus !== WithdrawalStatus.PROCESSING) {
    throw params.createError(
      `Withdrawal ${params.withdrawalId} cannot be recovered from ${params.currentStatus}.`,
    );
  }

  if (params.currentJobId !== params.expectedJobId) {
    throw params.createError(
      `Withdrawal ${params.withdrawalId} is owned by a different processing job.`,
    );
  }

  if (params.solanaTxSignature) {
    throw params.createError(
      `Withdrawal ${params.withdrawalId} already has a submitted payout and cannot be reset to PENDING.`,
    );
  }

  const updatedCount = await params.updateRecovery();

  if (updatedCount !== 1) {
    throw params.createError(
      `Withdrawal ${params.withdrawalId} could not be recovered because its processing claim changed.`,
    );
  }

  await params.recordTransitionAudit();

  return {
    id: params.withdrawalId,
    status: WithdrawalStatus.PENDING,
  };
}
