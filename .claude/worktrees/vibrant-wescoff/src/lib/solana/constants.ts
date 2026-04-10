import { clusterApiUrl } from "@solana/web3.js";
import { clientEnv } from "@/lib/config/client-env";

export const solanaNetwork = clientEnv.NEXT_PUBLIC_SOLANA_NETWORK;

export const solanaRpcUrl =
  clientEnv.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl(solanaNetwork);

export const requiredCollectionAddress =
  clientEnv.NEXT_PUBLIC_REQUIRED_COLLECTION_ADDRESS;
