import { NextResponse } from "next/server";
import { z } from "zod";

const issueRewardSchema = z.object({
  walletAddress: z.string().min(1),
  amount: z.number().int().positive(),
  reason: z.enum(["ADMIN_CREDIT", "DISCORD_REWARD"]).default("ADMIN_CREDIT"),
  note: z.string().trim().min(1).optional(),
});

export type InternalRewardsIssueRouteDeps = {
  isAuthorizedInternalAdminRequest: (request: Request) => boolean;
  getInternalSettlementActor: () => string;
  getClientIpFromHeaders: (headers: Headers) => string;
  enforceRateLimit: (params: { key: string; limit: number; windowMs: number }) => Promise<unknown>;
  issueNutshellReward: (params: {
    walletAddress: string;
    amount: number;
    reason: "ADMIN_CREDIT" | "DISCORD_REWARD";
    note?: string;
    triggeredBy: string;
  }) => Promise<unknown>;
};

function isNamedError(error: unknown, expectedName: string) {
  return error instanceof Error && error.name === expectedName;
}

export async function runInternalRewardsIssueRoute(params: {
  request: Request;
  deps: InternalRewardsIssueRouteDeps;
}) {
  if (!params.deps.isAuthorizedInternalAdminRequest(params.request)) {
    return NextResponse.json({ error: "Unauthorized internal admin request." }, { status: 401 });
  }

  try {
    const body = issueRewardSchema.parse(await params.request.json());
    const actor = params.deps.getInternalSettlementActor();
    const clientIp = params.deps.getClientIpFromHeaders(params.request.headers);

    await params.deps.enforceRateLimit({
      key: `internal-admin-route:issue-nutshell:${clientIp}`,
      limit: 60,
      windowMs: 60_000,
    });

    const issuance = await params.deps.issueNutshellReward({
      walletAddress: body.walletAddress,
      amount: body.amount,
      reason: body.reason,
      note: body.note,
      triggeredBy: actor,
    });

    return NextResponse.json({ issuance }, { status: 201 });
  } catch (error) {
    if (isNamedError(error, "RateLimitError")) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Too many requests." },
        { status: 429 },
      );
    }

    if (error instanceof z.ZodError || isNamedError(error, "NutshellIssuanceValidationError")) {
      return NextResponse.json(
        {
          error:
            error instanceof z.ZodError
              ? error.issues[0]?.message ?? "Invalid reward issuance request."
              : error instanceof Error
                ? error.message
                : "Invalid reward issuance request.",
        },
        { status: 400 },
      );
    }

    if (isNamedError(error, "NutshellSupplyCapExceededError")) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Reward cap exceeded." }, { status: 400 });
    }

    if (isNamedError(error, "NutshellIssuanceUserNotFoundError")) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "User not found for reward issuance." },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to issue Nutshell rewards at this time.",
      },
      { status: 500 },
    );
  }
}
