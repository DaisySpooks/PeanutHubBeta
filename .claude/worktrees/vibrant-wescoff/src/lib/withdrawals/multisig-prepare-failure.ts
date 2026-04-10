import { SquadsSourceAccountPreflightError } from "./squads-source-account-preflight";
import { MultisigPreparationHashMismatchError } from "./multisig-prepare-success";

function describePreparationFailure(error: unknown) {
  if (error instanceof SquadsSourceAccountPreflightError) {
    return {
      errorMessage: error.message,
      errorName: error.name,
      errorCategory: "source_account_preflight",
      preflight: error.context,
    };
  }

  if (error instanceof MultisigPreparationHashMismatchError) {
    return {
      errorMessage: error.message,
      errorName: error.name,
      errorCategory: "prepared_instruction_hash_mismatch",
      preflight: null,
    };
  }

  if (error instanceof Error) {
    return {
      errorMessage: error.message,
      errorName: error.name,
      errorCategory: "preparation_runtime",
      preflight: null,
    };
  }

  return {
    errorMessage: "Unknown multisig preparation error.",
    errorName: "UnknownError",
    errorCategory: "unknown",
    preflight: null,
  };
}

export async function recordPrepareMultisigWithdrawalFailure(params: {
  withdrawalId: string;
  actor: string;
  payoutReference: string;
  preparedInstructionHash: string;
  recipientWalletAddress: string;
  mintAddress: string;
  netAmountAtomic: bigint;
  error: unknown;
  recordAttempt: (params: {
    withdrawalId: string;
    attemptType: string;
    result: string;
    errorMessage?: string | null;
    detailsJson?: string | null;
  }) => Promise<unknown>;
  recordEvent: (params: {
    withdrawalId: string;
    eventType: string;
    triggeredBy: string;
    detailsJson?: string | null;
  }) => Promise<unknown>;
}) {
  const described = describePreparationFailure(params.error);

  await params.recordAttempt({
    withdrawalId: params.withdrawalId,
    attemptType: "proposal_prepare",
    result: "failed",
    errorMessage: described.errorMessage,
    detailsJson: JSON.stringify({
      payoutReference: params.payoutReference,
      preparedInstructionHash: params.preparedInstructionHash,
      recipientWalletAddress: params.recipientWalletAddress,
      mintAddress: params.mintAddress,
      netAmountAtomic: params.netAmountAtomic.toString(),
      errorMessage: described.errorMessage,
      errorName: described.errorName,
      errorCategory: described.errorCategory,
      preflight: described.preflight,
    }),
  });

  await params.recordEvent({
    withdrawalId: params.withdrawalId,
    eventType: "proposal-prepare-failed",
    triggeredBy: params.actor,
    detailsJson: JSON.stringify({
      payoutReference: params.payoutReference,
      preparedInstructionHash: params.preparedInstructionHash,
      errorMessage: described.errorMessage,
      errorName: described.errorName,
      errorCategory: described.errorCategory,
      preflight: described.preflight,
    }),
  });
}
