import "server-only";

import { deserializeMetadata } from "@metaplex-foundation/mpl-token-metadata";
import { lamports, publicKey as toUmiPublicKey, unwrapOption } from "@metaplex-foundation/umi";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Connection, PublicKey } from "@solana/web3.js";
import { clientEnv } from "@/lib/config/client-env";

const TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
const connection = new Connection(clientEnv.NEXT_PUBLIC_SOLANA_RPC_URL, "confirmed");
const OWNERSHIP_CACHE_TTL_MS = 60 * 1000;

export type OwnershipResult = {
  hasAccess: boolean;
  matchedMint: string | null;
  checkedAt: Date;
};

const globalForOwnershipCache = globalThis as typeof globalThis & {
  peanutBankOwnershipCache?: Map<string, OwnershipResult & { expiresAt: number }>;
};

const ownershipCache =
  globalForOwnershipCache.peanutBankOwnershipCache ??
  new Map<string, OwnershipResult & { expiresAt: number }>();

if (!globalForOwnershipCache.peanutBankOwnershipCache) {
  globalForOwnershipCache.peanutBankOwnershipCache = ownershipCache;
}

function chunkArray<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

function findMetadataAddress(mint: PublicKey) {
  const [metadataAddress] = PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    TOKEN_METADATA_PROGRAM_ID,
  );

  return metadataAddress;
}

async function getCandidateMints(owner: PublicKey, programId: PublicKey) {
  const tokenAccounts = await connection.getParsedTokenAccountsByOwner(owner, { programId });

  return tokenAccounts.value
    .map(({ account }) => {
      const parsedData = account.data.parsed.info;
      const tokenAmount = parsedData.tokenAmount;

      if (tokenAmount.decimals !== 0 || tokenAmount.amount !== "1") {
        return null;
      }

      return parsedData.mint as string;
    })
    .filter((mint): mint is string => Boolean(mint));
}

export async function checkRequiredCollectionOwnership(
  walletAddress: string,
  options?: { useCache?: boolean },
): Promise<OwnershipResult> {
  const useCache = options?.useCache ?? true;
  const cached = ownershipCache.get(walletAddress);

  if (useCache && cached && cached.expiresAt > Date.now()) {
    return {
      hasAccess: cached.hasAccess,
      matchedMint: cached.matchedMint,
      checkedAt: cached.checkedAt,
    };
  }

  const owner = new PublicKey(walletAddress);
  const requiredCollection = new PublicKey(clientEnv.NEXT_PUBLIC_REQUIRED_COLLECTION_ADDRESS).toBase58();
  const checkedAt = new Date();

  const mintAddresses = Array.from(
    new Set([
      ...(await getCandidateMints(owner, TOKEN_PROGRAM_ID)),
      ...(await getCandidateMints(owner, TOKEN_2022_PROGRAM_ID)),
    ]),
  );

  if (mintAddresses.length === 0) {
    const result = {
      hasAccess: false,
      matchedMint: null,
      checkedAt,
    };

    ownershipCache.set(walletAddress, {
      ...result,
      expiresAt: Date.now() + OWNERSHIP_CACHE_TTL_MS,
    });

    return result;
  }

  for (const mintChunk of chunkArray(mintAddresses, 100)) {
    const metadataAddresses = mintChunk.map((mintAddress) => findMetadataAddress(new PublicKey(mintAddress)));
    const metadataAccounts = await connection.getMultipleAccountsInfo(metadataAddresses);

    for (const [index, accountInfo] of metadataAccounts.entries()) {
      if (!accountInfo) {
        continue;
      }

      const metadata = deserializeMetadata({
        data: accountInfo.data,
        executable: accountInfo.executable,
        lamports: lamports(accountInfo.lamports),
        owner: toUmiPublicKey(accountInfo.owner.toBase58()),
        publicKey: toUmiPublicKey(metadataAddresses[index].toBase58()),
      });

      const collection = unwrapOption(metadata.collection);

      if (!collection) {
        continue;
      }

      if (collection.verified && collection.key === requiredCollection) {
        const result = {
          hasAccess: true,
          matchedMint: mintChunk[index],
          checkedAt,
        };

        ownershipCache.set(walletAddress, {
          ...result,
          expiresAt: Date.now() + OWNERSHIP_CACHE_TTL_MS,
        });

        return result;
      }
    }
  }

  const result = {
    hasAccess: false,
    matchedMint: null,
    checkedAt,
  };

  ownershipCache.set(walletAddress, {
    ...result,
    expiresAt: Date.now() + OWNERSHIP_CACHE_TTL_MS,
  });

  return result;
}
