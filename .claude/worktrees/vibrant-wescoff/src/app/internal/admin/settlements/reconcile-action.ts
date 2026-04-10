export type ReconcileSettlementActionDeps = {
  enforceRateLimit: (action: string) => Promise<unknown>;
  isMultisigPayoutEnabled: () => boolean;
  reconcileAwaitingSignaturesWithdrawal: (params: {
    withdrawalId: string;
    actor: string;
  }) => Promise<unknown>;
  reconcileSubmittedWithdrawal: (params: {
    withdrawalId: string;
    actor: string;
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

export async function runReconcileMultisigSettlementAction(params: {
  actor: string;
  withdrawalId: string;
  status: string;
  deps: ReconcileSettlementActionDeps;
}) {
  try {
    await params.deps.enforceRateLimit("reconcile");

    if (!params.deps.isMultisigPayoutEnabled()) {
      params.deps.redirect("/internal/admin/settlements?flash=reconcile-error");
    }

    if (params.status === "AWAITING_SIGNATURES") {
      const result = await params.deps.reconcileAwaitingSignaturesWithdrawal({
        withdrawalId: params.withdrawalId,
        actor: params.actor,
      });

      if (!result) {
        params.deps.redirect("/internal/admin/settlements?flash=reconcile-error");
      }
    } else if (params.status === "SUBMITTED") {
      const result = await params.deps.reconcileSubmittedWithdrawal({
        withdrawalId: params.withdrawalId,
        actor: params.actor,
      });

      if (!result) {
        params.deps.redirect("/internal/admin/settlements?flash=reconcile-error");
      }
    } else {
      params.deps.redirect("/internal/admin/settlements?flash=reconcile-error");
    }

    params.deps.revalidatePath("/internal/admin/settlements");
    params.deps.redirect("/internal/admin/settlements?flash=reconcile-success");
  } catch (error) {
    if (isRedirectControlFlow(error)) {
      throw error;
    }

    if (isNamedError(error, "RecoverableMultisigFlowError")) {
      params.deps.redirect("/internal/admin/settlements?flash=reconcile-error");
    }

    params.deps.redirect("/internal/admin/settlements?flash=action-error");
  }
}
