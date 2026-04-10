import { WithdrawalStatus } from "@prisma/client";

export async function completeProcessingSettlementTransition(params: {
  withdrawalId: string;
  currentStatus: WithdrawalStatus;
  currentJobId: string | null;
  expectedJobId: string;
  solanaTxSignature: string;
  solanaConfirmedAt: Date;
  triggeredBy: string;
  updateCompletion: () => Promise<number>;
  recordTransitionAudit: () => Promise<void>;
  createError: (message: string) => Error;
}) {
  if (params.currentStatus !== WithdrawalStatus.PROCESSING) {
    throw params.createError(
      `Withdrawal ${params.withdrawalId} cannot move to COMPLETED from ${params.currentStatus}.`,
    );
  }

  if (params.currentJobId !== params.expectedJobId) {
    throw params.createError(
      `Withdrawal ${params.withdrawalId} is owned by a different processing job.`,
    );
  }

  const updatedCount = await params.updateCompletion();

  if (updatedCount !== 1) {
    throw params.createError(
      `Withdrawal ${params.withdrawalId} could not be completed because its processing claim changed.`,
    );
  }

  await params.recordTransitionAudit();

  return {
    id: params.withdrawalId,
    status: WithdrawalStatus.COMPLETED,
    jobId: params.expectedJobId,
    solanaTxSignature: params.solanaTxSignature,
    solanaConfirmedAt: params.solanaConfirmedAt.toISOString(),
  };
}
