type WithdrawalReadinessParams = {
  unlockAt: string;
  canWithdraw: boolean;
  isUnlocked: boolean;
  remainingAmount: string;
};

export function getWithdrawalReadinessSummary(params: WithdrawalReadinessParams) {
  const remainingAmount = BigInt(params.remainingAmount);
  const unlockAt = new Date(params.unlockAt);
  const now = new Date();
  const msUntilUnlock = unlockAt.getTime() - now.getTime();
  const daysUntilUnlock = Math.ceil(msUntilUnlock / (1000 * 60 * 60 * 24));

  if (params.canWithdraw) {
    return {
      tone: "ready" as const,
      title: "Ready for withdrawal",
      detail: "This vested balance is unlocked and can be withdrawn now.",
      badge: "Withdrawable",
    };
  }

  if (params.isUnlocked && remainingAmount === BigInt(0)) {
    return {
      tone: "complete" as const,
      title: "No balance remaining",
      detail: "This vesting position has already been fully used or withdrawn.",
      badge: "Fully used",
    };
  }

  if (daysUntilUnlock <= 7) {
    return {
      tone: "soon" as const,
      title: "Unlocking soon",
      detail: `This balance is still locked, but the unlock date is approaching on ${unlockAt.toLocaleDateString()}.`,
      badge: "Unlocking soon",
    };
  }

  return {
    tone: "locked" as const,
    title: "Still locked",
    detail: `This balance is not yet available to withdraw. Current unlock date: ${unlockAt.toLocaleDateString()}.`,
    badge: "Locked",
  };
}
