import "server-only";

import { inspect } from "node:util";
import bs58 from "bs58";
import BN from "bn.js";
import { getAccount, getAssociatedTokenAddressSync, NATIVE_MINT } from "@solana/spl-token";
import {
  ContractError,
  SolanaStreamClient,
  type ICluster,
  type ICreateResult,
  type ICreateStreamData,
  type Stream,
} from "@streamflow/stream";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { serverEnv } from "@/lib/config/server-env";
import {
  StreamflowAdapterError,
  type StreamflowAdapter,
  type StreamflowCreatedSchedule,
  type StreamflowPreparedSchedule,
  type StreamflowScheduleRequest,
  type StreamflowScheduleSearchRequest,
  type StreamflowScheduleSearchResult,
  type StreamflowScheduleStatus,
} from "./streamflow-adapter";
import {
  buildStreamflowPayloadFromSource,
  StreamflowPayloadValidationError,
  type StreamflowCreateSchedulePayload,
  type StreamflowPayloadSource,
} from "./streamflow-payload";

const DEFAULT_TOKEN_LOCK_PERIOD_SECONDS = 1;

let streamflowClientSingleton: SolanaStreamClient | undefined;
let streamflowSenderKeypairSingleton: Keypair | undefined;
let solanaConnectionSingleton: Connection | undefined;

export function __test_setConnectionSingleton(connection: Pick<Connection, "getBalance" | "getAccountInfo">) {
  solanaConnectionSingleton = connection as Connection;
}

export class StreamflowRequestConstructionError extends StreamflowAdapterError {
  constructor(message: string) {
    super(message);
    this.name = "StreamflowRequestConstructionError";
  }
}

export class StreamflowSdkRuntimeError extends StreamflowAdapterError {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "StreamflowSdkRuntimeError";
  }
}

export class StreamflowExecutionGuardError extends StreamflowAdapterError {
  constructor(message: string) {
    super(message);
    this.name = "StreamflowExecutionGuardError";
  }
}

export class StreamflowSourceAccountPreflightError extends StreamflowAdapterError {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "StreamflowSourceAccountPreflightError";
  }
}

function truncateText(value: string, maxLength = 2_000) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function serializeUnknownError(error: unknown, depth = 0): unknown {
  if (depth > 4) {
    return "[MaxDepth]";
  }

  if (error instanceof Error) {
    const ownProps = Object.fromEntries(
      Object.getOwnPropertyNames(error).map((key) => [
        key,
        (error as unknown as Record<string, unknown>)[key],
      ]),
    );

    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...Object.fromEntries(
        Object.entries(ownProps).map(([key, value]) => [key, serializeUnknownError(value, depth + 1)]),
      ),
      cause:
        "cause" in error
          ? serializeUnknownError((error as Error & { cause?: unknown }).cause, depth + 1)
          : undefined,
    };
  }

  if (Array.isArray(error)) {
    return error.map((item) => serializeUnknownError(item, depth + 1));
  }

  if (error && typeof error === "object") {
    return Object.fromEntries(
      Object.entries(error).map(([key, value]) => [key, serializeUnknownError(value, depth + 1)]),
    );
  }

  return error;
}

function toDebugString(value: unknown) {
  try {
    return truncateText(JSON.stringify(value));
  } catch {
    return truncateText(inspect(value, { depth: 6, breakLength: 120 }));
  }
}

function buildDiagnosticMessage(error: unknown) {
  const serialized = serializeUnknownError(error);

  if (error instanceof ContractError) {
    return truncateText(
      `Streamflow ContractError: ${error.message || "(no message)"} | code=${error.contractErrorCode ?? "unknown"} | details=${toDebugString(serialized)}`,
    );
  }

  if (error instanceof Error) {
    const maybeCode =
      typeof (error as Error & { code?: unknown }).code === "string"
        ? (error as Error & { code?: string }).code
        : null;
    const message = error.message?.trim() || "(no message)";

    return truncateText(
      maybeCode
        ? `${error.name}: ${message} | code=${maybeCode} | details=${toDebugString(serialized)}`
        : `${error.name}: ${message} | details=${toDebugString(serialized)}`,
    );
  }

  return truncateText(`Unknown Streamflow SDK error | details=${toDebugString(serialized)}`);
}

function getClusterUrl() {
  return serverEnv.SOLANA_RPC_URL ?? serverEnv.NEXT_PUBLIC_SOLANA_RPC_URL;
}

function getCluster(): ICluster | undefined {
  return serverEnv.STREAMFLOW_CLUSTER
    ? (serverEnv.STREAMFLOW_CLUSTER as ICluster)
    : undefined;
}

function getProgramId() {
  return serverEnv.STREAMFLOW_PROGRAM_ID;
}

function getConfiguredTreasuryAddress() {
  return serverEnv.STREAMFLOW_TREASURY_ADDRESS ?? null;
}

function parseSecretKey(secretKey: string) {
  const trimmed = secretKey.trim();

  if (!trimmed) {
    throw new StreamflowExecutionGuardError(
      "A non-empty STREAMFLOW_SENDER_SECRET_KEY is required for real Streamflow execution.",
    );
  }

  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed);

    if (!Array.isArray(parsed) || parsed.some((value) => !Number.isInteger(value))) {
      throw new StreamflowExecutionGuardError(
        "STREAMFLOW_SENDER_SECRET_KEY JSON must be an array of integers.",
      );
    }

    return Uint8Array.from(parsed);
  }

  return bs58.decode(trimmed);
}

function getStreamflowClient() {
  if (!streamflowClientSingleton) {
    streamflowClientSingleton = new SolanaStreamClient({
      clusterUrl: getClusterUrl(),
      cluster: getCluster(),
      programId: getProgramId(),
    });
  }

  return streamflowClientSingleton;
}

function getSolanaConnection() {
  if (!solanaConnectionSingleton) {
    solanaConnectionSingleton = new Connection(getClusterUrl());
  }

  return solanaConnectionSingleton;
}

function getStreamflowSenderKeypair() {
  if (!streamflowSenderKeypairSingleton) {
    if (!serverEnv.STREAMFLOW_SENDER_SECRET_KEY) {
      throw new StreamflowExecutionGuardError(
        "STREAMFLOW_SENDER_SECRET_KEY must be configured before real Streamflow execution can run.",
      );
    }

    try {
      streamflowSenderKeypairSingleton = Keypair.fromSecretKey(
        parseSecretKey(serverEnv.STREAMFLOW_SENDER_SECRET_KEY),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown Streamflow sender key parsing error.";
      throw new StreamflowExecutionGuardError(`STREAMFLOW_SENDER_SECRET_KEY is invalid: ${message}`);
    }
  }

  return streamflowSenderKeypairSingleton;
}

function getStreamflowSdkSender(): Parameters<SolanaStreamClient["create"]>[1]["sender"] {
  return getStreamflowSenderKeypair() as unknown as Parameters<SolanaStreamClient["create"]>[1]["sender"];
}

async function assertSourceAccountReady(request: StreamflowScheduleRequest) {
  const sender = getStreamflowSenderKeypair();
  const connection = getSolanaConnection();
  const senderAddress = sender.publicKey.toBase58();
  const mintAddress = request.mintAddress;
  const mint = new PublicKey(mintAddress);
  const sourceAssociatedTokenAddress = getAssociatedTokenAddressSync(mint, sender.publicKey);
  const sourceAddress = sourceAssociatedTokenAddress.toBase58();
  const mintIsWrappedSol = mint.equals(NATIVE_MINT);
  const senderLamports = await connection.getBalance(sender.publicKey);

  const existingSourceAccount = await connection.getAccountInfo(sourceAssociatedTokenAddress);

  if (!existingSourceAccount) {
    throw new StreamflowSourceAccountPreflightError(
      mintIsWrappedSol
        ? `Streamflow create cannot run because the sender/source wallet ${senderAddress} does not have a wrapped SOL associated token account for mint ${mintAddress}. Expected source token account ${sourceAddress}.`
        : `Streamflow create cannot run because the sender/source wallet ${senderAddress} does not have the required associated token account for mint ${mintAddress}. Expected source token account ${sourceAddress}.`,
      {
        senderAddress,
        mintAddress,
        sourceAssociatedTokenAddress: sourceAddress,
        requiredAmountAtomic: request.amountAtomic.toString(),
        senderLamports,
        mintIsWrappedSol,
        configuredSourceAddress: request.treasuryAddress ?? getConfiguredTreasuryAddress(),
      },
    );
  }

  let sourceAccount;

  try {
    sourceAccount = await getAccount(connection, sourceAssociatedTokenAddress);
  } catch (error) {
    throw new StreamflowSourceAccountPreflightError(
      `Streamflow create could not read the sender/source token account ${sourceAddress} for mint ${mintAddress}.`,
      {
        senderAddress,
        mintAddress,
        sourceAssociatedTokenAddress: sourceAddress,
        requiredAmountAtomic: request.amountAtomic.toString(),
        senderLamports,
        mintIsWrappedSol,
        configuredSourceAddress: request.treasuryAddress ?? getConfiguredTreasuryAddress(),
        readError: serializeUnknownError(error),
      },
    );
  }

  if (sourceAccount.amount < request.amountAtomic) {
    throw new StreamflowSourceAccountPreflightError(
      mintIsWrappedSol
        ? `Streamflow create cannot run because the sender/source wrapped SOL account ${sourceAddress} only holds ${sourceAccount.amount.toString()} atomic units, but ${request.amountAtomic.toString()} are required.`
        : `Streamflow create cannot run because the sender/source token account ${sourceAddress} only holds ${sourceAccount.amount.toString()} atomic units, but ${request.amountAtomic.toString()} are required.`,
      {
        senderAddress,
        mintAddress,
        sourceAssociatedTokenAddress: sourceAddress,
        requiredAmountAtomic: request.amountAtomic.toString(),
        availableAmountAtomic: sourceAccount.amount.toString(),
        senderLamports,
        mintIsWrappedSol,
        configuredSourceAddress: request.treasuryAddress ?? getConfiguredTreasuryAddress(),
      },
    );
  }
}

function assertExecutionEnabled() {
  if (!serverEnv.STREAMFLOW_INTEGRATION_ENABLED || serverEnv.STREAMFLOW_ADAPTER_MODE !== "sdk") {
    throw new StreamflowExecutionGuardError(
      "Real Streamflow execution is disabled. Enable the sdk adapter mode explicitly before using it.",
    );
  }

  if (!serverEnv.STREAMFLOW_SDK_EXECUTION_ENABLED) {
    throw new StreamflowExecutionGuardError(
      "STREAMFLOW_SDK_EXECUTION_ENABLED must be true before real Streamflow execution can run.",
    );
  }

  if (process.env.NODE_ENV === "production" && !serverEnv.STREAMFLOW_SDK_ALLOW_PRODUCTION) {
    throw new StreamflowExecutionGuardError(
      "Real Streamflow execution is blocked in production until STREAMFLOW_SDK_ALLOW_PRODUCTION is explicitly enabled.",
    );
  }
}

function toPayloadSource(request: StreamflowScheduleRequest): StreamflowPayloadSource {
  return {
    vestingPositionId: request.vestingPositionId,
    exchangeId: request.exchangeId,
    vestingReference: request.vestingReference,
    clientCorrelationId: request.clientCorrelationId ?? null,
    expectedRecipientWalletAddress: request.recipientWalletAddress,
    expectedMintAddress: request.mintAddress,
    expectedAmountAtomic: request.amountAtomic,
    expectedStartAt: request.startAt,
    expectedEndAt: request.endAt,
    expectedVestingKind: request.vestingKind,
    clientOrderRef: request.clientOrderRef ?? null,
    treasuryAddress: request.treasuryAddress ?? getConfiguredTreasuryAddress(),
  };
}

function toUnixSeconds(date: Date) {
  return Math.floor(date.getTime() / 1_000);
}

function fromUnixSeconds(value: number) {
  return new Date(value * 1_000);
}

function gcd(left: bigint, right: bigint): bigint {
  let a = left < BigInt(0) ? -left : left;
  let b = right < BigInt(0) ? -right : right;

  while (b !== BigInt(0)) {
    const temp = b;
    b = a % b;
    a = temp;
  }

  return a;
}

function toExactLinearVestingSchedule(amountAtomic: bigint, durationSeconds: number) {
  if (durationSeconds <= 0) {
    throw new StreamflowRequestConstructionError(
      "Streamflow vesting duration must be greater than zero seconds.",
    );
  }

  const durationBig = BigInt(durationSeconds);
  const divisor = gcd(amountAtomic, durationBig);
  const periodBig = durationBig / divisor;
  const amountPerPeriodBig = amountAtomic / divisor;

  if (periodBig > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new StreamflowRequestConstructionError(
      "Streamflow vesting period exceeds JavaScript safe integer limits.",
    );
  }

  return {
    period: Number(periodBig),
    cliffAmount: new BN(0),
    amountPerPeriod: new BN(amountPerPeriodBig.toString()),
  };
}

function buildCreateStreamData(
  payload: StreamflowCreateSchedulePayload,
): ICreateStreamData {
  const amountAtomic = BigInt(payload.required.amountAtomic);
  const start = Math.floor(new Date(payload.required.startAtIso).getTime() / 1_000);
  const end = Math.floor(new Date(payload.required.endAtIso).getTime() / 1_000);
  const durationSeconds = end - start;

  if (payload.required.vestingKind === "token_lock") {
    const cliffAmount = amountAtomic > BigInt(0) ? amountAtomic - BigInt(1) : BigInt(0);

    return {
      recipient: payload.required.recipientWalletAddress,
      tokenId: payload.required.mintAddress,
      start,
      amount: new BN(amountAtomic.toString()),
      period: DEFAULT_TOKEN_LOCK_PERIOD_SECONDS,
      cliff: start,
      cliffAmount: new BN(cliffAmount.toString()),
      amountPerPeriod: new BN("1"),
      name: payload.required.vestingReference,
      canTopup: false,
      automaticWithdrawal: false,
      cancelableBySender: false,
      cancelableByRecipient: false,
      transferableBySender: false,
      transferableByRecipient: false,
    };
  }

  const exactLinear = toExactLinearVestingSchedule(amountAtomic, durationSeconds);

  return {
    recipient: payload.required.recipientWalletAddress,
    tokenId: payload.required.mintAddress,
    start,
    amount: new BN(amountAtomic.toString()),
    period: exactLinear.period,
    cliff: start,
    cliffAmount: exactLinear.cliffAmount,
    amountPerPeriod: exactLinear.amountPerPeriod,
    name: payload.required.vestingReference,
    canTopup: false,
    automaticWithdrawal: false,
    cancelableBySender: false,
    cancelableByRecipient: false,
    transferableBySender: false,
    transferableByRecipient: false,
  };
}

function mapCreateResult(
  request: StreamflowScheduleRequest,
  result: ICreateResult,
): StreamflowCreatedSchedule {
  return {
    provider: "streamflow",
    scheduleId: result.metadataId,
    treasuryAddress: request.treasuryAddress ?? getConfiguredTreasuryAddress(),
    escrowAddress: null,
    beneficiaryAddress: request.recipientWalletAddress,
    mintAddress: request.mintAddress,
    amountAtomic: request.amountAtomic,
    startAt: request.startAt,
    endAt: request.endAt,
    vestingKind: request.vestingKind,
    txSignature: result.txId ?? null,
    state: "created",
    createdAt: new Date(),
  };
}

function mapStreamToConfirmedStatus(stream: Stream, scheduleId: string): Extract<StreamflowScheduleStatus, { state: "confirmed" }> {
  return {
    state: "confirmed",
    statusRaw: stream.type,
    scheduleId,
    txSignature: null,
    confirmedAt: fromUnixSeconds(stream.createdAt),
    beneficiaryAddress: stream.recipient,
    mintAddress: stream.mint,
    amountAtomic: BigInt(stream.depositedAmount.toString()),
    startAt: fromUnixSeconds(stream.start),
    endAt: fromUnixSeconds(stream.end),
    vestingKind: stream.type === "vesting" ? "token_vesting" : "token_lock",
    treasuryAddress: stream.sender,
    escrowAddress: stream.escrowTokens,
    lastCheckedAt: new Date(),
  };
}

function matchCandidate(
  request: StreamflowScheduleSearchRequest,
  candidate: Stream,
): { matchedBy: "vesting_reference" | "artifact_tuple"; candidate: Stream } | null {
  const byReference = candidate.name === request.vestingReference;
  const byTuple =
    candidate.recipient === request.expectedRecipientWalletAddress &&
    candidate.mint === request.expectedMintAddress &&
    BigInt(candidate.depositedAmount.toString()) === request.expectedAmountAtomic &&
    candidate.start === toUnixSeconds(request.expectedStartAt) &&
    candidate.end === toUnixSeconds(request.expectedEndAt) &&
    ((candidate.type === "vesting" && request.expectedVestingKind === "token_vesting") ||
      (candidate.type === "lock" && request.expectedVestingKind === "token_lock"));

  if (!byReference && !byTuple) {
    return null;
  }

  return {
    matchedBy: byReference ? "vesting_reference" : "artifact_tuple",
    candidate,
  };
}

function normalizeSdkError(error: unknown, context: Record<string, unknown>) {
  if (error instanceof StreamflowPayloadValidationError) {
    return error;
  }

  if (error instanceof StreamflowAdapterError) {
    return error;
  }

  const diagnostics = {
    ...context,
    serializedError: serializeUnknownError(error),
  };
  const diagnosticMessage = buildDiagnosticMessage(error);

  console.error(
    "[streamflow-sdk-error]",
    inspect(
      {
        message: diagnosticMessage,
        diagnostics,
      },
      { depth: 8, breakLength: 120 },
    ),
  );

  if (error instanceof ContractError) {
    return new StreamflowSdkRuntimeError(diagnosticMessage, {
      ...diagnostics,
      contractErrorCode: error.contractErrorCode ?? null,
    });
  }

  if (error instanceof Error) {
    return new StreamflowSdkRuntimeError(diagnosticMessage, diagnostics);
  }

  return new StreamflowSdkRuntimeError(diagnosticMessage, diagnostics);
}

export class RealStreamflowAdapter implements StreamflowAdapter {
  async prepareSchedule(request: StreamflowScheduleRequest): Promise<StreamflowPreparedSchedule> {
    try {
      return buildStreamflowPayloadFromSource(toPayloadSource(request)).expectedSnapshot;
    } catch (error) {
      throw normalizeSdkError(error, {
        operation: "prepareSchedule",
        vestingReference: request.vestingReference,
        vestingPositionId: request.vestingPositionId,
      });
    }
  }

  async createSchedule(request: StreamflowScheduleRequest): Promise<StreamflowCreatedSchedule> {
    try {
      assertExecutionEnabled();

      const { payload } = buildStreamflowPayloadFromSource(toPayloadSource(request));
      await assertSourceAccountReady(request);
      const client = getStreamflowClient();
      const sender = getStreamflowSdkSender();
      const createData = buildCreateStreamData(payload);
      const result = await client.create(createData, {
        sender,
        isNative: false,
      });

      return mapCreateResult(request, result);
    } catch (error) {
      throw normalizeSdkError(error, {
        operation: "createSchedule",
        vestingReference: request.vestingReference,
        vestingPositionId: request.vestingPositionId,
      });
    }
  }

  async getScheduleStatus(params: {
    vestingReference: string;
    scheduleId: string;
  }): Promise<StreamflowScheduleStatus> {
    try {
      const client = getStreamflowClient();
      const stream = await client.getOne({
        id: params.scheduleId,
      });

      if (stream.closed) {
        return {
          state: "cancelled",
          statusRaw: stream.type,
          scheduleId: params.scheduleId,
          reason: "Streamflow stream is closed.",
          lastCheckedAt: new Date(),
        };
      }

      return mapStreamToConfirmedStatus(stream, params.scheduleId);
    } catch (error) {
      throw normalizeSdkError(error, {
        operation: "getScheduleStatus",
        vestingReference: params.vestingReference,
        scheduleId: params.scheduleId,
      });
    }
  }

  async searchForSchedule(
    request: StreamflowScheduleSearchRequest,
  ): Promise<StreamflowScheduleSearchResult> {
    try {
      const client = getStreamflowClient();
      const searchResults = await client.searchStreams({
        mint: request.expectedMintAddress,
        sender: getConfiguredTreasuryAddress() ?? undefined,
        recipient: request.expectedRecipientWalletAddress,
      });

      const matchedCandidates = searchResults
        .map((entry) => {
          const account = entry.account as Stream;
          const publicKey =
            entry.publicKey instanceof PublicKey ? entry.publicKey.toBase58() : String(entry.publicKey);
          const matched = matchCandidate(request, account);

          if (!matched) {
            return null;
          }

          return {
            scheduleId: publicKey,
            matchedBy: matched.matchedBy,
            account,
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

      if (matchedCandidates.length === 0) {
        return {
          state: "not_found",
          searchedAt: new Date(),
        };
      }

      if (matchedCandidates.length > 1) {
        return {
          state: "ambiguous",
          candidateScheduleIds: matchedCandidates.map((entry) => entry.scheduleId),
          searchedAt: new Date(),
        };
      }

      const match = matchedCandidates[0];

      return {
        state: "match_found",
        matchedBy: match.matchedBy,
        scheduleId: match.scheduleId,
        beneficiaryAddress: match.account.recipient,
        mintAddress: match.account.mint,
        amountAtomic: BigInt(match.account.depositedAmount.toString()),
        startAt: fromUnixSeconds(match.account.start),
        endAt: fromUnixSeconds(match.account.end),
        vestingKind: match.account.type === "vesting" ? "token_vesting" : "token_lock",
        escrowAddress: match.account.escrowTokens,
        treasuryAddress: match.account.sender,
        txSignature: null,
        stateRaw: match.account.type,
        detectedAt: new Date(),
        searchedAt: new Date(),
      };
    } catch (error) {
      throw normalizeSdkError(error, {
        operation: "searchForSchedule",
        vestingReference: request.vestingReference,
      });
    }
  }
}
