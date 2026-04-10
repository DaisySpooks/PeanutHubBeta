import { parseWithdrawalRequestedAmountAtomic } from "@/lib/withdrawals/withdrawal-entry-request";
import { WithdrawalValidationError } from "@/lib/withdrawals/withdrawal-validation-error";

export function resolveWithdrawalPreviewAmountAtomic(params: {
  requestedAmount?: string;
  peanutTokenDecimals: number;
  eligibility: {
    isUnlocked: boolean;
    remainingAmount: bigint;
    canWithdraw: boolean;
  };
}) {
  const normalizedAmount = params.requestedAmount?.trim() ?? "";

  if (normalizedAmount.length === 0) {
    if (!params.eligibility.isUnlocked) {
      throw new WithdrawalValidationError("This vesting position is still locked.");
    }

    if (!params.eligibility.canWithdraw) {
      throw new WithdrawalValidationError("No withdrawable amount remains on this vesting position.");
    }

    return params.eligibility.remainingAmount;
  }

  return parseWithdrawalRequestedAmountAtomic({
    requestedAmount: normalizedAmount,
    peanutTokenDecimals: params.peanutTokenDecimals,
  });
}
