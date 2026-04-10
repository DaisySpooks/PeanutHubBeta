import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthorizedInternalAdminActor } from "@/lib/internal-auth";
import { enforceRateLimit, RateLimitError } from "@/lib/security/rate-limit";
import { assertTrustedOrigin, getClientIpFromHeaders } from "@/lib/security/request-meta";
import {
  StreamflowCreateEligibilityError,
  StreamflowCreateExecutionGuardError,
  createStreamflowScheduleForVestingPosition,
} from "@/lib/vesting/streamflow-create";

const requestSchema = z.object({
  vestingPositionId: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    assertTrustedOrigin(request);

    const actor = await getAuthorizedInternalAdminActor(request);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized internal admin request." }, { status: 401 });
    }

    const clientIp = getClientIpFromHeaders(request.headers);
    await enforceRateLimit({
      key: `internal-admin-streamflow-create:${clientIp}`,
      limit: 10,
      windowMs: 60_000,
    });

    const body = requestSchema.parse(await request.json());
    const result = await createStreamflowScheduleForVestingPosition({
      vestingPositionId: body.vestingPositionId,
      triggeredBy: actor,
    });

    return NextResponse.json({
      trigger: "internal-admin-streamflow-create",
      vestingPositionId: body.vestingPositionId,
      actor,
      result,
    });
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

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid Streamflow create request." }, { status: 400 });
    }

    if (error instanceof StreamflowCreateExecutionGuardError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    if (error instanceof StreamflowCreateEligibilityError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }

    const message =
      error instanceof Error ? error.message : "Unable to execute guarded Streamflow create.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
