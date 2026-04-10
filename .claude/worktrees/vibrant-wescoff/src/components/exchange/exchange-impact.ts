export function getExchangeImpact(params: {
  nutshellBalance: number;
  parsedNutshellAmount: number;
}) {
  if (!Number.isInteger(params.parsedNutshellAmount) || params.parsedNutshellAmount <= 0) {
    return null;
  }

  const requestedAmount = params.parsedNutshellAmount;
  const remainingBalance = params.nutshellBalance - requestedAmount;

  return {
    requestedAmount,
    remainingBalance,
    exceedsBalance: remainingBalance < 0,
  };
}
