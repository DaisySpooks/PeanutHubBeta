import bs58 from "bs58";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  Commitment,
  Connection,
  Keypair,
  PublicKey,
  SendTransactionError,
  Transaction,
} from "@solana/web3.js";
import { WithdrawalStatus } from "@prisma/client";
import { serverEnv } from "../config/server-env";
import { db } from "../db";
import {
  recordWithdrawalProcessingSubmission,
  replaceWithdrawalProcessingSubmission,
} from "./settlement";
import { logWithdrawalPayoutAttempt } from "./payout-attempts";

const SOLANA_COMMITMENT: Commitment = "finalized";

type PayoutConfig = {
  peanutTokenMintAddress: string;
  peanutTokenDecimals: number;
};

type ProcessingWithdrawalRecord = {
  id: string;
  netAmount: bigint;
  jobId: string;
  solanaTxSignature: string | null;
  solanaTxBlockhash: string | null;
  solanaTxLastValidBlockHeight: bigint | null;
  vestingPosition: {
    walletAddress: string;
  };
};

type ConfirmedPayout = {
  solanaTxSignature: string;
  solanaConfirmedAt: Date;
};

export class WithdrawalPayoutError extends Error {
  constructor(
    message: string,
    public readonly phase: "pre_submission" | "post_submission",
  ) {
    super(message);
    this.name = "WithdrawalPayoutError";
  }
}

export type TreasuryBalanceSnapshot = {
  treasuryWalletAddress: string;
  treasuryTokenAccountAddress: string;
  peanutTokenMintAddress: string;
  rawAmount: string;
  decimals: number;
};

let connectionSingleton: Connection | undefined;
let treasuryKeypairSingleton: Keypair | undefined;

function getSolanaRpcUrl() {
  return serverEnv.SOLANA_RPC_URL ?? serverEnv.NEXT_PUBLIC_SOLANA_RPC_URL;
}

function getSolanaConnection() {
  if (!connectionSingleton) {
    connectionSingleton = new Connection(getSolanaRpcUrl(), SOLANA_COMMITMENT);
  }

  return connectionSingleton;
}

function parseTreasurySecretKey(secretKey: string) {
  const trimmed = secretKey.trim();

  if (!trimmed) {
    throw new WithdrawalPayoutError(
      "SOLANA_TREASURY_SECRET_KEY is required for real payout mode.",
      "pre_submission",
    );
  }

  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed);

    if (!Array.isArray(parsed) || parsed.some((value) => !Number.isInteger(value))) {
      throw new WithdrawalPayoutError(
        "SOLANA_TREASURY_SECRET_KEY JSON must be an array of integers.",
        "pre_submission",
      );
    }

    return Uint8Array.from(parsed);
  }

  return bs58.decode(trimmed);
}

function getTreasuryKeypair() {
  if (!treasuryKeypairSingleton) {
    const rawSecretKey = serverEnv.SOLANA_TREASURY_SECRET_KEY;

    if (!rawSecretKey) {
      throw new WithdrawalPayoutError(
        "SOLANA_TREASURY_SECRET_KEY must be configured before real withdrawal payouts can run.",
        "pre_submission",
      );
    }

    try {
      treasuryKeypairSingleton = Keypair.fromSecretKey(parseTreasurySecretKey(rawSecretKey));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown treasury keypair parsing error.";
      throw new WithdrawalPayoutError(
        `SOLANA_TREASURY_SECRET_KEY is invalid: ${message}`,
        "pre_submission",
      );
    }
  }

  return treasuryKeypairSingleton;
}

async function getPayoutConfig(): Promise<PayoutConfig> {
  const rows = await db.systemConfig.findMany({
    where: {
      key: {
        in: ["peanut_token_mint_address", "peanut_token_decimals"],
      },
    },
    select: {
      key: true,
      value: true,
    },
  });

  const values = new Map(rows.map((row) => [row.key, row.value]));
  const peanutTokenMintAddress = values.get("peanut_token_mint_address");
  const peanutTokenDecimalsRaw = values.get("peanut_token_decimals");

  if (!peanutTokenMintAddress) {
    throw new WithdrawalPayoutError(
      "System config peanut_token_mint_address is missing.",
      "pre_submission",
    );
  }

  if (!peanutTokenDecimalsRaw) {
    throw new WithdrawalPayoutError(
      "System config peanut_token_decimals is missing.",
      "pre_submission",
    );
  }

  const peanutTokenDecimals = Number.parseInt(peanutTokenDecimalsRaw, 10);

  if (!Number.isInteger(peanutTokenDecimals) || peanutTokenDecimals < 0 || peanutTokenDecimals > 18) {
    throw new WithdrawalPayoutError(
      "System config peanut_token_decimals must be between 0 and 18.",
      "pre_submission",
    );
  }

  return {
    peanutTokenMintAddress,
    peanutTokenDecimals,
  };
}

async function loadProcessingWithdrawal(
  withdrawalId: string,
  jobId: string,
): Promise<ProcessingWithdrawalRecord> {
  const withdrawal = await db.withdrawal.findUnique({
    where: {
      id: withdrawalId,
    },
    select: {
      id: true,
      netAmount: true,
      jobId: true,
      status: true,
      solanaTxSignature: true,
      solanaTxBlockhash: true,
      solanaTxLastValidBlockHeight: true,
      vestingPosition: {
        select: {
          walletAddress: true,
        },
      },
    },
  });

  if (!withdrawal) {
    throw new WithdrawalPayoutError("Withdrawal not found.", "pre_submission");
  }

  if (withdrawal.status !== WithdrawalStatus.PROCESSING) {
    throw new WithdrawalPayoutError(
      `Withdrawal ${withdrawal.id} is not PROCESSING.`,
      withdrawal.solanaTxSignature ? "post_submission" : "pre_submission",
    );
  }

  if (!withdrawal.jobId || withdrawal.jobId !== jobId) {
    throw new WithdrawalPayoutError(
      `Withdrawal ${withdrawal.id} is owned by a different processing job.`,
      withdrawal.solanaTxSignature ? "post_submission" : "pre_submission",
    );
  }

  return {
    id: withdrawal.id,
    netAmount: withdrawal.netAmount,
    jobId: withdrawal.jobId,
    solanaTxSignature: withdrawal.solanaTxSignature,
    solanaTxBlockhash: withdrawal.solanaTxBlockhash,
    solanaTxLastValidBlockHeight: withdrawal.solanaTxLastValidBlockHeight,
    vestingPosition: withdrawal.vestingPosition,
  };
}

async function ensureRecipientAssociatedTokenAccount(params: {
  connection: Connection;
  treasury: Keypair;
  mint: PublicKey;
  owner: PublicKey;
}) {
  const associatedTokenAddress = getAssociatedTokenAddressSync(params.mint, params.owner);
  const existing = await params.connection.getAccountInfo(
    associatedTokenAddress,
    SOLANA_COMMITMENT,
  );

  if (existing) {
    return associatedTokenAddress;
  }

  const { blockhash, lastValidBlockHeight } = await params.connection.getLatestBlockhash(
    SOLANA_COMMITMENT,
  );
  const transaction = new Transaction({
    feePayer: params.treasury.publicKey,
    recentBlockhash: blockhash,
  }).add(
    createAssociatedTokenAccountIdempotentInstruction(
      params.treasury.publicKey,
      associatedTokenAddress,
      params.owner,
      params.mint,
    ),
  );

  transaction.sign(params.treasury);

  let signature: string;

  try {
    signature = await params.connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      maxRetries: 0,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown ATA creation submission error.";
    throw new WithdrawalPayoutError(
      `Could not submit the destination token account creation transaction: ${message}`,
      "pre_submission",
    );
  }

  try {
    const confirmation = await params.connection.confirmTransaction(
      {
        signature,
        blockhash,
        lastValidBlockHeight,
      },
      SOLANA_COMMITMENT,
    );

    if (confirmation.value.err) {
      throw new WithdrawalPayoutError(
        `Destination token account creation transaction ${signature} failed on-chain.`,
        "pre_submission",
      );
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown ATA creation confirmation error.";
    throw new WithdrawalPayoutError(
      `Could not confirm the destination token account creation transaction: ${message}`,
      "pre_submission",
    );
  }

  return associatedTokenAddress;
}

function buildSignedTransferTransaction(params: {
  treasury: Keypair;
  recipientWallet: PublicKey;
  mint: PublicKey;
  decimals: number;
  netAmount: bigint;
  recentBlockhash: string;
  sourceAssociatedTokenAddress: PublicKey;
  destinationAssociatedTokenAddress: PublicKey;
}) {
  const transaction = new Transaction({
    feePayer: params.treasury.publicKey,
    recentBlockhash: params.recentBlockhash,
  }).add(
    createTransferCheckedInstruction(
      params.sourceAssociatedTokenAddress,
      params.mint,
      params.destinationAssociatedTokenAddress,
      params.treasury.publicKey,
      params.netAmount,
      params.decimals,
    ),
  );

  transaction.sign(params.treasury);

  const signatureBytes = transaction.signature;

  if (!signatureBytes) {
    throw new WithdrawalPayoutError(
      "The payout transaction could not be signed.",
      "pre_submission",
    );
  }

  return {
    signature: bs58.encode(signatureBytes),
    serializedTransaction: transaction.serialize(),
  };
}

async function buildTransferSubmission(params: {
  connection: Connection;
  treasury: Keypair;
  payoutConfig: PayoutConfig;
  withdrawal: ProcessingWithdrawalRecord;
}) {
  const mint = new PublicKey(params.payoutConfig.peanutTokenMintAddress);
  const recipientWallet = new PublicKey(params.withdrawal.vestingPosition.walletAddress);
  const sourceAssociatedTokenAddress = getAssociatedTokenAddressSync(mint, params.treasury.publicKey);
  const destinationAssociatedTokenAddress = await ensureRecipientAssociatedTokenAccount({
    connection: params.connection,
    treasury: params.treasury,
    mint,
    owner: recipientWallet,
  });

  try {
    const sourceAccount = await getAccount(params.connection, sourceAssociatedTokenAddress);

    if (sourceAccount.amount < params.withdrawal.netAmount) {
      throw new WithdrawalPayoutError(
        `Treasury token balance is insufficient for withdrawal ${params.withdrawal.id}.`,
        "pre_submission",
      );
    }
  } catch (error) {
    if (error instanceof WithdrawalPayoutError) {
      throw error;
    }

    const message =
      error instanceof Error ? error.message : "Unknown treasury token account lookup error.";
    throw new WithdrawalPayoutError(
      `Could not read the treasury token account for withdrawal ${params.withdrawal.id}: ${message}`,
      "pre_submission",
    );
  }

  const { blockhash, lastValidBlockHeight } = await params.connection.getLatestBlockhash(
    SOLANA_COMMITMENT,
  );
  const transfer = buildSignedTransferTransaction({
    treasury: params.treasury,
    recipientWallet,
    mint,
    decimals: params.payoutConfig.peanutTokenDecimals,
    netAmount: params.withdrawal.netAmount,
    recentBlockhash: blockhash,
    sourceAssociatedTokenAddress,
    destinationAssociatedTokenAddress,
  });

  return {
    signature: transfer.signature,
    blockhash,
    lastValidBlockHeight: BigInt(lastValidBlockHeight),
    serializedTransaction: transfer.serializedTransaction,
  };
}

async function lookupConfirmationStatus(
  connection: Connection,
  signature: string,
) {
  const statuses = await connection.getSignatureStatuses([signature], {
    searchTransactionHistory: true,
  });

  return statuses.value[0] ?? null;
}

async function confirmOrDetectExpiry(params: {
  connection: Connection;
  signature: string;
  blockhash: string;
  lastValidBlockHeight: bigint;
}) {
  const existingStatus = await lookupConfirmationStatus(params.connection, params.signature);

  if (existingStatus?.err) {
    throw new WithdrawalPayoutError(
      `Payout transaction ${params.signature} failed on-chain.`,
      "post_submission",
    );
  }

  if (
    existingStatus?.confirmationStatus === "confirmed" ||
    existingStatus?.confirmationStatus === "finalized"
  ) {
    return {
      state: "confirmed" as const,
      confirmedAt: new Date(),
    };
  }

  const currentBlockHeight = await params.connection.getBlockHeight(SOLANA_COMMITMENT);

  if (BigInt(currentBlockHeight) > params.lastValidBlockHeight) {
    return {
      state: "expired" as const,
    };
  }

  try {
    const confirmation = await params.connection.confirmTransaction(
      {
        signature: params.signature,
        blockhash: params.blockhash,
        lastValidBlockHeight: Number(params.lastValidBlockHeight),
      },
      SOLANA_COMMITMENT,
    );

    if (confirmation.value.err) {
      throw new WithdrawalPayoutError(
        `Payout transaction ${params.signature} failed on-chain.`,
        "post_submission",
      );
    }

    return {
      state: "confirmed" as const,
      confirmedAt: new Date(),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown payout confirmation error.";
    throw new WithdrawalPayoutError(
      `Could not confirm payout transaction ${params.signature}: ${message}`,
      "post_submission",
    );
  }
}

function isDuplicateOrKnownSendError(error: unknown) {
  if (error instanceof SendTransactionError) {
    return error.message.includes("already been processed");
  }

  return error instanceof Error && error.message.toLowerCase().includes("already been processed");
}

async function submitSerializedTransfer(
  connection: Connection,
  serializedTransaction: Buffer,
) {
  try {
    return await connection.sendRawTransaction(serializedTransaction, {
      skipPreflight: false,
      maxRetries: 0,
    });
  } catch (error) {
    if (isDuplicateOrKnownSendError(error)) {
      return null;
    }

    const message =
      error instanceof Error ? error.message : "Unknown payout submission error.";
    throw new WithdrawalPayoutError(
      `Could not submit payout transaction: ${message}`,
      "post_submission",
    );
  }
}

async function confirmSubmittedTransfer(params: {
  connection: Connection;
  treasury: Keypair;
  payoutConfig: PayoutConfig;
  withdrawal: ProcessingWithdrawalRecord;
  actor?: string;
  attemptNumber?: number;
}) {
  if (
    !params.withdrawal.solanaTxSignature ||
    !params.withdrawal.solanaTxBlockhash ||
    !params.withdrawal.solanaTxLastValidBlockHeight
  ) {
    throw new WithdrawalPayoutError(
      `Withdrawal ${params.withdrawal.id} is missing persisted Solana submission details.`,
      "pre_submission",
    );
  }

  const mint = new PublicKey(params.payoutConfig.peanutTokenMintAddress);
  const recipientWallet = new PublicKey(params.withdrawal.vestingPosition.walletAddress);
  const sourceAssociatedTokenAddress = getAssociatedTokenAddressSync(mint, params.treasury.publicKey);
  const destinationAssociatedTokenAddress = await ensureRecipientAssociatedTokenAccount({
    connection: params.connection,
    treasury: params.treasury,
    mint,
    owner: recipientWallet,
  });

  const initialConfirmation = await confirmOrDetectExpiry({
    connection: params.connection,
    signature: params.withdrawal.solanaTxSignature,
    blockhash: params.withdrawal.solanaTxBlockhash,
    lastValidBlockHeight: params.withdrawal.solanaTxLastValidBlockHeight,
  });

  if (initialConfirmation.state === "confirmed") {
    await logWithdrawalPayoutAttempt({
      withdrawalId: params.withdrawal.id,
      actor: params.actor ?? "withdrawal-worker",
      jobId: params.withdrawal.jobId,
      attemptNumber: params.attemptNumber,
      eventType: "submission-confirmed",
      message: "Previously submitted payout transaction is already confirmed.",
      solanaTxSignature: params.withdrawal.solanaTxSignature,
    });
    return {
      solanaTxSignature: params.withdrawal.solanaTxSignature,
      solanaConfirmedAt: initialConfirmation.confirmedAt,
    };
  }

  if (initialConfirmation.state === "expired") {
    await logWithdrawalPayoutAttempt({
      withdrawalId: params.withdrawal.id,
      actor: params.actor ?? "withdrawal-worker",
      jobId: params.withdrawal.jobId,
      attemptNumber: params.attemptNumber,
      eventType: "submission-expired",
      message: "Submitted payout transaction expired before confirmation; building a replacement transaction.",
      solanaTxSignature: params.withdrawal.solanaTxSignature,
    });
    const replacementTransfer = await buildTransferSubmission({
      connection: params.connection,
      treasury: params.treasury,
      payoutConfig: params.payoutConfig,
      withdrawal: params.withdrawal,
    });

    await replaceWithdrawalProcessingSubmission({
      withdrawalId: params.withdrawal.id,
      jobId: params.withdrawal.jobId,
      previousSolanaTxSignature: params.withdrawal.solanaTxSignature,
      nextSolanaTxSignature: replacementTransfer.signature,
      nextSolanaTxBlockhash: replacementTransfer.blockhash,
      nextSolanaTxLastValidBlockHeight: replacementTransfer.lastValidBlockHeight,
    });

    await logWithdrawalPayoutAttempt({
      withdrawalId: params.withdrawal.id,
      actor: params.actor ?? "withdrawal-worker",
      jobId: params.withdrawal.jobId,
      attemptNumber: params.attemptNumber,
      eventType: "submission-replaced",
      message: "Stored a replacement payout transaction after blockhash expiry.",
      solanaTxSignature: replacementTransfer.signature,
    });

    await submitSerializedTransfer(params.connection, replacementTransfer.serializedTransaction);

    await logWithdrawalPayoutAttempt({
      withdrawalId: params.withdrawal.id,
      actor: params.actor ?? "withdrawal-worker",
      jobId: params.withdrawal.jobId,
      attemptNumber: params.attemptNumber,
      eventType: "submission-broadcast",
      message: "Broadcast replacement payout transaction to Solana RPC.",
      solanaTxSignature: replacementTransfer.signature,
    });

    const replacementConfirmation = await confirmOrDetectExpiry({
      connection: params.connection,
      signature: replacementTransfer.signature,
      blockhash: replacementTransfer.blockhash,
      lastValidBlockHeight: replacementTransfer.lastValidBlockHeight,
    });

    if (replacementConfirmation.state !== "confirmed") {
      throw new WithdrawalPayoutError(
        `Replacement payout transaction ${replacementTransfer.signature} has not confirmed yet.`,
        "post_submission",
      );
    }

    await logWithdrawalPayoutAttempt({
      withdrawalId: params.withdrawal.id,
      actor: params.actor ?? "withdrawal-worker",
      jobId: params.withdrawal.jobId,
      attemptNumber: params.attemptNumber,
      eventType: "submission-confirmed",
      message: "Replacement payout transaction confirmed on-chain.",
      solanaTxSignature: replacementTransfer.signature,
    });

    return {
      solanaTxSignature: replacementTransfer.signature,
      solanaConfirmedAt: replacementConfirmation.confirmedAt,
    };
  }

  const rebuiltTransfer = buildSignedTransferTransaction({
    treasury: params.treasury,
    recipientWallet,
    mint,
    decimals: params.payoutConfig.peanutTokenDecimals,
    netAmount: params.withdrawal.netAmount,
    recentBlockhash: params.withdrawal.solanaTxBlockhash,
    sourceAssociatedTokenAddress,
    destinationAssociatedTokenAddress,
  });

  if (rebuiltTransfer.signature !== params.withdrawal.solanaTxSignature) {
    throw new WithdrawalPayoutError(
      `Withdrawal ${params.withdrawal.id} rebuild produced a different transaction signature.`,
      "post_submission",
    );
  }

  await submitSerializedTransfer(params.connection, rebuiltTransfer.serializedTransaction);

  await logWithdrawalPayoutAttempt({
    withdrawalId: params.withdrawal.id,
    actor: params.actor ?? "withdrawal-worker",
    jobId: params.withdrawal.jobId,
    attemptNumber: params.attemptNumber,
    eventType: "submission-rebroadcast",
    message: "Rebroadcast existing signed payout transaction while awaiting confirmation.",
    solanaTxSignature: params.withdrawal.solanaTxSignature,
  });

  const confirmation = await confirmOrDetectExpiry({
    connection: params.connection,
    signature: params.withdrawal.solanaTxSignature,
    blockhash: params.withdrawal.solanaTxBlockhash,
    lastValidBlockHeight: params.withdrawal.solanaTxLastValidBlockHeight,
  });

  if (confirmation.state !== "confirmed") {
    throw new WithdrawalPayoutError(
      `Payout transaction ${params.withdrawal.solanaTxSignature} has not confirmed yet.`,
      "post_submission",
    );
  }

  await logWithdrawalPayoutAttempt({
    withdrawalId: params.withdrawal.id,
    actor: params.actor ?? "withdrawal-worker",
    jobId: params.withdrawal.jobId,
    attemptNumber: params.attemptNumber,
    eventType: "submission-confirmed",
    message: "Rebroadcast payout transaction confirmed on-chain.",
    solanaTxSignature: params.withdrawal.solanaTxSignature,
  });

  return {
    solanaTxSignature: params.withdrawal.solanaTxSignature,
    solanaConfirmedAt: confirmation.confirmedAt,
  };
}

export async function submitAndConfirmWithdrawalPayout(
  withdrawalId: string,
  jobId: string,
  actor?: string,
  attemptNumber?: number,
): Promise<ConfirmedPayout> {
  const connection = getSolanaConnection();
  const treasury = getTreasuryKeypair();
  const payoutConfig = await getPayoutConfig();
  const withdrawal = await loadProcessingWithdrawal(withdrawalId, jobId);

  if (
    withdrawal.solanaTxSignature &&
    withdrawal.solanaTxBlockhash &&
    withdrawal.solanaTxLastValidBlockHeight
  ) {
    await logWithdrawalPayoutAttempt({
      withdrawalId,
      actor: actor ?? "withdrawal-worker",
      jobId,
      attemptNumber,
      eventType: "submission-resumed",
      message: "Resuming confirmation for an already-submitted payout transaction.",
      solanaTxSignature: withdrawal.solanaTxSignature,
    });
    return confirmSubmittedTransfer({
      connection,
      treasury,
      payoutConfig,
      withdrawal,
      actor,
      attemptNumber,
    });
  }

  const transfer = await buildTransferSubmission({
    connection,
    treasury,
    payoutConfig,
    withdrawal,
  });

  await recordWithdrawalProcessingSubmission({
    withdrawalId: withdrawal.id,
    jobId,
    solanaTxSignature: transfer.signature,
    solanaTxBlockhash: transfer.blockhash,
    solanaTxLastValidBlockHeight: transfer.lastValidBlockHeight,
  });

  await logWithdrawalPayoutAttempt({
    withdrawalId,
    actor: actor ?? "withdrawal-worker",
    jobId,
    attemptNumber,
    eventType: "submission-recorded",
    message: "Persisted payout submission details before broadcast.",
    solanaTxSignature: transfer.signature,
  });

  await submitSerializedTransfer(connection, transfer.serializedTransaction);

  await logWithdrawalPayoutAttempt({
    withdrawalId,
    actor: actor ?? "withdrawal-worker",
    jobId,
    attemptNumber,
    eventType: "submission-broadcast",
    message: "Broadcast payout transaction to Solana RPC.",
    solanaTxSignature: transfer.signature,
  });

  const confirmation = await confirmOrDetectExpiry({
    connection,
    signature: transfer.signature,
    blockhash: transfer.blockhash,
    lastValidBlockHeight: transfer.lastValidBlockHeight,
  });

  if (confirmation.state !== "confirmed") {
    throw new WithdrawalPayoutError(
      `Payout transaction ${transfer.signature} has not confirmed yet.`,
      "post_submission",
    );
  }

  await logWithdrawalPayoutAttempt({
    withdrawalId,
    actor: actor ?? "withdrawal-worker",
    jobId,
    attemptNumber,
    eventType: "submission-confirmed",
    message: "Confirmed payout transaction on-chain.",
    solanaTxSignature: transfer.signature,
  });

  return {
    solanaTxSignature: transfer.signature,
    solanaConfirmedAt: confirmation.confirmedAt,
  };
}

export async function confirmStoredWithdrawalPayout(params: {
  withdrawalId: string;
  jobId: string;
  actor?: string;
  attemptNumber?: number;
  expectedSolanaTxSignature?: string;
}): Promise<ConfirmedPayout> {
  const connection = getSolanaConnection();
  const treasury = getTreasuryKeypair();
  const payoutConfig = await getPayoutConfig();
  const withdrawal = await loadProcessingWithdrawal(params.withdrawalId, params.jobId);

  if (
    !withdrawal.solanaTxSignature ||
    !withdrawal.solanaTxBlockhash ||
    !withdrawal.solanaTxLastValidBlockHeight
  ) {
    throw new WithdrawalPayoutError(
      `Withdrawal ${withdrawal.id} does not have a stored payout submission to confirm.`,
      "pre_submission",
    );
  }

  if (
    params.expectedSolanaTxSignature &&
    withdrawal.solanaTxSignature !== params.expectedSolanaTxSignature
  ) {
    throw new WithdrawalPayoutError(
      `Withdrawal ${withdrawal.id} does not match the expected stored payout signature.`,
      "post_submission",
    );
  }

  return confirmSubmittedTransfer({
    connection,
    treasury,
    payoutConfig,
    withdrawal,
    actor: params.actor,
    attemptNumber: params.attemptNumber,
  });
}

export async function getTreasuryBalanceSnapshot(): Promise<TreasuryBalanceSnapshot> {
  const connection = getSolanaConnection();
  const treasury = getTreasuryKeypair();
  const payoutConfig = await getPayoutConfig();
  const mint = new PublicKey(payoutConfig.peanutTokenMintAddress);
  const treasuryTokenAccountAddress = getAssociatedTokenAddressSync(mint, treasury.publicKey);

  const account = await getAccount(connection, treasuryTokenAccountAddress);

  return {
    treasuryWalletAddress: treasury.publicKey.toBase58(),
    treasuryTokenAccountAddress: treasuryTokenAccountAddress.toBase58(),
    peanutTokenMintAddress: payoutConfig.peanutTokenMintAddress,
    rawAmount: account.amount.toString(),
    decimals: payoutConfig.peanutTokenDecimals,
  };
}
