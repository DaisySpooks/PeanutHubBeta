import crypto from "node:crypto";
import { WithdrawalStatus } from "@prisma/client";
import { db } from "../db";
import {
  beginWithdrawalProcessing,
  completeWithdrawalProcessing,
  failWithdrawalProcessing,
  recordWithdrawalProcessingFailure,
  recoverStaleWithdrawalProcessing,
  requeueFailedWithdrawalForRetry,
  WithdrawalSettlementError,
} from "./settlement";
import {
  isRecoverableMultisigFlowError,
  prepareMultisigWithdrawal,
  reconcileAwaitingSignaturesWithdrawal,
  reconcileSubmittedWithdrawal,
} from "./multisig-flow";
import { isMultisigPayoutEnabled } from "./multisig-runtime";
import { submitAndConfirmWithdrawalPayout, WithdrawalPayoutError } from "./solana-payout";
import { logWithdrawalPayoutAttempt } from "./payout-attempts";
import {
  markWithdrawalWorkerHeartbeat,
  markWithdrawalWorkerRunCompleted,
  markWithdrawalWorkerRunFailed,
  markWithdrawalWorkerRunStarted,
} from "./worker-health";
import { classifyProcessingWithdrawalWorkerAction } from "./withdrawal-worker-processing-path";

const DEFAULT_POLL_INTERVAL_MS = 30_000;
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_RETRY_LIMIT = 3;
const DEFAULT_STALE_PROCESSING_MS = 5 * 60_000;
const DEFAULT_FAILED_RETRY_BACKOFF_MS = 10 * 60_000;
const DEFAULT_FAILED_REQUEUE_LIMIT = 3;

type WorkerPayoutMode = "mock" | "real" | "multisig" | "disabled";

export type WithdrawalWorkerOptions = {
  actor: string;
  payoutMode: WorkerPayoutMode;
  pollIntervalMs: number;
  batchSize: number;
  retryLimit: number;
  staleProcessingMs: number;
  failedRetryBackoffMs: number;
  failedRequeueLimit: number;
};

export type WithdrawalWorkerRunSummary = {
  checked: number;
  claimed: number;
  resumed: number;
  prepared: number;
  awaitingSignatures: number;
  submitted: number;
  staleRecovered: number;
  retriedFailed: number;
  completed: number;
  failed: number;
  deferred: number;
  skipped: number;
};

function getEnvNumber(name: string, fallback: number) {
  const rawValue = process.env[name];

  if (!rawValue) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getWithdrawalWorkerOptionsFromEnv(): WithdrawalWorkerOptions {
  const rawPayoutMode = process.env.WITHDRAWAL_WORKER_PAYOUT_MODE;
  const payoutMode =
    rawPayoutMode === "multisig"
      ? isMultisigPayoutEnabled()
        ? "multisig"
        : "disabled"
      : rawPayoutMode === "real" || rawPayoutMode === "mock"
        ? rawPayoutMode
        : "disabled";

  return {
    actor: process.env.WITHDRAWAL_WORKER_ACTOR_NAME || "withdrawal-worker",
    payoutMode,
    pollIntervalMs: getEnvNumber("WITHDRAWAL_WORKER_POLL_INTERVAL_MS", DEFAULT_POLL_INTERVAL_MS),
    batchSize: getEnvNumber("WITHDRAWAL_WORKER_BATCH_SIZE", DEFAULT_BATCH_SIZE),
    retryLimit: getEnvNumber("WITHDRAWAL_WORKER_RETRY_LIMIT", DEFAULT_RETRY_LIMIT),
    staleProcessingMs: getEnvNumber(
      "WITHDRAWAL_WORKER_STALE_PROCESSING_MS",
      DEFAULT_STALE_PROCESSING_MS,
    ),
    failedRetryBackoffMs: getEnvNumber(
      "WITHDRAWAL_WORKER_FAILED_RETRY_BACKOFF_MS",
      DEFAULT_FAILED_RETRY_BACKOFF_MS,
    ),
    failedRequeueLimit: getEnvNumber(
      "WITHDRAWAL_WORKER_FAILED_REQUEUE_LIMIT",
      DEFAULT_FAILED_REQUEUE_LIMIT,
    ),
  };
}

function isClaimConflictError(error: unknown) {
  return (
    error instanceof WithdrawalSettlementError &&
    (error.message.includes("cannot move to PROCESSING") ||
      error.message.includes("already claimed"))
  );
}

function buildMockSolanaSignature(withdrawalId: string, jobId: string) {
  return crypto
    .createHash("sha256")
    .update(`${withdrawalId}:${jobId}`)
    .digest("hex");
}

async function performPayout(
  withdrawalId: string,
  jobId: string,
  payoutMode: WorkerPayoutMode,
  actor?: string,
  attemptNumber?: number,
) {
  if (payoutMode === "real") {
    return submitAndConfirmWithdrawalPayout(withdrawalId, jobId, actor, attemptNumber);
  }

  if (payoutMode !== "mock") {
    throw new Error(
      "Withdrawal worker payout mode is disabled. Configure a real payout adapter or enable mock mode for non-production testing.",
    );
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Mock payout mode is blocked in production. Configure a real payout adapter before running the worker.",
    );
  }

  return {
    solanaTxSignature: buildMockSolanaSignature(withdrawalId, jobId),
    solanaConfirmedAt: new Date(),
  };
}

async function processClaimedWithdrawal(
  withdrawalId: string,
  jobId: string,
  options: WithdrawalWorkerOptions,
) {
  if (options.payoutMode === "multisig") {
    try {
      const prepared = await prepareMultisigWithdrawal({
        withdrawalId,
        jobId,
        actor: options.actor,
      });

      console.info(
        `[withdrawal-worker] prepared multisig payout for withdrawal ${withdrawalId} under proposal ${prepared.proposalId}`,
      );

      return "awaiting_signatures" as const;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown multisig preparation error.";

      console.error(
        `[withdrawal-worker] multisig preparation failed for withdrawal ${withdrawalId}: ${message}`,
      );

      await logWithdrawalPayoutAttempt({
        withdrawalId,
        actor: options.actor,
        jobId,
        eventType: "multisig-preparation-failed",
        message,
      });

      if (isRecoverableMultisigFlowError(error)) {
        await failWithdrawalProcessing({
          withdrawalId,
          failureReason: `Multisig preparation failed: ${message}`,
          jobId,
          triggeredBy: options.actor,
        });

        return "failed" as const;
      }

      throw error;
    }
  }

  for (let attempt = 1; attempt <= options.retryLimit; attempt += 1) {
    try {
      await logWithdrawalPayoutAttempt({
        withdrawalId,
        actor: options.actor,
        jobId,
        attemptNumber: attempt,
        eventType: "attempt-started",
        message: `Starting payout attempt ${attempt} of ${options.retryLimit}.`,
      });

      console.info(
        `[withdrawal-worker] processing withdrawal ${withdrawalId} attempt ${attempt}/${options.retryLimit} job ${jobId}`,
      );

      const payout = await performPayout(
        withdrawalId,
        jobId,
        options.payoutMode,
        options.actor,
        attempt,
      );

      await logWithdrawalPayoutAttempt({
        withdrawalId,
        actor: options.actor,
        jobId,
        attemptNumber: attempt,
        eventType: "attempt-confirmed",
        message: "On-chain payout confirmed.",
        solanaTxSignature: payout.solanaTxSignature,
      });

      await completeWithdrawalProcessing({
        withdrawalId,
        jobId,
        solanaTxSignature: payout.solanaTxSignature,
        solanaConfirmedAt: payout.solanaConfirmedAt,
        triggeredBy: options.actor,
      });

      console.info(
        `[withdrawal-worker] completed withdrawal ${withdrawalId} with signature ${payout.solanaTxSignature}`,
      );

      return "completed" as const;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown withdrawal processing error.";
      const isPostSubmissionFailure =
        error instanceof WithdrawalPayoutError && error.phase === "post_submission";

      console.error(
        `[withdrawal-worker] withdrawal ${withdrawalId} attempt ${attempt} failed: ${message}`,
      );

      await logWithdrawalPayoutAttempt({
        withdrawalId,
        actor: options.actor,
        jobId,
        attemptNumber: attempt,
        eventType: isPostSubmissionFailure ? "attempt-deferred" : "attempt-failed",
        message,
      });

      try {
        await recordWithdrawalProcessingFailure({
          withdrawalId,
          jobId,
          failureReason: message,
        });
      } catch (persistenceError) {
        const persistenceMessage =
          persistenceError instanceof Error
            ? persistenceError.message
            : "Unknown processing failure persistence error.";
        console.error(
          `[withdrawal-worker] could not persist processing failure note for ${withdrawalId}: ${persistenceMessage}`,
        );
      }

      if (attempt >= options.retryLimit) {
        if (isPostSubmissionFailure) {
          console.error(
            `[withdrawal-worker] leaving withdrawal ${withdrawalId} in PROCESSING after on-chain submission uncertainty; a future worker pass can safely retry confirmation`,
          );

          return "deferred" as const;
        }

        await failWithdrawalProcessing({
          withdrawalId,
          failureReason: `Worker exhausted ${options.retryLimit} attempts: ${message}`,
          jobId,
          triggeredBy: options.actor,
        });

        console.error(
          `[withdrawal-worker] marked withdrawal ${withdrawalId} as FAILED after exhausted retries`,
        );

        return "failed" as const;
      }
    }
  }

  return "failed" as const;
}

async function recoverStaleProcessingWithdrawals(options: WithdrawalWorkerOptions) {
  const cutoff = new Date(Date.now() - options.staleProcessingMs);
  const staleWithdrawals = await db.withdrawal.findMany({
    where: {
      status: WithdrawalStatus.PROCESSING,
      solanaTxSignature: null,
      multisigProposalId: null,
      updatedAt: {
        lt: cutoff,
      },
      jobId: {
        not: null,
      },
    },
    orderBy: {
      updatedAt: "asc",
    },
    take: options.batchSize,
    select: {
      id: true,
      jobId: true,
      status: true,
      multisigProposalId: true,
      solanaTxSignature: true,
      solanaTxBlockhash: true,
      solanaTxLastValidBlockHeight: true,
      updatedAt: true,
    },
  });

  let recovered = 0;

  for (const stale of staleWithdrawals) {
    const workerAction = classifyProcessingWithdrawalWorkerAction({
      status: stale.status,
      jobId: stale.jobId,
      multisigProposalId: stale.multisigProposalId,
      solanaTxSignature: stale.solanaTxSignature,
      solanaTxBlockhash: stale.solanaTxBlockhash,
      solanaTxLastValidBlockHeight: stale.solanaTxLastValidBlockHeight,
      updatedAt: stale.updatedAt,
      staleCutoff: cutoff,
    });

    if (workerAction !== "stale_recovery" || !stale.jobId) {
      continue;
    }

    try {
      await recoverStaleWithdrawalProcessing({
        withdrawalId: stale.id,
        jobId: stale.jobId,
        triggeredBy: options.actor,
        reason: `Worker recovered a stale PROCESSING claim after ${options.staleProcessingMs}ms without a submitted Solana transaction.`,
      });
      await logWithdrawalPayoutAttempt({
        withdrawalId: stale.id,
        actor: options.actor,
        jobId: stale.jobId,
        eventType: "stale-processing-recovered",
        message: "Recovered stale PROCESSING claim without an on-chain submission.",
      });
      recovered += 1;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown stale processing recovery error.";
      console.error(
        `[withdrawal-worker] could not recover stale withdrawal ${stale.id}: ${message}`,
      );
    }
  }

  return recovered;
}

async function requeueFailedWithdrawals(options: WithdrawalWorkerOptions) {
  const cutoff = new Date(Date.now() - options.failedRetryBackoffMs);
  const candidates = await db.withdrawal.findMany({
    where: {
      status: WithdrawalStatus.FAILED,
      solanaTxSignature: null,
      submittedTxSignature: null,
      updatedAt: {
        lt: cutoff,
      },
    },
    orderBy: {
      updatedAt: "asc",
    },
    take: options.batchSize,
    select: {
      id: true,
    },
  });

  let retried = 0;

  for (const candidate of candidates) {
    const failureCount = await db.withdrawalPayoutAttempt.count({
      where: {
        withdrawalId: candidate.id,
        eventType: "attempt-failed",
      },
    });

    if (failureCount >= options.failedRequeueLimit) {
      continue;
    }

    try {
      await requeueFailedWithdrawalForRetry({
        withdrawalId: candidate.id,
        triggeredBy: options.actor,
        note: `Worker requeued failed withdrawal for retry ${failureCount + 1} of ${options.failedRequeueLimit}.`,
      });
      await logWithdrawalPayoutAttempt({
        withdrawalId: candidate.id,
        actor: options.actor,
        attemptNumber: failureCount + 1,
        eventType: "failed-withdrawal-requeued",
        message: "Failed withdrawal returned to PENDING for another automated attempt.",
      });
      retried += 1;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown failed withdrawal requeue error.";
      console.error(
        `[withdrawal-worker] could not requeue failed withdrawal ${candidate.id}: ${message}`,
      );
    }
  }

  return retried;
}

async function reconcileAwaitingSignaturesWithdrawals(options: WithdrawalWorkerOptions) {
  if (options.payoutMode !== "multisig") {
    return { reconciled: 0, submitted: 0, completed: 0, failed: 0 };
  }

  const awaitingWithdrawals = await db.withdrawal.findMany({
    where: {
      status: WithdrawalStatus.AWAITING_SIGNATURES,
      manualReviewRequired: false,
      multisigProposalId: {
        not: null,
      },
      payoutReference: {
        not: null,
      },
      OR: [
        { nextReconcileAt: null },
        {
          nextReconcileAt: {
            lte: new Date(),
          },
        },
      ],
    },
    orderBy: {
      nextReconcileAt: "asc",
    },
    take: options.batchSize,
    select: {
      id: true,
    },
  });

  const summary = {
    reconciled: 0,
    submitted: 0,
    completed: 0,
    failed: 0,
  };

  for (const awaiting of awaitingWithdrawals) {
    try {
      const result = await reconcileAwaitingSignaturesWithdrawal({
        withdrawalId: awaiting.id,
        actor: options.actor,
      });

      if (!result) {
        continue;
      }

      summary.reconciled += 1;

      if (result.outcome === "submitted") {
        summary.submitted += 1;
      } else if (result.outcome === "failed") {
        summary.failed += 1;
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown AWAITING_SIGNATURES reconciliation error.";
      console.error(
        `[withdrawal-worker] could not reconcile awaiting-signatures withdrawal ${awaiting.id}: ${message}`,
      );
    }
  }

  return summary;
}

async function reconcileSubmittedWithdrawals(options: WithdrawalWorkerOptions) {
  if (options.payoutMode !== "multisig") {
    return { reconciled: 0, completed: 0 };
  }

  const submittedWithdrawals = await db.withdrawal.findMany({
    where: {
      status: WithdrawalStatus.SUBMITTED,
      manualReviewRequired: false,
      multisigProposalId: {
        not: null,
      },
      submittedTxSignature: {
        not: null,
      },
      OR: [
        { nextReconcileAt: null },
        {
          nextReconcileAt: {
            lte: new Date(),
          },
        },
      ],
    },
    orderBy: {
      nextReconcileAt: "asc",
    },
    take: options.batchSize,
    select: {
      id: true,
    },
  });

  const summary = {
    reconciled: 0,
    completed: 0,
  };

  for (const submitted of submittedWithdrawals) {
    try {
      const result = await reconcileSubmittedWithdrawal({
        withdrawalId: submitted.id,
        actor: options.actor,
      });

      if (!result) {
        continue;
      }

      summary.reconciled += 1;

      if (result.outcome === "completed") {
        summary.completed += 1;
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown SUBMITTED reconciliation error.";
      console.error(
        `[withdrawal-worker] could not reconcile submitted withdrawal ${submitted.id}: ${message}`,
      );
    }
  }

  return summary;
}

export async function runWithdrawalWorkerOnce(
  options: WithdrawalWorkerOptions,
): Promise<WithdrawalWorkerRunSummary> {
  await markWithdrawalWorkerRunStarted({
    actor: options.actor,
    currentMode: options.payoutMode,
  });

  try {
    const staleRecovered = await recoverStaleProcessingWithdrawals(options);
    const retriedFailed = await requeueFailedWithdrawals(options);
    const awaitingSummary = await reconcileAwaitingSignaturesWithdrawals(options);
    const submittedSummary = await reconcileSubmittedWithdrawals(options);
    const resumableWithdrawals = await db.withdrawal.findMany({
      where: {
        status: WithdrawalStatus.PROCESSING,
        jobId: {
          not: null,
        },
        solanaTxSignature: {
          not: null,
        },
        solanaTxBlockhash: {
          not: null,
        },
        solanaTxLastValidBlockHeight: {
          not: null,
        },
      },
      orderBy: {
        updatedAt: "asc",
      },
      take: options.batchSize,
    select: {
      id: true,
      jobId: true,
      status: true,
      multisigProposalId: true,
      solanaTxSignature: true,
      solanaTxBlockhash: true,
      solanaTxLastValidBlockHeight: true,
      updatedAt: true,
    },
  });

    const pendingWithdrawals = await db.withdrawal.findMany({
      where: {
        status: WithdrawalStatus.PENDING,
      },
      orderBy: {
        createdAt: "asc",
      },
      take: options.batchSize,
      select: {
        id: true,
      },
    });

    const summary: WithdrawalWorkerRunSummary = {
      checked:
        staleRecovered +
        retriedFailed +
        awaitingSummary.reconciled +
        submittedSummary.reconciled +
        resumableWithdrawals.length +
        pendingWithdrawals.length,
      claimed: 0,
      resumed: 0,
      prepared: 0,
      awaitingSignatures: awaitingSummary.reconciled,
      submitted: submittedSummary.reconciled,
      staleRecovered,
      retriedFailed,
      completed: awaitingSummary.completed + submittedSummary.completed,
      failed: awaitingSummary.failed,
      deferred: 0,
      skipped: 0,
    };

    for (const resumable of resumableWithdrawals) {
      const workerAction = classifyProcessingWithdrawalWorkerAction({
        status: resumable.status,
        jobId: resumable.jobId,
        multisigProposalId: resumable.multisigProposalId,
        solanaTxSignature: resumable.solanaTxSignature,
        solanaTxBlockhash: resumable.solanaTxBlockhash,
        solanaTxLastValidBlockHeight: resumable.solanaTxLastValidBlockHeight,
        updatedAt: resumable.updatedAt,
        staleCutoff: new Date(Date.now() - options.staleProcessingMs),
      });

      if (workerAction !== "resume_payout" || !resumable.jobId) {
        continue;
      }

      summary.resumed += 1;

      const result = await processClaimedWithdrawal(resumable.id, resumable.jobId, options);

      if (result === "completed") {
        summary.completed += 1;
      } else if (result === "deferred") {
        summary.deferred += 1;
      } else {
        summary.failed += 1;
      }
    }

    for (const pending of pendingWithdrawals) {
      const jobId = `${options.actor}-${crypto.randomUUID()}`;

      try {
        await beginWithdrawalProcessing(pending.id, jobId, options.actor);
        summary.claimed += 1;
      } catch (error) {
        if (isClaimConflictError(error)) {
          summary.skipped += 1;
          console.info(
            `[withdrawal-worker] skipped withdrawal ${pending.id} because another worker already claimed it`,
          );
          continue;
        }

        throw error;
      }

      const result = await processClaimedWithdrawal(pending.id, jobId, options);

      if (result === "completed") {
        summary.completed += 1;
      } else if (result === "awaiting_signatures") {
        summary.prepared += 1;
      } else if (result === "deferred") {
        summary.deferred += 1;
      } else {
        summary.failed += 1;
      }
    }

    await markWithdrawalWorkerRunCompleted({
      actor: options.actor,
      summary: JSON.stringify(summary),
    });

    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown worker run error.";
    await markWithdrawalWorkerRunFailed({
      actor: options.actor,
      error: message,
    });
    throw error;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function runWithdrawalWorkerLoop(options: WithdrawalWorkerOptions) {
  console.info(
    `[withdrawal-worker] starting loop actor=${options.actor} batch=${options.batchSize} intervalMs=${options.pollIntervalMs} payoutMode=${options.payoutMode}`,
  );

  while (true) {
    try {
      await markWithdrawalWorkerHeartbeat({
        actor: options.actor,
        currentMode: options.payoutMode,
      });
      const summary = await runWithdrawalWorkerOnce(options);
      console.info(
        `[withdrawal-worker] loop summary checked=${summary.checked} claimed=${summary.claimed} resumed=${summary.resumed} prepared=${summary.prepared} awaitingSignatures=${summary.awaitingSignatures} submitted=${summary.submitted} staleRecovered=${summary.staleRecovered} retriedFailed=${summary.retriedFailed} completed=${summary.completed} failed=${summary.failed} deferred=${summary.deferred} skipped=${summary.skipped}`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown worker loop error.";
      console.error(`[withdrawal-worker] loop failure: ${message}`);
      await markWithdrawalWorkerRunFailed({
        actor: options.actor,
        error: message,
      });
    }

    await sleep(options.pollIntervalMs);
  }
}
