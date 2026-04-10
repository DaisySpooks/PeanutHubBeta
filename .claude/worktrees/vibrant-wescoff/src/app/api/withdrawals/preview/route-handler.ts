import { NextResponse } from "next/server";
import { z } from "zod";
import { WithdrawalValidationError } from "@/lib/withdrawals/withdrawal-validation-error";

const withdrawalPreviewSchema = z.object({
  vestingPositionId: z.string().min(1),
  amount: z.string().optional(),
});

export type WithdrawalPreviewRouteDeps = {
  getProtectedRouteResult: () => Promise<
    | { status: "unauthenticated" }
    | { status: "forbidden" }
    | {
        status: "authorized";
        user: {
          id: string;
          walletAddress: string;
        };
      }
  >;
  assertTrustedOrigin: (request: Request) => void;
  enforceRateLimit: (params: { key: string; limit: number; windowMs: number }) => Promise<unknown>;
  getWithdrawalPreview: (
    user: { id: string; walletAddress: string },
    vestingPositionId: string,
    amount?: string,
  ) => Promise<unknown>;
};

function isRateLimitError(error: unknown): error is Error & { retryAfterSeconds: number } {
  return (
    error instanceof Error &&
    "retryAfterSeconds" in error &&
    typeof error.retryAfterSeconds === "number"
  );
}

export function createWithdrawalPreviewRouteHandler(deps: WithdrawalPreviewRouteDeps) {
  return async function POST(request: Request) {
    const result = await deps.getProtectedRouteResult();

    if (result.status === "unauthenticated") {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    if (result.status === "forbidden") {
      return NextResponse.json({ error: "Required collection ownership not found." }, { status: 403 });
    }

    try {
      deps.assertTrustedOrigin(request);
      await deps.enforceRateLimit({
        key: `withdrawal-preview:${result.user.id}`,
        limit: 30,
        windowMs: 60_000,
      });

      const body = withdrawalPreviewSchema.parse(await request.json());
      const preview = await deps.getWithdrawalPreview(result.user, body.vestingPositionId, body.amount);

      return NextResponse.json({ preview });
    } catch (error) {
      if (isRateLimitError(error)) {
        return NextResponse.json(
          { error: error.message },
          {
            status: 429,
            headers: {
              "Retry-After": String(error.retryAfterSeconds),
            },
          },
        );
      }

      if (error instanceof Error && error.message === "Cross-site request blocked.") {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }

      if (error instanceof WithdrawalValidationError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({ error: "Unable to preview withdrawal." }, { status: 500 });
    }
  };
}
