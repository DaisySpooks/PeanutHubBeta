import { NextResponse } from "next/server";
import { z } from "zod";
import { createExchange, ExchangeValidationError } from "@/lib/exchanges/create-exchange";
import { getExchangeDashboardData } from "@/lib/exchanges/queries";
import { getProtectedRouteResult } from "@/lib/nft-gating/require-collection-access";
import { assertTrustedOrigin } from "@/lib/security/request-meta";
import { enforceRateLimit, RateLimitError } from "@/lib/security/rate-limit";

const createExchangeSchema = z.object({
  nutshellAmount: z.number().int().positive(),
});

export async function GET() {
  const result = await getProtectedRouteResult();

  if (result.status === "unauthenticated") {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  if (result.status === "forbidden") {
    return NextResponse.json({ error: "Required collection ownership not found." }, { status: 403 });
  }

  const data = await getExchangeDashboardData(result.user.id);

  return NextResponse.json({
    user: {
      walletAddress: result.user.walletAddress,
      nutshellBalance: data.nutshellBalance,
    },
    config: data.config,
    exchanges: data.exchanges,
  });
}

export async function POST(request: Request) {
  const result = await getProtectedRouteResult();

  if (result.status === "unauthenticated") {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  if (result.status === "forbidden") {
    return NextResponse.json({ error: "Required collection ownership not found." }, { status: 403 });
  }

  try {
    assertTrustedOrigin(request);
    await enforceRateLimit({
      key: `exchange-create:${result.user.id}`,
      limit: 10,
      windowMs: 60_000,
    });

    const { nutshellAmount } = createExchangeSchema.parse(await request.json());
    const exchange = await createExchange(result.user, nutshellAmount);

    return NextResponse.json({ exchange }, { status: 201 });
  } catch (error) {
    if (error instanceof RateLimitError) {
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

    if (error instanceof ExchangeValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: "Unable to create exchange." }, { status: 500 });
  }
}
