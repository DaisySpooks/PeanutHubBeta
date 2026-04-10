import "server-only";

import bs58 from "bs58";
import * as squads from "@sqds/multisig";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  Commitment,
  Connection,
  Finality,
  Keypair,
  ParsedInnerInstruction,
  ParsedInstruction,
  ParsedTransactionWithMeta,
  PartiallyDecodedInstruction,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
} from "@solana/web3.js";
import { serverEnv } from "@/lib/config/server-env";
import {
  MultisigPayoutAdapter,
  MultisigAdapterError,
  MultisigSubmittedPayoutStatus,
  SquadsExecutionDetectionResult,
  SquadsPayoutPreparationRequest,
  SquadsPreparedPayout,
  SquadsProposalStatus,
  SquadsSignatureSearchRequest,
  SquadsSignatureSearchResult,
} from "./multisig-adapter";
import { assertSquadsSourceAccountReady } from "./squads-source-account-preflight";
import {
  classifySquadsExecutionCandidate,
  resolveSquadsExecutionMatches,
} from "./squads-signature-match";

const SOLANA_COMMITMENT: Commitment = "finalized";
const SOLANA_FINALITY: Finality = "finalized";
const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const DEFAULT_SIGNATURE_SEARCH_LIMIT = 100;

let connectionSingleton: Connection | undefined;
let proposerKeypairSingleton: Keypair | undefined;

function getSolanaRpcUrl() {
  return serverEnv.SOLANA_RPC_URL ?? serverEnv.NEXT_PUBLIC_SOLANA_RPC_URL;
}

function getSolanaConnection() {
  if (!connectionSingleton) {
    connectionSingleton = new Connection(getSolanaRpcUrl(), SOLANA_COMMITMENT);
  }

  return connectionSingleton;
}

function parseSecretKey(secretKey: string) {
  const trimmed = secretKey.trim();

  if (!trimmed) {
    throw new MultisigAdapterError("A non-empty Squads proposer secret key is required.");
  }

  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed);

    if (!Array.isArray(parsed) || parsed.some((value) => !Number.isInteger(value))) {
      throw new MultisigAdapterError(
        "SQUADS_PROPOSER_SECRET_KEY JSON must be an array of integers.",
      );
    }

    return Uint8Array.from(parsed);
  }

  return bs58.decode(trimmed);
}

function getSquadsProgramId() {
  return serverEnv.SQUADS_PROGRAM_ID ? new PublicKey(serverEnv.SQUADS_PROGRAM_ID) : undefined;
}

function getSquadsMultisigAddress() {
  if (!serverEnv.SQUADS_MULTISIG_ADDRESS) {
    throw new MultisigAdapterError(
      "SQUADS_MULTISIG_ADDRESS must be configured before Squads payouts can run.",
    );
  }

  return new PublicKey(serverEnv.SQUADS_MULTISIG_ADDRESS);
}

function getSquadsVaultIndex() {
  return serverEnv.SQUADS_VAULT_INDEX ?? 0;
}

function getSquadsProposerKeypair() {
  if (!proposerKeypairSingleton) {
    if (!serverEnv.SQUADS_PROPOSER_SECRET_KEY) {
      throw new MultisigAdapterError(
        "SQUADS_PROPOSER_SECRET_KEY must be configured before Squads payouts can run.",
      );
    }

    try {
      proposerKeypairSingleton = Keypair.fromSecretKey(
        parseSecretKey(serverEnv.SQUADS_PROPOSER_SECRET_KEY),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown Squads proposer key parsing error.";
      throw new MultisigAdapterError(`SQUADS_PROPOSER_SECRET_KEY is invalid: ${message}`);
    }
  }

  return proposerKeypairSingleton;
}

function getVaultPda(multisigPda: PublicKey, vaultIndex: number) {
  const [vaultPda] = squads.getVaultPda({
    multisigPda,
    index: vaultIndex,
    programId: getSquadsProgramId(),
  });

  return vaultPda;
}

function getTransactionPda(multisigPda: PublicKey, transactionIndex: bigint) {
  const [transactionPda] = squads.getTransactionPda({
    multisigPda,
    index: transactionIndex,
    programId: getSquadsProgramId(),
  });

  return transactionPda;
}

function getProposalPda(multisigPda: PublicKey, transactionIndex: bigint) {
  const [proposalPda] = squads.getProposalPda({
    multisigPda,
    transactionIndex,
    programId: getSquadsProgramId(),
  });

  return proposalPda;
}

function createMemoInstruction(memo: string) {
  return new TransactionInstruction({
    programId: MEMO_PROGRAM_ID,
    keys: [],
    data: Buffer.from(memo, "utf8"),
  });
}

async function assertVaultSourceAccountReady(params: {
  connection: Connection;
  vaultPda: PublicKey;
  mint: PublicKey;
  netAmountAtomic: bigint;
}) {
  const sourceAta = getAssociatedTokenAddressSync(params.mint, params.vaultPda, true);
  const sourceAtaAddress = sourceAta.toBase58();
  const vaultAddress = params.vaultPda.toBase58();
  const mintAddress = params.mint.toBase58();
  const existing = await params.connection.getAccountInfo(sourceAta, SOLANA_COMMITMENT);

  await assertSquadsSourceAccountReady({
    vaultAddress,
    mintAddress,
    sourceAccountAddress: sourceAtaAddress,
    requiredAmountAtomic: params.netAmountAtomic,
    loadSnapshot: async () => {
      if (!existing) {
        return { exists: false };
      }

      try {
        const sourceAccount = await getAccount(params.connection, sourceAta, SOLANA_COMMITMENT);

        return {
          exists: true,
          availableAmountAtomic: sourceAccount.amount,
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown source token account lookup error.";
        throw new MultisigAdapterError(
          `Squads payout preparation could not read the source token account ${sourceAtaAddress} for vault ${vaultAddress}: ${message}`,
        );
      }
    },
  });

  return sourceAta;
}

function proposalStatusRaw(status: { __kind: string }) {
  return status.__kind;
}

function proposalStateFromAccount(params: {
  proposal: Awaited<ReturnType<typeof squads.accounts.Proposal.fromAccountAddress>>;
  threshold: number;
}): SquadsProposalStatus {
  const raw = proposalStatusRaw(params.proposal.status);
  const approvalsCollected = params.proposal.approved.length;
  const approvalsRequired = params.threshold;
  const lastCheckedAt = new Date();

  if (raw === "Cancelled" || raw === "Rejected") {
    return {
      state: "cancelled",
      proposalStatusRaw: raw,
      reason: raw === "Cancelled" ? "Squads proposal was cancelled." : "Squads proposal was rejected.",
      lastCheckedAt,
    };
  }

  if (raw === "Approved" || raw === "Executing" || raw === "Executed") {
    return {
      state: "ready_for_execution",
      proposalStatusRaw: raw,
      approvalsCollected,
      approvalsRequired,
      lastCheckedAt,
    };
  }

  return {
    state: "awaiting_signatures",
    proposalStatusRaw: raw,
    approvalsCollected,
    approvalsRequired,
    lastCheckedAt,
  };
}

type InstructionLike = ParsedInstruction | PartiallyDecodedInstruction;

function getAllTransactionInstructions(
  transaction: ParsedTransactionWithMeta,
): InstructionLike[] {
  const topLevel = transaction.transaction.message.instructions;
  const inner =
    transaction.meta?.innerInstructions?.flatMap(
      (entry: ParsedInnerInstruction) => entry.instructions,
    ) ?? [];

  return [...topLevel, ...inner];
}

function decodeMemoFromInstruction(instruction: InstructionLike) {
  if ("parsed" in instruction && typeof instruction.parsed === "string") {
    return instruction.parsed;
  }

  if ("data" in instruction) {
    try {
      return Buffer.from(bs58.decode(instruction.data)).toString("utf8");
    } catch {
      return null;
    }
  }

  return null;
}

function findMemo(instructions: InstructionLike[]) {
  for (const instruction of instructions) {
    const program =
      "program" in instruction
        ? instruction.program
        : instruction.programId.toBase58();

    if (program === "spl-memo" || program === MEMO_PROGRAM_ID.toBase58()) {
      const memo = decodeMemoFromInstruction(instruction);

      if (memo) {
        return memo;
      }
    }
  }

  return null;
}

function findMatchingTransfer(params: {
  instructions: InstructionLike[];
  sourceAta?: string;
  destinationAta: string;
  mintAddress: string;
  netAmountAtomic: bigint;
}) {
  for (const instruction of params.instructions) {
    if (!("parsed" in instruction) || typeof instruction.parsed !== "object" || !instruction.parsed) {
      continue;
    }

    if (instruction.program !== "spl-token") {
      continue;
    }

    const parsed = instruction.parsed as {
      type?: string;
      info?: Record<string, unknown>;
    };

    if (!parsed.type || !parsed.info) {
      continue;
    }

    if (parsed.type !== "transferChecked" && parsed.type !== "transfer") {
      continue;
    }

    const destination = String(parsed.info.destination ?? "");
    const source = String(parsed.info.source ?? "");
    const mint = parsed.info.mint ? String(parsed.info.mint) : null;
    const amountRaw =
      typeof parsed.info.amount === "string"
        ? parsed.info.amount
        : typeof parsed.info.tokenAmount === "object" &&
            parsed.info.tokenAmount &&
            "amount" in parsed.info.tokenAmount &&
            typeof parsed.info.tokenAmount.amount === "string"
          ? parsed.info.tokenAmount.amount
          : null;

    if (
      (params.sourceAta ? source === params.sourceAta : true) &&
      destination === params.destinationAta &&
      amountRaw === params.netAmountAtomic.toString() &&
      (mint === null || mint === params.mintAddress)
    ) {
      return true;
    }
  }

  return false;
}

async function getCandidateSignatures(connection: Connection, addresses: PublicKey[]) {
  const signatures = new Map<string, { blockTime: number | null }>();

  await Promise.all(
    addresses.map(async (address) => {
      const results = await connection.getSignaturesForAddress(address, {
        limit: DEFAULT_SIGNATURE_SEARCH_LIMIT,
      });

      for (const result of results) {
        signatures.set(result.signature, { blockTime: result.blockTime ?? null });
      }
    }),
  );

  return Array.from(signatures.entries())
    .map(([signature, meta]) => ({ signature, blockTime: meta.blockTime }))
    .sort((a, b) => (b.blockTime ?? 0) - (a.blockTime ?? 0));
}

function withinSearchWindow(
  blockTime: number | null,
  searchWindowStart: Date,
  searchWindowEnd: Date,
) {
  if (blockTime === null) {
    return true;
  }

  const timestamp = blockTime * 1000;
  return (
    timestamp >= searchWindowStart.getTime() && timestamp <= searchWindowEnd.getTime()
  );
}

async function matchExecutionSignature(
  connection: Connection,
  params: SquadsSignatureSearchRequest,
): Promise<SquadsSignatureSearchResult> {
  const multisigPda = new PublicKey(params.multisigAccountAddress);
  const vaultPda = getVaultPda(multisigPda, params.vaultIndex);
  const mint = new PublicKey(params.expectedMintAddress);
  const recipientWallet = new PublicKey(params.expectedRecipientWalletAddress);
  const recipientAta = getAssociatedTokenAddressSync(mint, recipientWallet);
  const sourceAta = getAssociatedTokenAddressSync(mint, vaultPda, true);

  const candidateSignatures = await getCandidateSignatures(connection, [
    new PublicKey(params.transactionPda),
    new PublicKey(params.proposalPda),
    multisigPda,
    vaultPda,
    sourceAta,
    recipientAta,
  ]);

  const matches: Array<{
    txSignature: string;
    matchedBy: "memo" | "instruction_hash" | "transfer_tuple";
    detectedAt: Date;
  }> = [];

  for (const candidate of candidateSignatures) {
    if (
      !withinSearchWindow(
        candidate.blockTime,
        params.searchWindowStart,
        params.searchWindowEnd,
      )
    ) {
      continue;
    }

    const transaction = await connection.getParsedTransaction(candidate.signature, {
      commitment: SOLANA_FINALITY,
      maxSupportedTransactionVersion: 0,
    });

    if (!transaction || transaction.meta?.err) {
      continue;
    }

    const instructions = getAllTransactionInstructions(transaction);
    const memo = findMemo(instructions);
    const transferMatched = findMatchingTransfer({
      instructions,
      sourceAta: sourceAta.toBase58(),
      destinationAta: recipientAta.toBase58(),
      mintAddress: params.expectedMintAddress,
      netAmountAtomic: params.expectedNetAmountAtomic,
    });
    const matchedBy = classifySquadsExecutionCandidate({
      memo,
      payoutReference: params.payoutReference,
      preparedInstructionHash: params.preparedInstructionHash,
      transferMatched,
    });

    if (matchedBy) {
      matches.push({
        txSignature: candidate.signature,
        matchedBy,
        detectedAt: new Date((candidate.blockTime ?? Math.floor(Date.now() / 1000)) * 1000),
      });
    }
  }

  return resolveSquadsExecutionMatches({
    matches,
    searchedAt: new Date(),
  });
}

export class SquadsMultisigAdapter implements MultisigPayoutAdapter {
  private readonly connection = getSolanaConnection();

  async preparePayout(request: SquadsPayoutPreparationRequest): Promise<SquadsPreparedPayout> {
    const proposer = getSquadsProposerKeypair();
    const multisigPda = getSquadsMultisigAddress();
    const vaultIndex = getSquadsVaultIndex();
    const mint = new PublicKey(request.mintAddress);
    const recipientWallet = new PublicKey(request.recipientWalletAddress);
    const programId = getSquadsProgramId();
    const multisigAccount = await squads.accounts.Multisig.fromAccountAddress(
      this.connection,
      multisigPda,
    );
    const transactionIndex = BigInt(multisigAccount.transactionIndex.toString());
    const vaultPda = getVaultPda(multisigPda, vaultIndex);
    const transactionPda = getTransactionPda(multisigPda, transactionIndex);
    const proposalPda = getProposalPda(multisigPda, transactionIndex);
    const sourceAta = await assertVaultSourceAccountReady({
      connection: this.connection,
      vaultPda,
      mint,
      netAmountAtomic: request.netAmountAtomic,
    });
    const recipientAta = getAssociatedTokenAddressSync(mint, recipientWallet);
    const { blockhash } = await this.connection.getLatestBlockhash(SOLANA_COMMITMENT);

    const instructions = [
      createAssociatedTokenAccountIdempotentInstruction(
        vaultPda,
        recipientAta,
        recipientWallet,
        mint,
      ),
      createTransferCheckedInstruction(
        sourceAta,
        mint,
        recipientAta,
        vaultPda,
        request.netAmountAtomic,
        request.decimals,
      ),
      createMemoInstruction(request.memo),
    ];

    const transactionMessage = new TransactionMessage({
      payerKey: vaultPda,
      recentBlockhash: blockhash,
      instructions,
    });

    await squads.rpc.vaultTransactionCreate({
      connection: this.connection,
      feePayer: proposer,
      multisigPda,
      transactionIndex,
      creator: proposer.publicKey,
      vaultIndex,
      ephemeralSigners: 0,
      transactionMessage,
      memo: request.payoutReference,
      signers: [proposer],
      programId,
    });

    await squads.rpc.proposalCreate({
      connection: this.connection,
      feePayer: proposer,
      creator: proposer,
      multisigPda,
      transactionIndex,
      isDraft: false,
      programId,
    });

    const proposal = await squads.accounts.Proposal.fromAccountAddress(
      this.connection,
      proposalPda,
    );
    const status = proposalStateFromAccount({
      proposal,
      threshold: multisigAccount.threshold,
    });

    return {
      provider: "squads",
      multisigAccountAddress: multisigPda.toBase58(),
      vaultIndex,
      transactionIndex: transactionIndex.toString(),
      transactionPda: transactionPda.toBase58(),
      proposalPda: proposalPda.toBase58(),
      proposalId: proposalPda.toBase58(),
      proposalStatus: status.proposalStatusRaw,
      preparedInstructionHash: request.preparedInstructionHash,
      preparedAt: new Date(),
    };
  }

  async getProposalStatus(params: {
    multisigAccountAddress: string;
    transactionIndex: string;
    proposalPda: string;
  }): Promise<SquadsProposalStatus> {
    const multisigPda = new PublicKey(params.multisigAccountAddress);
    const proposal = await squads.accounts.Proposal.fromAccountAddress(
      this.connection,
      new PublicKey(params.proposalPda),
    );
    const multisigAccount = await squads.accounts.Multisig.fromAccountAddress(
      this.connection,
      multisigPda,
    );

    void params.transactionIndex;

    return proposalStateFromAccount({
      proposal,
      threshold: multisigAccount.threshold,
    });
  }

  async detectExecution(params: {
    multisigAccountAddress: string;
    transactionIndex: string;
    transactionPda: string;
    proposalPda: string;
  }): Promise<SquadsExecutionDetectionResult> {
    const proposal = await squads.accounts.Proposal.fromAccountAddress(
      this.connection,
      new PublicKey(params.proposalPda),
    );
    const raw = proposalStatusRaw(proposal.status);
    const lastCheckedAt = new Date();

    void params.multisigAccountAddress;
    void params.transactionIndex;
    void params.transactionPda;

    if (raw === "Executed" || raw === "Executing") {
      return {
        state: "execution_suspected",
        proposalStatusRaw: raw,
        executionStatusRaw: raw,
        detectionSource: "squads_state",
        lastCheckedAt,
      };
    }

    if (raw === "Cancelled" || raw === "Rejected") {
      return {
        state: "not_executed",
        proposalStatusRaw: raw,
        executionStatusRaw: raw,
        lastCheckedAt,
      };
    }

    return {
      state: "not_executed",
      proposalStatusRaw: raw,
      executionStatusRaw: raw,
      lastCheckedAt,
    };
  }

  async searchForExecutionSignature(
    request: SquadsSignatureSearchRequest,
  ): Promise<SquadsSignatureSearchResult> {
    return matchExecutionSignature(this.connection, request);
  }

  async confirmSubmittedPayout(params: {
    proposalId: string;
    txSignature: string;
    payoutReference: string;
    expectedRecipientWalletAddress: string;
    expectedMintAddress: string;
    expectedNetAmountAtomic: bigint;
  }): Promise<MultisigSubmittedPayoutStatus> {
    const transaction = await this.connection.getParsedTransaction(params.txSignature, {
      commitment: SOLANA_FINALITY,
      maxSupportedTransactionVersion: 0,
    });

    const proposal = await squads.accounts.Proposal.fromAccountAddress(
      this.connection,
      new PublicKey(params.proposalId),
    );
    const proposalStatus = proposalStatusRaw(proposal.status);

    if (!transaction) {
      return {
        state: "submitted",
        txSignature: params.txSignature,
        proposalStatus,
        lastCheckedAt: new Date(),
      };
    }

    if (transaction.meta?.err) {
      throw new MultisigAdapterError(
        `Submitted Squads payout transaction ${params.txSignature} failed on-chain.`,
      );
    }

    const mint = new PublicKey(params.expectedMintAddress);
    const recipientWallet = new PublicKey(params.expectedRecipientWalletAddress);
    const recipientAta = getAssociatedTokenAddressSync(mint, recipientWallet);
    const instructions = getAllTransactionInstructions(transaction);
    const memo = findMemo(instructions);

    if (!memo || !memo.includes(params.payoutReference)) {
      if (
        !findMatchingTransfer({
          instructions,
          sourceAta: "",
          destinationAta: recipientAta.toBase58(),
          mintAddress: params.expectedMintAddress,
          netAmountAtomic: params.expectedNetAmountAtomic,
        })
      ) {
        throw new MultisigAdapterError(
          `Submitted Squads payout transaction ${params.txSignature} does not match the expected payout payload.`,
        );
      }
    }

    return {
      state: "confirmed",
      txSignature: params.txSignature,
      confirmedAt: new Date((transaction.blockTime ?? Math.floor(Date.now() / 1000)) * 1000),
      recipientWalletAddress: params.expectedRecipientWalletAddress,
      mintAddress: params.expectedMintAddress,
      netAmountAtomic: params.expectedNetAmountAtomic,
      slot: transaction.slot,
      proposalStatus,
      lastCheckedAt: new Date(),
    };
  }
}
