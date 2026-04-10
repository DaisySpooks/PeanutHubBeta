export type CompleteSettlementActionDeps = {
  enforceRateLimit: (action: string) => Promise<unknown>;
  confirmStoredWithdrawalPayout: (params: {
    withdrawalId: string;
    jobId: string;
    actor: string;
    expectedSolanaTxSignature?: string;
  }) => Promise<{
    solanaTxSignature: string;
    solanaConfirmedAt: Date;
  }>;
  completeWithdrawalProcessing: (params: {
    withdrawalId: string;
    jobId: string;
    solanaTxSignature: string;
    solanaConfirmedAt: Date;
    triggeredBy: string;
  }) => Promise<unknown>;
  logWithdrawalPayoutAttempt: (params: {
    withdrawalId: string;
    actor: string;
    jobId: string;
    eventType: string;
    message: string;
    solanaTxSignature: string;
  }) => Promise<unknown>;
  revalidatePath: (path: string) => void;
  redirect: (location: string) => never;
};

function isNamedError(error: unknown, expectedName: string) {
  return error instanceof Error && error.name === expectedName;
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

export async function runCompleteSettlementAction(params: {
  actor: string;
  withdrawalId: string;
  jobId: string;
  solanaTxSignature: string;
  deps: CompleteSettlementActionDeps;
}) {
  try {
    await params.deps.enforceRateLimit("complete");
    const payout = await params.deps.confirmStoredWithdrawalPayout({
      withdrawalId: params.withdrawalId,
      jobId: params.jobId,
      actor: params.actor,
      expectedSolanaTxSignature: params.solanaTxSignature || undefined,
    });

    await params.deps.completeWithdrawalProcessing({
      withdrawalId: params.withdrawalId,
      jobId: params.jobId,
      solanaTxSignature: payout.solanaTxSignature,
      solanaConfirmedAt: payout.solanaConfirmedAt,
      triggeredBy: params.actor,
    });

    await params.deps.logWithdrawalPayoutAttempt({
      withdrawalId: params.withdrawalId,
      actor: params.actor,
      jobId: params.jobId,
      eventType: "admin-complete-processing",
      message:
        "Internal admin confirmed the stored on-chain payout and marked the withdrawal COMPLETED.",
      solanaTxSignature: payout.solanaTxSignature,
    });

    params.deps.revalidatePath("/internal/admin/settlements");
    params.deps.redirect("/internal/admin/settlements?flash=complete-success");
  } catch (error) {
    if (isRedirectControlFlow(error)) {
      throw error;
    }

    if (isNamedError(error, "WithdrawalPayoutError")) {
      params.deps.redirect("/internal/admin/settlements?flash=complete-error");
    }

    if (isNamedError(error, "WithdrawalSettlementError")) {
      params.deps.redirect("/internal/admin/settlements?flash=complete-error");
    }

    params.deps.redirect("/internal/admin/settlements?flash=action-error");
  }
}
