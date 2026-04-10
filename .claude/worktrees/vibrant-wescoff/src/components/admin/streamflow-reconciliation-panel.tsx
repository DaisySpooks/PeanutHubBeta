"use client";

import { useState } from "react";
import type { AdminStreamflowItem } from "@/lib/admin/streamflow";

type ReconcileSummary = {
  matched: number;
  missingArtifact: number;
  mismatched: number;
  duplicate: number;
  retryableFailure: number;
  manualReviewRequired: number;
};

type ReconcileResult = {
  status:
    | "matched"
    | "missing_artifact"
    | "mismatched"
    | "duplicate_artifact"
    | "retryable_failure"
    | "manual_review";
  vestingPositionId: string;
  scheduleId?: string;
  matchedBy?: string;
  reason?: string;
  candidateScheduleIds?: string[];
  retryAt?: string;
  manualReviewRequired?: boolean;
};

type ApiResponse = {
  scope: "one" | "eligible";
  processedCount: number;
  summary: ReconcileSummary;
  results: ReconcileResult[];
  vestingPositionIds?: string[];
  error?: string;
};

const DEFAULT_ARTIFACTS_JSON = "[]";

type ArtifactPresetVariant =
  | "exact_match"
  | "wrong_wallet"
  | "wrong_amount"
  | "wrong_mint"
  | "duplicate_artifact";

function buildExactArtifact(item: AdminStreamflowItem, suffix = "base") {
  return {
    artifactId: `artifact-${item.id}-${suffix}`,
    vestingReference: item.vestingReference,
    clientCorrelationId: item.streamflowClientCorrelationId,
    scheduleId: item.streamflowScheduleId ?? `mock-streamflow-schedule-${item.id}-${suffix}`,
    beneficiaryAddress: item.streamflowExpectedRecipientWalletAddress ?? item.walletAddress,
    mintAddress: item.streamflowExpectedMintAddress,
    amountAtomic: item.streamflowExpectedAmountAtomic,
    startAt: item.streamflowExpectedStartAt ?? item.lockedAt,
    endAt: item.streamflowExpectedEndAt ?? item.unlockAt,
    vestingKind: item.streamflowExpectedVestingKind ?? "token_lock",
    treasuryAddress: item.streamflowTreasuryAddress ?? "mock-streamflow-treasury",
    escrowAddress: item.streamflowEscrowAddress ?? `mock-streamflow-escrow-${item.id}-${suffix}`,
    txSignature: item.streamflowCreationTxSignature ?? `mock-streamflow-tx-${item.id}-${suffix}`,
    observedState: item.streamflowObservedScheduleState ?? "created",
    observedAt: new Date().toISOString(),
  };
}

function buildArtifactSkeleton(item: AdminStreamflowItem, variant: ArtifactPresetVariant) {
  const exactArtifact = buildExactArtifact(item);

  switch (variant) {
    case "exact_match":
      return [exactArtifact];
    case "wrong_wallet":
      return [
        {
          ...exactArtifact,
          artifactId: `artifact-${item.id}-wrong-wallet`,
          scheduleId: `mock-streamflow-schedule-${item.id}-wrong-wallet`,
          beneficiaryAddress: `${exactArtifact.beneficiaryAddress}-mismatch`,
        },
      ];
    case "wrong_amount":
      return [
        {
          ...exactArtifact,
          artifactId: `artifact-${item.id}-wrong-amount`,
          scheduleId: `mock-streamflow-schedule-${item.id}-wrong-amount`,
          amountAtomic: exactArtifact.amountAtomic
            ? String(BigInt(exactArtifact.amountAtomic) + BigInt(1))
            : "1",
        },
      ];
    case "wrong_mint":
      return [
        {
          ...exactArtifact,
          artifactId: `artifact-${item.id}-wrong-mint`,
          scheduleId: `mock-streamflow-schedule-${item.id}-wrong-mint`,
          mintAddress: `${exactArtifact.mintAddress ?? "mock-mint"}-mismatch`,
        },
      ];
    case "duplicate_artifact":
      return [
        buildExactArtifact(item, "duplicate-a"),
        buildExactArtifact(item, "duplicate-b"),
      ];
  }
}

export function StreamflowReconciliationPanel({
  items,
}: {
  items: AdminStreamflowItem[];
}) {
  const [vestingPositionId, setVestingPositionId] = useState("");
  const [selectedVestingPositionId, setSelectedVestingPositionId] = useState("");
  const [limit, setLimit] = useState("25");
  const [force, setForce] = useState(false);
  const [mockArtifactsJson, setMockArtifactsJson] = useState(DEFAULT_ARTIFACTS_JSON);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [response, setResponse] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [presetMessage, setPresetMessage] = useState<string | null>(null);

  async function submit(scope: "one" | "eligible") {
    setIsSubmitting(true);
    setError(null);

    try {
      const mockArtifacts = JSON.parse(mockArtifactsJson);
      const body =
        scope === "one"
          ? {
              scope,
              vestingPositionId,
              force,
              mockArtifacts,
            }
          : {
              scope,
              limit: Number.parseInt(limit, 10) || 25,
              mockArtifacts,
            };

      const result = await fetch("/api/internal/vesting/streamflow/reconcile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = (await result.json()) as ApiResponse | { error: string };

      if (!result.ok) {
        setResponse(null);
        setError(
          "error" in data && typeof data.error === "string"
            ? data.error
            : "Unable to reconcile mocked Streamflow items.",
        );
        return;
      }

      setResponse(data as ApiResponse);
    } catch (caughtError) {
      setResponse(null);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to reconcile mocked Streamflow items.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function prefillFromSelectedItem(variant: ArtifactPresetVariant) {
    const item = items.find((entry) => entry.id === selectedVestingPositionId);
    if (!item) {
      return;
    }

    const payload = JSON.stringify(buildArtifactSkeleton(item, variant), null, 2);

    setVestingPositionId(item.id);
    setMockArtifactsJson(payload);
    setResponse(null);
    setError(null);

    try {
      await navigator.clipboard.writeText(payload);
      setPresetMessage(`Loaded ${variant} preset into the editor and copied it to your clipboard.`);
    } catch {
      setPresetMessage(`Loaded ${variant} preset into the editor.`);
    }
  }

  return (
    <section className="panel adminSettlementSection">
      <div className="adminSettlementHeader">
        <div>
          <p className="statusEyebrow">Streamflow mock</p>
          <h2>Manual reconciliation</h2>
        </div>
      </div>

      <div className="internalAdminNotice">
        <strong>Mock-only admin control</strong>
        <p>
          This panel calls the internal mocked Streamflow reconciliation endpoint. It does not use
          live Streamflow SDK calls, no real on-chain activity, and no background automation.
        </p>
      </div>

      <div className="adminActionForm">
        <label className="withdrawalField">
          <span>Prefill from tracked vesting item</span>
          <select
            className="adminSelectInput"
            onChange={(event) => setSelectedVestingPositionId(event.target.value)}
            value={selectedVestingPositionId}
          >
            <option value="">Select a Streamflow-tracked VestingPosition</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.id} • {item.streamflowLifecycleStatus ?? "expected_only"} • {item.exchange.userWalletAddress}
              </option>
            ))}
          </select>
        </label>

        <div className="adminSettlementActions">
          <button
            className="secondaryButton"
            disabled={!selectedVestingPositionId || isSubmitting}
            onClick={() => void prefillFromSelectedItem("exact_match")}
            type="button"
          >
            Load exact-match skeleton
          </button>
        </div>

        <div className="adminSettlementActions">
          <button
            className="secondaryButton"
            disabled={!selectedVestingPositionId || isSubmitting}
            onClick={() => void prefillFromSelectedItem("wrong_wallet")}
            type="button"
          >
            Copy wrong_wallet preset
          </button>
          <button
            className="secondaryButton"
            disabled={!selectedVestingPositionId || isSubmitting}
            onClick={() => void prefillFromSelectedItem("wrong_amount")}
            type="button"
          >
            Copy wrong_amount preset
          </button>
          <button
            className="secondaryButton"
            disabled={!selectedVestingPositionId || isSubmitting}
            onClick={() => void prefillFromSelectedItem("wrong_mint")}
            type="button"
          >
            Copy wrong_mint preset
          </button>
          <button
            className="secondaryButton"
            disabled={!selectedVestingPositionId || isSubmitting}
            onClick={() => void prefillFromSelectedItem("duplicate_artifact")}
            type="button"
          >
            Copy duplicate_artifact preset
          </button>
        </div>

        {presetMessage ? <p className="adminHelperText">{presetMessage}</p> : null}

        <label className="withdrawalField">
          <span>Specific VestingPosition ID</span>
          <input
            onChange={(event) => setVestingPositionId(event.target.value)}
            placeholder="vesting-position-id"
            type="text"
            value={vestingPositionId}
          />
        </label>

        <label className="withdrawalField">
          <span>Eligible batch limit</span>
          <input onChange={(event) => setLimit(event.target.value)} type="number" value={limit} />
        </label>

        <label className="withdrawalField">
          <span>Mock observed artifacts JSON array</span>
          <textarea
            className="adminJsonInput"
            onChange={(event) => setMockArtifactsJson(event.target.value)}
            rows={10}
            value={mockArtifactsJson}
          />
        </label>

        <label className="checkboxField">
          <input
            checked={force}
            onChange={(event) => setForce(event.target.checked)}
            type="checkbox"
          />
          <span>Force reconcile even if already flagged for manual review</span>
        </label>

        <div className="adminSettlementActions">
          <button
            className="primaryLinkButton"
            disabled={isSubmitting || !vestingPositionId.trim()}
            onClick={() => void submit("one")}
            type="button"
          >
            Reconcile specific VestingPosition
          </button>
          <button
            className="secondaryButton"
            disabled={isSubmitting}
            onClick={() => void submit("eligible")}
            type="button"
          >
            Reconcile due Streamflow items
          </button>
        </div>
      </div>

      {error ? (
        <div className="internalAdminNotice">
          <strong>Request error</strong>
          <p>{error}</p>
        </div>
      ) : null}

      {response ? (
        <>
          <div className="historyStatsGrid">
            <article className="historyStatCard">
              <span>Matched</span>
              <strong>{response.summary.matched}</strong>
            </article>
            <article className="historyStatCard">
              <span>Missing artifact</span>
              <strong>{response.summary.missingArtifact}</strong>
            </article>
            <article className="historyStatCard">
              <span>Mismatched</span>
              <strong>{response.summary.mismatched}</strong>
            </article>
            <article className="historyStatCard">
              <span>Duplicate</span>
              <strong>{response.summary.duplicate}</strong>
            </article>
            <article className="historyStatCard">
              <span>Retryable</span>
              <strong>{response.summary.retryableFailure}</strong>
            </article>
            <article className="historyStatCard">
              <span>Manual review required</span>
              <strong>{response.summary.manualReviewRequired}</strong>
            </article>
          </div>

          <div className="historySubsection">
            <div className="historySectionHeader">
              <div>
                <p className="statusEyebrow">Last response</p>
                <h3>{response.processedCount}</h3>
              </div>
            </div>

            <div className="historyWithdrawalList">
              {response.results.map((result) => (
                <article className="historyWithdrawalItem" key={`${result.vestingPositionId}-${result.status}`}>
                  <div>
                    <strong>
                      {result.vestingPositionId} • {result.status}
                    </strong>
                    {result.scheduleId ? <p>Schedule {result.scheduleId}</p> : null}
                  </div>
                  <div>
                    {result.reason ? <p>{result.reason}</p> : null}
                    {result.matchedBy ? <p>Matched by: {result.matchedBy}</p> : null}
                    {result.retryAt ? <p>Retry at: {new Date(result.retryAt).toLocaleString()}</p> : null}
                    {result.candidateScheduleIds?.length ? (
                      <p>Candidates: {result.candidateScheduleIds.join(", ")}</p>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
