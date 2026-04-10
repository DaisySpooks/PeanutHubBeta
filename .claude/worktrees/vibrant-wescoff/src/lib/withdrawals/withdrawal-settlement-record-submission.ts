import { WithdrawalStatus } from "@prisma/client";

export async function recordProcessingSubmission(params: {
  withdrawalId: string;
  currentStatus: WithdrawalStatus;
  currentJobId: string | null;
  expectedJobId: string;
  currentSolanaTxSignature: string | null;
  currentSolanaTxBlockhash: string | null;
  currentSolanaTxLastValidBlockHeight: bigint | null;
  solanaTxSignature: string;
  solanaTxBlockhash: string;
  solanaTxLastValidBlockHeight: bigint;
  updateSubmission: () => Promise<number>;
  createError: (message: string) => Error;
}) {
  if (params.currentStatus !== WithdrawalStatus.PROCESSING) {
    throw params.createError(
      `Withdrawal ${params.withdrawalId} cannot record a payout submission from ${params.currentStatus}.`,
    );
  }

  if (params.currentJobId !== params.expectedJobId) {
    throw params.createError(
      `Withdrawal ${params.withdrawalId} is owned by a different processing job.`,
    );
  }

  if (params.currentSolanaTxSignature) {
    if (
      params.currentSolanaTxSignature === params.solanaTxSignature &&
      params.currentSolanaTxBlockhash === params.solanaTxBlockhash &&
      params.currentSolanaTxLastValidBlockHeight === params.solanaTxLastValidBlockHeight
    ) {
      return {
        id: params.withdrawalId,
        solanaTxSignature: params.solanaTxSignature,
        solanaTxBlockhash: params.solanaTxBlockhash,
        solanaTxLastValidBlockHeight: params.solanaTxLastValidBlockHeight.toString(),
      };
    }

    throw params.createError(
      `Withdrawal ${params.withdrawalId} already has a different submitted Solana transaction.`,
    );
  }

  const updatedCount = await params.updateSubmission();

  if (updatedCount !== 1) {
    throw params.createError(
      `Withdrawal ${params.withdrawalId} could not persist its payout submission because its processing claim changed.`,
    );
  }

  return {
    id: params.withdrawalId,
    solanaTxSignature: params.solanaTxSignature,
    solanaTxBlockhash: params.solanaTxBlockhash,
    solanaTxLastValidBlockHeight: params.solanaTxLastValidBlockHeight.toString(),
  };
}
