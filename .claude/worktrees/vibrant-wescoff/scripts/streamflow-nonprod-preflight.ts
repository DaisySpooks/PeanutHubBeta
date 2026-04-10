import "dotenv/config";
import { Connection, PublicKey } from "@solana/web3.js";
import { getAccount, getAssociatedTokenAddressSync, NATIVE_MINT } from "@solana/spl-token";
import { serverEnv } from "../src/lib/config/server-env.ts";
import { db } from "../src/lib/db.ts";
import {
  STREAMFLOW_TOKEN_ACCOUNT_RENT_SPACE,
  computeWrappedSolSetupPlan,
  deriveStreamflowSenderAddress,
} from "../src/lib/vesting/streamflow-nonprod-setup.ts";

function usage() {
  console.error("Usage: node --import tsx scripts/streamflow-nonprod-preflight.ts <vestingPositionId>");
  process.exit(1);
}

async function main() {
  const vestingPositionId = process.argv[2];

  if (!vestingPositionId) {
    usage();
  }

  const vesting = await db.vestingPosition.findUnique({
    where: { id: vestingPositionId },
    select: {
      id: true,
      streamflowExpectedMintAddress: true,
      streamflowExpectedAmountAtomic: true,
      streamflowExpectedRecipientWalletAddress: true,
      streamflowExpectedStartAt: true,
      streamflowExpectedEndAt: true,
      streamflowExpectedVestingKind: true,
      streamflowLifecycleStatus: true,
      streamflowScheduleId: true,
      streamflowManualReviewRequired: true,
    },
  });

  if (!vesting) {
    throw new Error(`VestingPosition ${vestingPositionId} not found.`);
  }

  const configs = await db.systemConfig.findMany({
    where: {
      key: {
        in: ["peanut_token_mint_address", "peanut_token_decimals"],
      },
    },
  });
  const configMap = new Map(configs.map((row) => [row.key, row.value]));
  const dbMintAddress = configMap.get("peanut_token_mint_address") ?? null;
  const senderAddress = serverEnv.STREAMFLOW_SENDER_SECRET_KEY
    ? deriveStreamflowSenderAddress(serverEnv.STREAMFLOW_SENDER_SECRET_KEY)
    : null;
  const connection = new Connection(serverEnv.SOLANA_RPC_URL ?? serverEnv.NEXT_PUBLIC_SOLANA_RPC_URL, "confirmed");
  const mintAddress = vesting.streamflowExpectedMintAddress;

  if (!mintAddress) {
    throw new Error(`VestingPosition ${vestingPositionId} is missing streamflowExpectedMintAddress.`);
  }

  if (!vesting.streamflowExpectedAmountAtomic) {
    throw new Error(`VestingPosition ${vestingPositionId} is missing streamflowExpectedAmountAtomic.`);
  }

  const mintPublicKey = new PublicKey(mintAddress);
  const mintIsWrappedSol = mintPublicKey.equals(NATIVE_MINT);
  const senderPublicKey = senderAddress ? new PublicKey(senderAddress) : null;
  const sourceAta = senderPublicKey
    ? getAssociatedTokenAddressSync(mintPublicKey, senderPublicKey).toBase58()
    : null;

  const senderLamports = senderPublicKey ? await connection.getBalance(senderPublicKey) : null;
  const mintExists = Boolean(await connection.getAccountInfo(mintPublicKey));
  const rentExemptionLamports = BigInt(
    await connection.getMinimumBalanceForRentExemption(STREAMFLOW_TOKEN_ACCOUNT_RENT_SPACE),
  );

  let sourceAccountExists = false;
  let sourceAmountAtomic = BigInt(0);

  if (senderPublicKey) {
    const sourceAtaPublicKey = new PublicKey(sourceAta!);
    sourceAccountExists = Boolean(await connection.getAccountInfo(sourceAtaPublicKey));

    if (sourceAccountExists) {
      const account = await getAccount(connection, sourceAtaPublicKey);
      sourceAmountAtomic = account.amount;
    }
  }

  const setupPlan = senderPublicKey
    ? computeWrappedSolSetupPlan({
        requiredAmountAtomic: vesting.streamflowExpectedAmountAtomic,
        sourceAccountExists,
        sourceAccountAmountAtomic: sourceAmountAtomic,
        rentExemptionLamports,
      })
    : null;

  const blockers = [
    serverEnv.STREAMFLOW_INTEGRATION_ENABLED ? null : "STREAMFLOW_INTEGRATION_ENABLED must be true.",
    serverEnv.STREAMFLOW_ADAPTER_MODE === "sdk" ? null : "STREAMFLOW_ADAPTER_MODE must be sdk.",
    serverEnv.STREAMFLOW_CREATE_ENABLED ? null : "STREAMFLOW_CREATE_ENABLED must be true.",
    serverEnv.STREAMFLOW_SDK_EXECUTION_ENABLED ? null : "STREAMFLOW_SDK_EXECUTION_ENABLED must be true.",
    serverEnv.STREAMFLOW_CLUSTER === "devnet" ? null : "STREAMFLOW_CLUSTER should be devnet for local non-production runs.",
    senderAddress ? null : "STREAMFLOW_SENDER_SECRET_KEY must be configured.",
    serverEnv.STREAMFLOW_TREASURY_ADDRESS ? null : "STREAMFLOW_TREASURY_ADDRESS must be configured.",
    senderAddress && serverEnv.STREAMFLOW_TREASURY_ADDRESS && senderAddress !== serverEnv.STREAMFLOW_TREASURY_ADDRESS
      ? `STREAMFLOW_TREASURY_ADDRESS (${serverEnv.STREAMFLOW_TREASURY_ADDRESS}) does not match the configured sender public key (${senderAddress}).`
      : null,
    dbMintAddress && dbMintAddress !== mintAddress
      ? `SystemConfig peanut_token_mint_address (${dbMintAddress}) does not match VestingPosition.streamflowExpectedMintAddress (${mintAddress}).`
      : null,
    serverEnv.PEANUT_TOKEN_MINT_ADDRESS !== mintAddress
      ? `PEANUT_TOKEN_MINT_ADDRESS (${serverEnv.PEANUT_TOKEN_MINT_ADDRESS}) does not match VestingPosition.streamflowExpectedMintAddress (${mintAddress}).`
      : null,
    mintExists ? null : `Mint ${mintAddress} does not exist on the configured RPC cluster.`,
    mintIsWrappedSol && setupPlan && !setupPlan.alreadySufficient
      ? `Sender/source wrapped SOL account ${sourceAta} is not ready for the required amount ${vesting.streamflowExpectedAmountAtomic.toString()}.`
      : null,
    !mintIsWrappedSol && !sourceAccountExists
      ? `Sender/source associated token account ${sourceAta} does not exist for mint ${mintAddress}.`
      : null,
  ].filter((value): value is string => Boolean(value));

  console.log(
    JSON.stringify(
      {
        vestingPositionId: vesting.id,
        runtime: {
          integrationEnabled: serverEnv.STREAMFLOW_INTEGRATION_ENABLED,
          adapterMode: serverEnv.STREAMFLOW_ADAPTER_MODE,
          createEnabled: serverEnv.STREAMFLOW_CREATE_ENABLED,
          reconcileEnabled: serverEnv.STREAMFLOW_RECONCILE_ENABLED,
          sdkExecutionEnabled: serverEnv.STREAMFLOW_SDK_EXECUTION_ENABLED,
          sdkAllowProduction: serverEnv.STREAMFLOW_SDK_ALLOW_PRODUCTION,
          cluster: serverEnv.STREAMFLOW_CLUSTER ?? null,
          rpcUrl: serverEnv.SOLANA_RPC_URL ?? serverEnv.NEXT_PUBLIC_SOLANA_RPC_URL,
        },
        expected: {
          mintAddress,
          amountAtomic: vesting.streamflowExpectedAmountAtomic.toString(),
          recipientWalletAddress: vesting.streamflowExpectedRecipientWalletAddress,
          vestingKind: vesting.streamflowExpectedVestingKind,
          startAt: vesting.streamflowExpectedStartAt?.toISOString() ?? null,
          endAt: vesting.streamflowExpectedEndAt?.toISOString() ?? null,
        },
        configuration: {
          envMintAddress: serverEnv.PEANUT_TOKEN_MINT_ADDRESS,
          dbMintAddress,
          senderAddress,
          treasuryAddress: serverEnv.STREAMFLOW_TREASURY_ADDRESS ?? null,
        },
        chain: {
          mintExists,
          mintIsWrappedSol,
          senderLamports: senderLamports?.toString() ?? null,
          sourceAtaAddress: sourceAta,
          sourceAccountExists,
          sourceAmountAtomic: sourceAmountAtomic.toString(),
          rentExemptionLamports: rentExemptionLamports.toString(),
        },
        wrappedSolPlan:
          mintIsWrappedSol && setupPlan
            ? {
                needsAtaCreation: setupPlan.needsAtaCreation,
                topUpAmountLamports: setupPlan.topUpAmountLamports.toString(),
                ataCreationLamports: setupPlan.ataCreationLamports.toString(),
                feeBufferLamports: setupPlan.feeBufferLamports.toString(),
                recommendedAdditionalLamports: setupPlan.recommendedAdditionalLamports.toString(),
                alreadySufficient: setupPlan.alreadySufficient,
              }
            : null,
        blockers,
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
