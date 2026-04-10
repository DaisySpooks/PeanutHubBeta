import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthorizedInternalAdminActor } from "@/lib/internal-auth";
import { enforceRateLimit, RateLimitError } from "@/lib/security/rate-limit";
import { assertTrustedOrigin, getClientIpFromHeaders } from "@/lib/security/request-meta";
import {
  InMemoryMockStreamflowObservedArtifactSource,
  type MockStreamflowObservedArtifact,
} from "@/lib/vesting/mock-streamflow-observed-artifacts";
import {
  reconcileEligibleVestingPositionsWithMockStreamflow,
  reconcileVestingPositionWithMockStreamflow,
} from "@/lib/vesting/streamflow-reconcile";

const artifactSchema = z.object({
  artifactId: z.string().min(1),
  vestingReference: z.string().min(1).nullable().optional(),
  clientCorrelationId: z.string().min(1).nullable().optional(),
  scheduleId: z.string().min(1),
  beneficiaryAddress: z.string().min(1),
  mintAddress: z.string().min(1),
  amountAtomic: z.string().regex(/^\d+$/),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  vestingKind: z.enum(["token_lock", "token_vesting"]),
  treasuryAddress: z.string().min(1).nullable().optional(),
  escrowAddress: z.string().min(1).nullable().optional(),
  txSignature: z.string().min(1).nullable().optional(),
  observedState: z.enum(["created", "pending", "cancelled", "unknown"]).default("created"),
  observedAt: z.string().datetime(),
});

const requestSchema = z.discriminatedUnion("scope", [
  z.object({
    scope: z.literal("one"),
    vestingPositionId: z.string().min(1),
    force: z.boolean().optional(),
    mockArtifacts: z.array(artifactSchema).default([]),
  }),
  z.object({
    scope: z.literal("eligible"),
    limit: z.number().int().positive().max(200).optional(),
    mockArtifacts: z.array(artifactSchema).default([]),
  }),
]);

function parseMockArtifacts(
  artifacts: z.infer<typeof artifactSchema>[],
): MockStreamflowObservedArtifact[] {
  return artifacts.map((artifact) => ({
    artifactId: artifact.artifactId,
    provider: "streamflow-mock",
    vestingReference: artifact.vestingReference ?? null,
    clientCorrelationId: artifact.clientCorrelationId ?? null,
    scheduleId: artifact.scheduleId,
    beneficiaryAddress: artifact.beneficiaryAddress,
    mintAddress: artifact.mintAddress,
    amountAtomic: BigInt(artifact.amountAtomic),
    startAt: new Date(artifact.startAt),
    endAt: new Date(artifact.endAt),
    vestingKind: artifact.vestingKind,
    treasuryAddress: artifact.treasuryAddress ?? null,
    escrowAddress: artifact.escrowAddress ?? null,
    txSignature: artifact.txSignature ?? null,
    observedState: artifact.observedState,
    observedAt: new Date(artifact.observedAt),
  }));
}

export async function POST(request: Request) {
  try {
    assertTrustedOrigin(request);

    const actor = await getAuthorizedInternalAdminActor(request);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized internal admin request." }, { status: 401 });
    }

    const clientIp = getClientIpFromHeaders(request.headers);
    await enforceRateLimit({
      key: `internal-admin-streamflow-reconcile:${clientIp}`,
      limit: 20,
      windowMs: 60_000,
    });

    const body = requestSchema.parse(await request.json());
    const artifactSource = new InMemoryMockStreamflowObservedArtifactSource(
      parseMockArtifacts(body.mockArtifacts),
    );

    if (body.scope === "one") {
      const result = await reconcileVestingPositionWithMockStreamflow({
        vestingPositionId: body.vestingPositionId,
        triggeredBy: actor,
        artifactSource,
        force: body.force,
      });

      return NextResponse.json({
        scope: "one",
        processedCount: 1,
        summary: {
          matched: result.status === "matched" ? 1 : 0,
          missingArtifact: result.status === "missing_artifact" ? 1 : 0,
          mismatched: result.status === "mismatched" ? 1 : 0,
          duplicate: result.status === "duplicate_artifact" ? 1 : 0,
          retryableFailure: result.status === "retryable_failure" ? 1 : 0,
          manualReviewRequired:
            result.status === "manual_review" ||
            result.status === "duplicate_artifact" ||
            (result.status === "mismatched" && result.manualReviewRequired)
              ? 1
              : 0,
        },
        results: [result],
      });
    }

    const batch = await reconcileEligibleVestingPositionsWithMockStreamflow({
      triggeredBy: actor,
      artifactSource,
      limit: body.limit,
    });

    return NextResponse.json({
      scope: "eligible",
      processedCount: batch.processedCount,
      summary: {
        matched: batch.summary.matched,
        missingArtifact: batch.summary.missingArtifact,
        mismatched: batch.summary.mismatched,
        duplicate: batch.summary.duplicateArtifact,
        retryableFailure: batch.summary.retryableFailure,
        manualReviewRequired: batch.summary.manualReviewRequired,
      },
      results: batch.results,
      vestingPositionIds: batch.vestingPositionIds,
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
      return NextResponse.json({ error: "Invalid Streamflow mock reconciliation request." }, { status: 400 });
    }

    const message =
      error instanceof Error ? error.message : "Unable to reconcile mocked Streamflow artifacts.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
