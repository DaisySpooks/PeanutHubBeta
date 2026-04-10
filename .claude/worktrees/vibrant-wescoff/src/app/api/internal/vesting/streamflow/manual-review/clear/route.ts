import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAuthorizedInternalAdminActor } from "@/lib/internal-auth";
import { enforceRateLimit, RateLimitError } from "@/lib/security/rate-limit";
import { assertTrustedOrigin, getClientIpFromHeaders } from "@/lib/security/request-meta";
import { clearVestingStreamflowManualReview } from "@/lib/vesting/streamflow-reconciliation";

const requestSchema = z.object({
  vestingPositionId: z.string().min(1),
  operatorNote: z.string().trim().max(1_000).optional(),
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
      key: `internal-admin-streamflow-manual-review-clear:${clientIp}`,
      limit: 20,
      windowMs: 60_000,
    });

    const body = requestSchema.parse(await request.json());
    const vesting = await db.vestingPosition.findUnique({
      where: {
        id: body.vestingPositionId,
      },
      select: {
        id: true,
        streamflowManualReviewRequired: true,
        streamflowManualReviewReason: true,
        streamflowLifecycleStatus: true,
        streamflowReconciliationAttempts: {
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
          select: {
            id: true,
            attemptType: true,
            result: true,
            createdAt: true,
          },
        },
      },
    });

    if (!vesting) {
      return NextResponse.json({ error: "Vesting position not found." }, { status: 404 });
    }

    if (!vesting.streamflowManualReviewRequired) {
      return NextResponse.json(
        { error: "Manual review is not currently flagged for this vesting position." },
        { status: 409 },
      );
    }

    const latestAttempt = vesting.streamflowReconciliationAttempts[0] ?? null;
    if (!latestAttempt || latestAttempt.result !== "matched" || vesting.streamflowLifecycleStatus !== "matched") {
      return NextResponse.json(
        {
          error:
            "Manual review can only be cleared after the latest mocked reconciliation attempt succeeds with a matched result.",
        },
        { status: 409 },
      );
    }

    const cleared = await clearVestingStreamflowManualReview({
      vestingPositionId: vesting.id,
      clearedBy: actor,
      latestMatchedAttemptId: latestAttempt.id,
      previousManualReviewReason: vesting.streamflowManualReviewReason,
      operatorNote: body.operatorNote ?? null,
    });

    return NextResponse.json({
      vestingPositionId: vesting.id,
      clearedBy: actor,
      clearedAt: cleared.clearedAt.toISOString(),
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
      return NextResponse.json({ error: "Invalid manual-review clear request." }, { status: 400 });
    }

    const message =
      error instanceof Error ? error.message : "Unable to clear Streamflow manual review.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
