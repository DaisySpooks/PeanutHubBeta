import { NextResponse } from "next/server";
import { z } from "zod";

const settlementSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("begin"),
    jobId: z.string().min(1),
  }),
  z.object({
    action: z.literal("complete"),
    jobId: z.string().min(1),
    solanaTxSignature: z.string().min(1).optional(),
    solanaConfirmedAt: z.string().datetime().optional(),
  }),
  z.object({
    action: z.literal("fail"),
    failureReason: z.string().min(1),
    jobId: z.string().min(1).optional(),
  }),
  z.object({
    action: z.literal("reconcile"),
    status: z.enum(["AWAITING_SIGNATURES", "SUBMITTED"]),
  }),
]);

export type InternalSettlementRouteDeps = {
  isAuthorizedInternalAdminRequest: (request: Request) => boolean;
  getInternalSettlementActor: () => string;
  getClientIpFromHeaders: (headers: Headers) => string;
  enforceRateLimit: (params: { key: string; limit: number; windowMs: number }) => Promise<unknown>;
  beginWithdrawalProcessing: (
    withdrawalId: string,
    jobId: string,
    actor: string,
  ) => Promise<unknown>;
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
  failWithdrawalProcessing: (params: {
    withdrawalId: string;
    failureReason: string;
    jobId?: string;
    triggeredBy: string;
  }) => Promise<unknown>;
  isMultisigPayoutEnabled: () => boolean;
  reconcileAwaitingSignaturesWithdrawal: (params: {
    withdrawalId: string;
    actor: string;
  }) => Promise<unknown>;
  reconcileSubmittedWithdrawal: (params: {
    withdrawalId: string;
    actor: string;
  }) => Promise<unknown>;
  logWithdrawalPayoutAttempt: (params: {
    withdrawalId: string;
    actor: string;
    jobId?: string;
    eventType: string;
    message: string;
    solanaTxSignature?: string;
  }) => Promise<unknown>;
};

function isNamedError(error: unknown, expectedName: string) {
  return error instanceof Error && error.name === expectedName;
}

export async function runInternalSettlementRoute(params: {
  request: Request;
  withdrawalId: string;
  deps: InternalSettlementRouteDeps;
}) {
  if (!params.deps.isAuthorizedInternalAdminRequest(params.request)) {
    return NextResponse.json({ error: "Unauthorized internal admin request." }, { status: 401 });
  }

  const actor = params.deps.getInternalSettlementActor();

  try {
    const body = settlementSchema.parse(await params.request.json());
    const clientIp = params.deps.getClientIpFromHeaders(params.request.headers);
    await params.deps.enforceRateLimit({
      key: `internal-admin-route:${body.action}:${clientIp}`,
      limit: 60,
      windowMs: 60_000,
    });

    switch (body.action) {
      case "begin": {
        const result = await params.deps.beginWithdrawalProcessing(
          params.withdrawalId,
          body.jobId,
          actor,
        );
        await params.deps.logWithdrawalPayoutAttempt({
          withdrawalId: params.withdrawalId,
          actor,
          jobId: body.jobId,
          eventType: "admin-route-begin-processing",
          message: "Internal admin API moved the withdrawal into PROCESSING.",
        });
        return NextResponse.json({ settlement: result });
      }
      case "complete": {
        const payout = await params.deps.confirmStoredWithdrawalPayout({
          withdrawalId: params.withdrawalId,
          jobId: body.jobId,
          actor,
          expectedSolanaTxSignature: body.solanaTxSignature,
        });
        const result = await params.deps.completeWithdrawalProcessing({
          withdrawalId: params.withdrawalId,
          jobId: body.jobId,
          solanaTxSignature: payout.solanaTxSignature,
          solanaConfirmedAt: payout.solanaConfirmedAt,
          triggeredBy: actor,
        });
        await params.deps.logWithdrawalPayoutAttempt({
          withdrawalId: params.withdrawalId,
          actor,
          jobId: body.jobId,
          eventType: "admin-route-complete-processing",
          message:
            "Internal admin API confirmed the stored on-chain payout and marked the withdrawal COMPLETED.",
          solanaTxSignature: payout.solanaTxSignature,
        });
        return NextResponse.json({ settlement: result });
      }
      case "fail": {
        const result = await params.deps.failWithdrawalProcessing({
          withdrawalId: params.withdrawalId,
          failureReason: body.failureReason,
          jobId: body.jobId,
          triggeredBy: actor,
        });
        await params.deps.logWithdrawalPayoutAttempt({
          withdrawalId: params.withdrawalId,
          actor,
          jobId: body.jobId,
          eventType: "admin-route-mark-failed",
          message: body.failureReason,
        });
        return NextResponse.json({ settlement: result });
      }
      case "reconcile": {
        if (!params.deps.isMultisigPayoutEnabled()) {
          return NextResponse.json({ error: "Multisig payout flow is disabled." }, { status: 400 });
        }

        const result =
          body.status === "AWAITING_SIGNATURES"
            ? await params.deps.reconcileAwaitingSignaturesWithdrawal({
                withdrawalId: params.withdrawalId,
                actor,
              })
            : await params.deps.reconcileSubmittedWithdrawal({
                withdrawalId: params.withdrawalId,
                actor,
              });

        if (!result) {
          return NextResponse.json(
            { error: "Withdrawal is already being reconciled by another worker." },
            { status: 409 },
          );
        }

        await params.deps.logWithdrawalPayoutAttempt({
          withdrawalId: params.withdrawalId,
          actor,
          eventType: "admin-route-reconcile",
          message: `Internal admin API reconciled withdrawal from ${body.status}.`,
        });

        return NextResponse.json({ settlement: result });
      }
    }
  } catch (error) {
    if (isNamedError(error, "RateLimitError")) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Too many requests." }, { status: 429 });
    }

    if (isNamedError(error, "WithdrawalPayoutError")) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to confirm payout." }, { status: 400 });
    }

    if (error instanceof Error && error.name === "RecoverableMultisigFlowError") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (isNamedError(error, "WithdrawalSettlementError")) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to process settlement." }, { status: 400 });
    }

    const message =
      error instanceof Error ? error.message : "Unable to process internal settlement request.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
