import { WithdrawalStatus } from "@prisma/client";

export type ProcessingWorkerAction = "stale_recovery" | "resume_payout" | "ignore";

export function classifyProcessingWithdrawalWorkerAction(params: {
  status: WithdrawalStatus;
  jobId: string | null;
  multisigProposalId: string | null;
  solanaTxSignature: string | null;
  solanaTxBlockhash: string | null;
  solanaTxLastValidBlockHeight: bigint | null;
  updatedAt: Date;
  staleCutoff: Date;
}) {
  if (params.status !== WithdrawalStatus.PROCESSING || !params.jobId) {
    return "ignore" satisfies ProcessingWorkerAction;
  }

  const hasFullSubmittedTransaction =
    !!params.solanaTxSignature &&
    !!params.solanaTxBlockhash &&
    params.solanaTxLastValidBlockHeight !== null;

  const hasPartialSubmittedTransaction =
    !!params.solanaTxSignature ||
    !!params.solanaTxBlockhash ||
    params.solanaTxLastValidBlockHeight !== null;

  if (params.multisigProposalId) {
    return "ignore" satisfies ProcessingWorkerAction;
  }

  if (hasFullSubmittedTransaction) {
    return "resume_payout" satisfies ProcessingWorkerAction;
  }

  if (hasPartialSubmittedTransaction) {
    return "ignore" satisfies ProcessingWorkerAction;
  }

  if (params.updatedAt < params.staleCutoff) {
    return "stale_recovery" satisfies ProcessingWorkerAction;
  }

  return "ignore" satisfies ProcessingWorkerAction;
}
