export class NutshellIssuanceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NutshellIssuanceValidationError";
  }
}

export class NutshellSupplyCapExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NutshellSupplyCapExceededError";
  }
}

export function planNutshellIssuance(params: {
  amount: number;
  currentIssuedSupply: number;
  cap: number;
  currentUserBalance: number;
}) {
  if (!Number.isInteger(params.amount) || params.amount <= 0) {
    throw new NutshellIssuanceValidationError("Reward amount must be a positive whole number.");
  }

  if (params.currentIssuedSupply + params.amount > params.cap) {
    throw new NutshellSupplyCapExceededError(
      `Issuing ${params.amount.toLocaleString()} Nutshells would exceed the total cap of ${params.cap.toLocaleString()}.`,
    );
  }

  return {
    nextIssuedSupply: params.currentIssuedSupply + params.amount,
    nextUserBalance: params.currentUserBalance + params.amount,
    remainingSupply: params.cap - (params.currentIssuedSupply + params.amount),
  };
}
