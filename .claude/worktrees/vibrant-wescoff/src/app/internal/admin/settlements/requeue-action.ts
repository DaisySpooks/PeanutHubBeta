export type RequeueSettlementActionDeps = {
  enforceRateLimit: (action: string) => Promise<void>;
  requeueFailedWithdrawalForRetry: (params: {
    withdrawalId: string;
    triggeredBy: string;
    note: string;
  }) => Promise<unknown>;
  logWithdrawalPayoutAttempt: (params: {
    withdrawalId: string;
    actor: string;
    eventType: string;
    message: string;
  }) => Promise<void>;
  revalidatePath: (path: string) => void;
  redirect: (location: string) => never;
};

function isSettlementError(error: unknown): error is Error {
  return error instanceof Error && error.name === "WithdrawalSettlementError";
}

function isRedirectControlFlow(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "RedirectSignal" ||
      ("digest" in error &&
        typeof (error as { digest?: unknown }).digest === "string" &&
        (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")))
  );
}

export async function runRequeueFailedSettlementAction(params: {
  actor: string;
  withdrawalId: string;
  note: string;
  deps: RequeueSettlementActionDeps;
}) {
  const auditNote =
    params.note.trim() || "Internal admin requeued the failed withdrawal for a controlled retry.";

  try {
    await params.deps.enforceRateLimit("requeue");
    await params.deps.requeueFailedWithdrawalForRetry({
      withdrawalId: params.withdrawalId,
      triggeredBy: params.actor,
      note: auditNote,
    });

    await params.deps.logWithdrawalPayoutAttempt({
      withdrawalId: params.withdrawalId,
      actor: params.actor,
      eventType: "manual-requeue",
      message: auditNote,
    });

    params.deps.revalidatePath("/internal/admin/settlements");
    params.deps.redirect("/internal/admin/settlements?flash=requeue-success");
  } catch (error) {
    if (isRedirectControlFlow(error)) {
      throw error;
    }

    if (isSettlementError(error)) {
      params.deps.redirect("/internal/admin/settlements?flash=requeue-error");
    }

    params.deps.redirect("/internal/admin/settlements?flash=action-error");
  }
}
