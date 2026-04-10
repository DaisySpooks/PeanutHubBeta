import { type VestingStatus } from "@prisma/client";
import { getDerivedVestingStatus } from "../vesting/status";

export class WithdrawalSettlementRollbackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WithdrawalSettlementRollbackError";
  }
}

export function deriveSettlementRollback(params: {
  currentStatus: VestingStatus;
  unlockAt: Date;
  totalAmount: bigint;
  withdrawnAmount: bigint;
  rollbackAmount: bigint;
}) {
  const nextWithdrawnAmount = params.withdrawnAmount - params.rollbackAmount;

  if (nextWithdrawnAmount < BigInt(0)) {
    throw new WithdrawalSettlementRollbackError(
      "Withdrawal reservation rollback would make withdrawnAmount negative.",
    );
  }

  const nextStatus = getDerivedVestingStatus({
    currentStatus: params.currentStatus,
    unlockAt: params.unlockAt,
    totalAmount: params.totalAmount,
    withdrawnAmount: nextWithdrawnAmount,
  });

  return {
    nextWithdrawnAmount,
    nextStatus,
  };
}
