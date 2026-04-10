"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clientEnv } from "@/lib/config/client-env";
import { serverEnv } from "@/lib/config/server-env";
import { getInternalAdminSession } from "@/lib/internal-auth";
import { getServerActionClientIp } from "@/lib/security/request-meta";
import { enforceRateLimit, RateLimitError } from "@/lib/security/rate-limit";
import { isMultisigPayoutEnabled } from "@/lib/withdrawals/multisig-runtime";
import {
  beginWithdrawalProcessing,
  completeWithdrawalProcessing,
  failWithdrawalProcessing,
  requeueFailedWithdrawalForRetry,
  WithdrawalSettlementError,
} from "@/lib/withdrawals/settlement";
import { logWithdrawalPayoutAttempt } from "@/lib/withdrawals/payout-attempts";
import { confirmStoredWithdrawalPayout } from "@/lib/withdrawals/solana-payout";
import {
  reconcileAwaitingSignaturesWithdrawal,
  reconcileSubmittedWithdrawal,
} from "@/lib/withdrawals/multisig-flow";
import { runCompleteSettlementAction } from "./complete-action";
import { runIssueNutshellRewardsAction } from "./issue-rewards-action";
import { runReconcileMultisigSettlementAction } from "./reconcile-action";
import { runRequeueFailedSettlementAction } from "./requeue-action";

async function requireInternalAdminActor() {
  const session = await getInternalAdminSession();

  if (!session) {
    redirect("/internal/admin/login");
  }

  return session.actor;
}

async function enforceInternalAdminActionRateLimit(action: string) {
  const clientIp = await getServerActionClientIp();

  await enforceRateLimit({
    key: `internal-admin-action:${action}:${clientIp}`,
    limit: 30,
    windowMs: 60_000,
  });
}

export async function beginSettlementAction(formData: FormData) {
  const actor = await requireInternalAdminActor();
  const withdrawalId = String(formData.get("withdrawalId") ?? "");
  const jobId = String(formData.get("jobId") ?? "");

  try {
    await enforceInternalAdminActionRateLimit("begin");
    await beginWithdrawalProcessing(withdrawalId, jobId, actor);
    await logWithdrawalPayoutAttempt({
      withdrawalId,
      actor,
      jobId,
      eventType: "admin-begin-processing",
      message: "Internal admin manually moved the withdrawal into PROCESSING.",
    });
    revalidatePath("/internal/admin/settlements");
    redirect("/internal/admin/settlements?flash=begin-success");
  } catch (error) {
    if (error instanceof RateLimitError) {
      redirect("/internal/admin/settlements?flash=action-error");
    }

    if (error instanceof WithdrawalSettlementError) {
      redirect("/internal/admin/settlements?flash=begin-error");
    }

    redirect("/internal/admin/settlements?flash=action-error");
  }
}

export async function completeSettlementAction(formData: FormData) {
  const actor = await requireInternalAdminActor();
  const withdrawalId = String(formData.get("withdrawalId") ?? "");
  const jobId = String(formData.get("jobId") ?? "");
  const solanaTxSignature = String(formData.get("solanaTxSignature") ?? "");

  await runCompleteSettlementAction({
    actor,
    withdrawalId,
    jobId,
    solanaTxSignature,
    deps: {
      enforceRateLimit: enforceInternalAdminActionRateLimit,
      confirmStoredWithdrawalPayout,
      completeWithdrawalProcessing,
      logWithdrawalPayoutAttempt,
      revalidatePath,
      redirect,
    },
  });
}

export async function failSettlementAction(formData: FormData) {
  const actor = await requireInternalAdminActor();
  const withdrawalId = String(formData.get("withdrawalId") ?? "");
  const failureReason = String(formData.get("failureReason") ?? "");
  const jobIdValue = String(formData.get("jobId") ?? "");

  try {
    await enforceInternalAdminActionRateLimit("fail");
    await failWithdrawalProcessing({
      withdrawalId,
      failureReason,
      jobId: jobIdValue || undefined,
      triggeredBy: actor,
    });
    await logWithdrawalPayoutAttempt({
      withdrawalId,
      actor,
      jobId: jobIdValue || undefined,
      eventType: "admin-mark-failed",
      message: failureReason || "Internal admin marked the withdrawal FAILED.",
    });
    revalidatePath("/internal/admin/settlements");
    redirect("/internal/admin/settlements?flash=fail-success");
  } catch (error) {
    if (error instanceof RateLimitError) {
      redirect("/internal/admin/settlements?flash=action-error");
    }

    if (error instanceof WithdrawalSettlementError) {
      redirect("/internal/admin/settlements?flash=fail-error");
    }

    redirect("/internal/admin/settlements?flash=action-error");
  }
}

export async function requeueFailedSettlementAction(formData: FormData) {
  const actor = await requireInternalAdminActor();
  const withdrawalId = String(formData.get("withdrawalId") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  await runRequeueFailedSettlementAction({
    actor,
    withdrawalId,
    note,
    deps: {
      enforceRateLimit: enforceInternalAdminActionRateLimit,
      requeueFailedWithdrawalForRetry,
      logWithdrawalPayoutAttempt,
      revalidatePath,
      redirect,
    },
  });
}

export async function reconcileMultisigSettlementAction(formData: FormData) {
  const actor = await requireInternalAdminActor();
  const withdrawalId = String(formData.get("withdrawalId") ?? "");
  const status = String(formData.get("status") ?? "");

  await runReconcileMultisigSettlementAction({
    actor,
    withdrawalId,
    status,
    deps: {
      enforceRateLimit: enforceInternalAdminActionRateLimit,
      isMultisigPayoutEnabled,
      reconcileAwaitingSignaturesWithdrawal,
      reconcileSubmittedWithdrawal,
      revalidatePath,
      redirect,
    },
  });
}

export async function issueNutshellRewardsAction(formData: FormData) {
  await requireInternalAdminActor();
  const walletAddress = String(formData.get("walletAddress") ?? "").trim();
  const amount = String(formData.get("amount") ?? "").trim();
  const reason = String(formData.get("reason") ?? "ADMIN_CREDIT").trim();
  const note = String(formData.get("note") ?? "");

  await runIssueNutshellRewardsAction({
    adminApiKey: serverEnv.INTERNAL_ADMIN_API_KEY,
    walletAddress,
    amount,
    reason,
    note,
    appUrl: clientEnv.NEXT_PUBLIC_APP_URL,
    deps: {
      enforceRateLimit: enforceInternalAdminActionRateLimit,
      fetch,
      revalidatePath,
      redirect,
    },
  });
}
