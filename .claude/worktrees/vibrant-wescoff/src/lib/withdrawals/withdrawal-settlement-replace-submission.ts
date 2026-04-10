import { WithdrawalStatus } from "@prisma/client";

export async function replaceProcessingSubmissionRecord(params: {
  withdrawalId: string;
  currentStatus: WithdrawalStatus;
  currentJobId: string | null;
  expectedJobId: string;
  currentSolanaTxSignature: string | null;
  previousSolanaTxSignature: string;
  nextSolanaTxSignature: string;
  nextSolanaTxBlockhash: string;
  nextSolanaTxLastValidBlockHeight: bigint;
  updateReplacement: () => Promise<number>;
  createError: (message: string) => Error;
}) {
  if (params.currentStatus !== WithdrawalStatus.PROCESSING) {
    throw params.createError(
      `Withdrawal ${params.withdrawalId} cannot replace a payout submission from ${params.currentStatus}.`,
    );
  }

  if (params.currentJobId !== params.expectedJobId) {
    throw params.createError(
      `Withdrawal ${params.withdrawalId} is owned by a different processing job.`,
    );
  }

  if (params.currentSolanaTxSignature !== params.previousSolanaTxSignature) {
    throw params.createError(
      `Withdrawal ${params.withdrawalId} no longer has the expected submitted Solana transaction.`,
    );
  }

  const updatedCount = await params.updateReplacement();

  if (updatedCount !== 1) {
    throw params.createError(
      `Withdrawal ${params.withdrawalId} could not replace its payout submission because its processing claim changed.`,
    );
  }

  return {
    id: params.withdrawalId,
    solanaTxSignature: params.nextSolanaTxSignature,
    solanaTxBlockhash: params.nextSolanaTxBlockhash,
    solanaTxLastValidBlockHeight: params.nextSolanaTxLastValidBlockHeight.toString(),
  };
}
