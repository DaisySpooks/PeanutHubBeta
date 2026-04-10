import { type VestingStatus, WithdrawalStatus } from "@prisma/client";
import { getDerivedVestingStatus } from "../vesting/status";

export async function requeueFailedWithdrawal(params: {
  withdrawalId: string;
  currentStatus: WithdrawalStatus;
  solanaTxSignature: string | null;
  submittedTxSignature: string | null;
  grossAmount: bigint;
  currentVestingStatus: VestingStatus;
  unlockAt: Date;
  totalAmount: bigint;
  withdrawnAmount: bigint;
  resetWithdrawal: () => Promise<number>;
  updateVesting: (params: { nextWithdrawnAmount: bigint; nextStatus: VestingStatus }) => Promise<void>;
  recordTransitionAudit: () => Promise<void>;
  createError: (message: string) => Error;
}) {
  if (params.currentStatus !== WithdrawalStatus.FAILED) {
    throw params.createError(
      `Withdrawal ${params.withdrawalId} cannot be retried from ${params.currentStatus}.`,
    );
  }

  if (params.solanaTxSignature) {
    throw params.createError(
      `Withdrawal ${params.withdrawalId} already has a submitted payout and cannot be retried automatically.`,
    );
  }

  const availableAmount = params.totalAmount - params.withdrawnAmount;

  if (availableAmount < params.grossAmount) {
    throw params.createError(
      `Withdrawal ${params.withdrawalId} cannot be retried because the vesting position no longer has enough available balance.`,
    );
  }

  const nextWithdrawnAmount = params.withdrawnAmount + params.grossAmount;
  const nextStatus = getDerivedVestingStatus({
    currentStatus: params.currentVestingStatus,
    unlockAt: params.unlockAt,
    totalAmount: params.totalAmount,
    withdrawnAmount: nextWithdrawnAmount,
  });

  await params.updateVesting({
    nextWithdrawnAmount,
    nextStatus,
  });

  const updatedCount = await params.resetWithdrawal();

  if (updatedCount !== 1) {
    throw params.createError(
      `Withdrawal ${params.withdrawalId} could not be requeued because its state changed.`,
    );
  }

  await params.recordTransitionAudit();

  return {
    id: params.withdrawalId,
    status: WithdrawalStatus.PENDING,
  };
}
