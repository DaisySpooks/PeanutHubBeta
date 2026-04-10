import { VestingStatus } from "@prisma/client";

export function getRemainingVestedAmount(totalAmount: bigint, withdrawnAmount: bigint) {
  const remainingAmount = totalAmount - withdrawnAmount;
  return remainingAmount > BigInt(0) ? remainingAmount : BigInt(0);
}

export function getDerivedVestingStatus({
  currentStatus,
  unlockAt,
  totalAmount,
  withdrawnAmount,
  now = new Date(),
}: {
  currentStatus: VestingStatus;
  unlockAt: Date;
  totalAmount: bigint;
  withdrawnAmount: bigint;
  now?: Date;
}) {
  const remainingAmount = getRemainingVestedAmount(totalAmount, withdrawnAmount);

  if (remainingAmount === BigInt(0)) {
    return VestingStatus.FULLY_WITHDRAWN;
  }

  if (unlockAt.getTime() <= now.getTime()) {
    return VestingStatus.UNLOCKED;
  }

  return currentStatus === VestingStatus.FULLY_WITHDRAWN ? VestingStatus.LOCKED : currentStatus;
}

export function getWithdrawalEligibility({
  unlockAt,
  totalAmount,
  withdrawnAmount,
  now = new Date(),
}: {
  unlockAt: Date;
  totalAmount: bigint;
  withdrawnAmount: bigint;
  now?: Date;
}) {
  const remainingAmount = getRemainingVestedAmount(totalAmount, withdrawnAmount);
  const isUnlocked = unlockAt.getTime() <= now.getTime();

  return {
    isUnlocked,
    remainingAmount,
    canWithdraw: isUnlocked && remainingAmount > BigInt(0),
  };
}
