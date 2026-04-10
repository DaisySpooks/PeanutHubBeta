import { parseTokenAmountToAtomic } from "@/lib/exchanges/token-format";
import { WithdrawalValidationError } from "@/lib/withdrawals/withdrawal-validation-error";

export function assertWithdrawalsEnabled(withdrawalsEnabled: boolean) {
  if (!withdrawalsEnabled) {
    throw new WithdrawalValidationError("Withdrawals are currently disabled by system configuration.");
  }
}

export function parseWithdrawalRequestedAmountAtomic(params: {
  requestedAmount: string;
  peanutTokenDecimals: number;
}) {
  const atomicAmount = parseTokenAmountToAtomic(params.requestedAmount, params.peanutTokenDecimals);

  if (atomicAmount === null || atomicAmount <= BigInt(0)) {
    throw new WithdrawalValidationError("Enter a valid withdrawal amount.");
  }

  return atomicAmount;
}
