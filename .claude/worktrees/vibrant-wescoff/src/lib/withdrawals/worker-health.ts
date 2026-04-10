import { db } from "../db";

function truncateMessage(message?: string | null) {
  if (!message) {
    return null;
  }

  return message.slice(0, 1_000);
}

export async function markWithdrawalWorkerRunStarted(params: {
  actor: string;
  currentMode: string;
}) {
  const now = new Date();

  await db.withdrawalWorkerStatus.upsert({
    where: {
      actor: params.actor,
    },
    update: {
      currentMode: params.currentMode,
      isRunning: true,
      lastHeartbeatAt: now,
      lastRunStartedAt: now,
      lastError: null,
    },
    create: {
      actor: params.actor,
      currentMode: params.currentMode,
      isRunning: true,
      lastHeartbeatAt: now,
      lastRunStartedAt: now,
      lastError: null,
    },
  });
}

export async function markWithdrawalWorkerRunCompleted(params: {
  actor: string;
  summary: string;
}) {
  const now = new Date();

  await db.withdrawalWorkerStatus.upsert({
    where: {
      actor: params.actor,
    },
    update: {
      isRunning: false,
      lastHeartbeatAt: now,
      lastRunCompletedAt: now,
      lastSummary: params.summary,
      lastError: null,
    },
    create: {
      actor: params.actor,
      isRunning: false,
      lastHeartbeatAt: now,
      lastRunCompletedAt: now,
      lastSummary: params.summary,
    },
  });
}

export async function markWithdrawalWorkerHeartbeat(params: {
  actor: string;
  currentMode: string;
}) {
  await db.withdrawalWorkerStatus.upsert({
    where: {
      actor: params.actor,
    },
    update: {
      currentMode: params.currentMode,
      lastHeartbeatAt: new Date(),
    },
    create: {
      actor: params.actor,
      currentMode: params.currentMode,
      lastHeartbeatAt: new Date(),
    },
  });
}

export async function markWithdrawalWorkerRunFailed(params: {
  actor: string;
  error: string;
}) {
  const now = new Date();

  await db.withdrawalWorkerStatus.upsert({
    where: {
      actor: params.actor,
    },
    update: {
      isRunning: false,
      lastHeartbeatAt: now,
      lastRunCompletedAt: now,
      lastError: truncateMessage(params.error),
    },
    create: {
      actor: params.actor,
      isRunning: false,
      lastHeartbeatAt: now,
      lastRunCompletedAt: now,
      lastError: truncateMessage(params.error),
    },
  });
}
