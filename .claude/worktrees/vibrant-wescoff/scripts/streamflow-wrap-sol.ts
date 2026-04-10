import "dotenv/config";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createSyncNativeInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  NATIVE_MINT,
} from "@solana/spl-token";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { serverEnv } from "../src/lib/config/server-env.ts";
import { db } from "../src/lib/db.ts";
import {
  STREAMFLOW_TOKEN_ACCOUNT_RENT_SPACE,
  computeWrappedSolSetupPlan,
  parseStreamflowSenderSecretKey,
} from "../src/lib/vesting/streamflow-nonprod-setup.ts";

function usage() {
  console.error("Usage: node --import tsx scripts/streamflow-wrap-sol.ts <vestingPositionId>");
  process.exit(1);
}

async function main() {
  const vestingPositionId = process.argv[2];

  if (!vestingPositionId) {
    usage();
  }

  if (!serverEnv.STREAMFLOW_SENDER_SECRET_KEY) {
    throw new Error("STREAMFLOW_SENDER_SECRET_KEY must be configured.");
  }

  const vesting = await db.vestingPosition.findUnique({
    where: { id: vestingPositionId },
    select: {
      id: true,
      streamflowExpectedMintAddress: true,
      streamflowExpectedAmountAtomic: true,
    },
  });

  if (!vesting) {
    throw new Error(`VestingPosition ${vestingPositionId} not found.`);
  }

  if (!vesting.streamflowExpectedMintAddress || !vesting.streamflowExpectedAmountAtomic) {
    throw new Error("VestingPosition is missing expected Streamflow mint or amount.");
  }

  const mint = new PublicKey(vesting.streamflowExpectedMintAddress);
  if (!mint.equals(NATIVE_MINT)) {
    throw new Error(
      `streamflow-wrap-sol only supports the wrapped SOL mint ${NATIVE_MINT.toBase58()} for this non-production setup path.`,
    );
  }

  const sender = Keypair.fromSecretKey(parseStreamflowSenderSecretKey(serverEnv.STREAMFLOW_SENDER_SECRET_KEY));
  const connection = new Connection(serverEnv.SOLANA_RPC_URL ?? serverEnv.NEXT_PUBLIC_SOLANA_RPC_URL, "confirmed");
  const sourceAta = getAssociatedTokenAddressSync(mint, sender.publicKey);
  const sourceAtaInfo = await connection.getAccountInfo(sourceAta);
  const existingAmount = sourceAtaInfo ? (await getAccount(connection, sourceAta)).amount : BigInt(0);
  const rentExemptionLamports = BigInt(
    await connection.getMinimumBalanceForRentExemption(STREAMFLOW_TOKEN_ACCOUNT_RENT_SPACE),
  );
  const setupPlan = computeWrappedSolSetupPlan({
    requiredAmountAtomic: vesting.streamflowExpectedAmountAtomic,
    sourceAccountExists: Boolean(sourceAtaInfo),
    sourceAccountAmountAtomic: existingAmount,
    rentExemptionLamports,
    feeBufferLamports: BigInt(0),
  });

  if (setupPlan.alreadySufficient) {
    console.log(
      JSON.stringify(
        {
          vestingPositionId: vesting.id,
          senderAddress: sender.publicKey.toBase58(),
          sourceAtaAddress: sourceAta.toBase58(),
          action: "already_sufficient",
          currentAmountAtomic: existingAmount.toString(),
        },
        null,
        2,
      ),
    );
    return;
  }

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer: sender.publicKey,
    recentBlockhash: blockhash,
    lastValidBlockHeight,
  });

  transaction.add(
    createAssociatedTokenAccountIdempotentInstruction(
      sender.publicKey,
      sourceAta,
      sender.publicKey,
      mint,
    ),
  );

  if (setupPlan.topUpAmountLamports > BigInt(0)) {
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: sender.publicKey,
        toPubkey: sourceAta,
        lamports: Number(setupPlan.topUpAmountLamports),
      }),
    );
  }

  transaction.add(createSyncNativeInstruction(sourceAta));
  transaction.sign(sender);

  const signature = await connection.sendRawTransaction(transaction.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });

  await connection.confirmTransaction(
    {
      signature,
      blockhash,
      lastValidBlockHeight,
    },
    "confirmed",
  );

  const updatedAmount = (await getAccount(connection, sourceAta)).amount;

  console.log(
    JSON.stringify(
      {
        vestingPositionId: vesting.id,
        senderAddress: sender.publicKey.toBase58(),
        sourceAtaAddress: sourceAta.toBase58(),
        txSignature: signature,
        previousAmountAtomic: existingAmount.toString(),
        requiredAmountAtomic: vesting.streamflowExpectedAmountAtomic.toString(),
        currentAmountAtomic: updatedAmount.toString(),
        addedLamports: setupPlan.topUpAmountLamports.toString(),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
