import bs58 from "bs58";
import { Keypair } from "@solana/web3.js";

export const STREAMFLOW_TOKEN_ACCOUNT_RENT_SPACE = 165;
export const STREAMFLOW_SETUP_FEE_BUFFER_LAMPORTS = BigInt(50_000);

export function parseStreamflowSenderSecretKey(secretKey: string) {
  const trimmed = secretKey.trim();

  if (!trimmed) {
    throw new Error("STREAMFLOW_SENDER_SECRET_KEY is required.");
  }

  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed);

    if (!Array.isArray(parsed) || parsed.some((value) => !Number.isInteger(value))) {
      throw new Error("STREAMFLOW_SENDER_SECRET_KEY JSON must be an array of integers.");
    }

    return Uint8Array.from(parsed);
  }

  return bs58.decode(trimmed);
}

export function deriveStreamflowSenderAddress(secretKey: string) {
  return Keypair.fromSecretKey(parseStreamflowSenderSecretKey(secretKey)).publicKey.toBase58();
}

export function computeWrappedSolSetupPlan(params: {
  requiredAmountAtomic: bigint;
  sourceAccountExists: boolean;
  sourceAccountAmountAtomic: bigint;
  rentExemptionLamports: bigint;
  feeBufferLamports?: bigint;
}) {
  const feeBufferLamports = params.feeBufferLamports ?? STREAMFLOW_SETUP_FEE_BUFFER_LAMPORTS;
  const topUpAmountLamports =
    params.sourceAccountAmountAtomic >= params.requiredAmountAtomic
      ? BigInt(0)
      : params.requiredAmountAtomic - params.sourceAccountAmountAtomic;
  const ataCreationLamports = params.sourceAccountExists ? BigInt(0) : params.rentExemptionLamports;
  const recommendedAdditionalLamports =
    topUpAmountLamports + ataCreationLamports + feeBufferLamports;

  return {
    needsAtaCreation: !params.sourceAccountExists,
    topUpAmountLamports,
    ataCreationLamports,
    feeBufferLamports,
    recommendedAdditionalLamports,
    alreadySufficient:
      params.sourceAccountExists && params.sourceAccountAmountAtomic >= params.requiredAmountAtomic,
  };
}

