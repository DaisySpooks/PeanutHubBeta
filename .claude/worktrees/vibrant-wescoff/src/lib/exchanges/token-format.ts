export function parseDecimalToFraction(value: string) {
  if (!/^\d+(\.\d+)?$/.test(value)) {
    return null;
  }

  const [wholePart, fractionalPart = ""] = value.split(".");

  return {
    numerator: BigInt(`${wholePart}${fractionalPart}`),
    denominator: BigInt(10) ** BigInt(fractionalPart.length),
  };
}

export function formatTokenAtomicAmount(value: string, decimals: number) {
  if (decimals === 0) {
    return value;
  }

  const normalized = value.replace(/^0+(\d)/, "$1");
  const padded = normalized.padStart(decimals + 1, "0");
  const wholePart = padded.slice(0, -decimals) || "0";
  const fractionPart = padded.slice(-decimals).replace(/0+$/, "");

  return fractionPart ? `${wholePart}.${fractionPart}` : wholePart;
}

export function formatExchangeQuote(nutshellAmount: number, exchangeRate: string, decimals: number) {
  const parsedRate = parseDecimalToFraction(exchangeRate);

  if (!parsedRate) {
    return "0";
  }

  const atomicScale = BigInt(10) ** BigInt(decimals);
  const tokenAmount =
    (BigInt(nutshellAmount) * parsedRate.numerator * atomicScale) / parsedRate.denominator;

  return formatTokenAtomicAmount(tokenAmount.toString(), decimals);
}

export function parseTokenAmountToAtomic(value: string, decimals: number) {
  const normalized = value.trim();

  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    return null;
  }

  const [wholePart, fractionalPart = ""] = normalized.split(".");

  if (fractionalPart.length > decimals) {
    return null;
  }

  const paddedFractionPart = fractionalPart.padEnd(decimals, "0");
  const atomicValue = `${wholePart}${paddedFractionPart}`.replace(/^0+(\d)/, "$1") || "0";

  return BigInt(atomicValue);
}
