import { WithdrawalValidationError } from "@/lib/withdrawals/withdrawal-validation-error";

export function assertWithdrawalEntryVestingAccess<T extends { walletAddress: string } | null>(params: {
  vestingPosition: T;
  actorWalletAddress: string;
}): NonNullable<T> {
  if (!params.vestingPosition) {
    throw new WithdrawalValidationError("Vesting position not found for this account.");
  }

  if (params.vestingPosition.walletAddress !== params.actorWalletAddress) {
    throw new WithdrawalValidationError("Vesting position does not belong to this wallet.");
  }

  return params.vestingPosition;
}

export function assertWithdrawalEntryEligibility(params: {
  requestedAmountAtomic: bigint;
  eligibility: {
    isUnlocked: boolean;
    remainingAmount: bigint;
    canWithdraw: boolean;
  };
}) {
  if (!params.eligibility.isUnlocked) {
    throw new WithdrawalValidationError("This vesting position is still locked.");
  }

  if (!params.eligibility.canWithdraw) {
    throw new WithdrawalValidationError("No withdrawable amount remains on this vesting position.");
  }

  if (params.requestedAmountAtomic > params.eligibility.remainingAmount) {
    throw new WithdrawalValidationError("Requested amount exceeds the remaining vested balance.");
  }
}
