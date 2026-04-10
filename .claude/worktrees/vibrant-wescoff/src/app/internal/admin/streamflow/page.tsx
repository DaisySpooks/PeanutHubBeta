import Link from "next/link";
import { redirect } from "next/navigation";
import { logoutInternalAdminAction } from "@/app/internal/admin/login/actions";
import { StreamflowClearManualReviewButton } from "@/components/admin/streamflow-clear-manual-review-button";
import { StreamflowCopyAttemptSummaryButton } from "@/components/admin/streamflow-copy-attempt-summary-button";
import { StreamflowReconciliationPanel } from "@/components/admin/streamflow-reconciliation-panel";
import {
  getAdminStreamflowDashboard,
  type AdminStreamflowItem,
  type AdminStreamflowStateFilter,
} from "@/lib/admin/streamflow";
import { formatTokenAtomicAmount } from "@/lib/exchanges/token-format";
import { getInternalAdminSession } from "@/lib/internal-auth";
import { getExchangeConfig } from "@/lib/system-config/exchange-config";

type StreamflowAdminPageProps = {
  searchParams: Promise<{
    state?: string;
  }>;
};

const STREAMFLOW_FILTERS: Array<{
  value: AdminStreamflowStateFilter;
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "manual_review", label: "Manual review" },
  { value: "clear_review_eligible", label: "Clear-review eligible" },
  { value: "matched", label: "Matched" },
  { value: "missing_artifact", label: "Missing artifact" },
  { value: "mismatched", label: "Mismatched" },
  { value: "duplicate_artifact", label: "Duplicate" },
];

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function formatOptionalDateTime(value?: string | null) {
  return value ? formatDateTime(value) : "Never";
}

function parseAttemptDetails(detailsJson?: string | null) {
  if (!detailsJson) {
    return null;
  }

  try {
    return JSON.parse(detailsJson) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getMismatchComparison(item: AdminStreamflowItem) {
  switch (item.streamflowReconciliationFailureReason) {
    case "recipient_mismatch":
      return {
        label: "Recipient wallet",
        expected: item.streamflowExpectedRecipientWalletAddress ?? "Not set",
        observed: item.streamflowBeneficiaryAddress ?? "Not captured",
      };
    case "mint_mismatch":
      return {
        label: "Mint",
        expected: item.streamflowExpectedMintAddress ?? "Not set",
        observed: item.streamflowMintAddress ?? "Not captured",
      };
    case "amount_mismatch":
      return {
        label: "Amount",
        expected: item.streamflowExpectedAmountAtomic ?? "Not set",
        observed: "Not captured on item summary",
      };
    case "start_at_mismatch":
      return {
        label: "Start time",
        expected: item.streamflowExpectedStartAt ?? "Not set",
        observed: "Not captured on item summary",
      };
    case "end_at_mismatch":
      return {
        label: "End time",
        expected: item.streamflowExpectedEndAt ?? "Not set",
        observed: "Not captured on item summary",
      };
    case "vesting_kind_mismatch":
      return {
        label: "Vesting kind",
        expected: item.streamflowExpectedVestingKind ?? "Not set",
        observed: "Not captured on item summary",
      };
    default:
      return {
        label: "Key difference",
        expected: "No mismatch snapshot",
        observed: "No observed mismatch snapshot",
      };
  }
}

function StreamflowSection({
  items,
  decimals,
}: {
  items: AdminStreamflowItem[];
  decimals: number;
}) {
  return (
    <section className="panel adminSettlementSection">
      <div className="adminSettlementHeader">
        <div>
          <p className="statusEyebrow">Streamflow mock</p>
          <h2>Tracked vesting positions</h2>
        </div>
        <span className="historyBadge">{items.length}</span>
      </div>

      {items.length === 0 ? (
        <p className="exchangeEmpty">No Streamflow items match this filter right now.</p>
      ) : (
        <div className="historyList">
          {items.map((item) => (
            <article className="historyItem" id={`streamflow-${item.id}`} key={item.id}>
              <div className="historyItemHeader">
                <div>
                  <p className="statusEyebrow">VestingPosition</p>
                  <h2>{item.id}</h2>
                  <p>
                    Wallet {item.exchange.userWalletAddress}
                    {" • "}Exchange {item.exchange.id}
                  </p>
                </div>
                <div className="historyBadgeGroup">
                  <span className="historyBadge">{item.status}</span>
                  <span className="historyBadge">
                    {item.streamflowLifecycleStatus ?? "expected_only"}
                  </span>
                  {item.canClearManualReview ? (
                    <span className="historyBadge">Clear-review eligible</span>
                  ) : null}
                </div>
              </div>

              <div className="historyStatsGrid">
                <article className="historyStatCard">
                  <span>Total / withdrawn</span>
                  <strong>
                    {formatTokenAtomicAmount(item.totalAmount, decimals)}
                    {" / "}
                    {formatTokenAtomicAmount(item.withdrawnAmount, decimals)}
                  </strong>
                </article>
                <article className="historyStatCard">
                  <span>Expected amount</span>
                  <strong>
                    {item.streamflowExpectedAmountAtomic
                      ? formatTokenAtomicAmount(item.streamflowExpectedAmountAtomic, decimals)
                      : "Not set"}
                  </strong>
                </article>
                <article className="historyStatCard">
                  <span>Last attempt</span>
                  <strong>
                    {item.lastAttemptOutcome ?? "None"}
                    {" • "}
                    {formatOptionalDateTime(item.lastAttemptAt)}
                  </strong>
                </article>
                <article className="historyStatCard">
                  <span>Next reconcile</span>
                  <strong>{formatOptionalDateTime(item.streamflowNextReconcileAt)}</strong>
                </article>
              </div>

              <div className="historyStatsGrid">
                <article className="historyStatCard">
                  <span>Reference</span>
                  <strong>{item.vestingReference ?? "Not set"}</strong>
                </article>
                <article className="historyStatCard">
                  <span>Correlation ID</span>
                  <strong>{item.streamflowClientCorrelationId ?? "Not set"}</strong>
                </article>
                <article className="historyStatCard">
                  <span>Schedule ID</span>
                  <strong>{item.streamflowScheduleId ?? "Not found"}</strong>
                </article>
                <article className="historyStatCard">
                  <span>Observed state</span>
                  <strong>{item.streamflowObservedScheduleState ?? "Unknown"}</strong>
                </article>
              </div>

              <div className="historyStatsGrid">
                <article className="historyStatCard">
                  <span>Manual review</span>
                  <strong>{item.streamflowManualReviewRequired ? "Required" : "Clear"}</strong>
                </article>
                <article className="historyStatCard">
                  <span>Last review clear</span>
                  <strong>
                    {item.lastManualReviewClearedBy
                      ? `${item.lastManualReviewClearedBy} • ${formatOptionalDateTime(item.lastManualReviewClearedAt)}`
                      : "Never cleared"}
                  </strong>
                </article>
              </div>

              <div className="adminSettlementActions">
                <StreamflowCopyAttemptSummaryButton
                  summary={{
                    itemId: item.id,
                    reconciliationStatus: item.streamflowLifecycleStatus,
                    lastAttemptTimestamp: item.lastAttemptAt,
                    lastAttemptOutcome: item.lastAttemptOutcome,
                    mismatchReason: item.streamflowReconciliationFailureReason,
                    manualReviewRequired: item.streamflowManualReviewRequired,
                    manualReviewReason: item.streamflowManualReviewReason,
                    expected: {
                      vestingReference: item.vestingReference,
                      clientCorrelationId: item.streamflowClientCorrelationId,
                      recipientWalletAddress: item.streamflowExpectedRecipientWalletAddress,
                      mintAddress: item.streamflowExpectedMintAddress,
                      amountAtomic: item.streamflowExpectedAmountAtomic,
                      startAt: item.streamflowExpectedStartAt,
                      endAt: item.streamflowExpectedEndAt,
                      vestingKind: item.streamflowExpectedVestingKind,
                    },
                    observed: {
                      scheduleId: item.streamflowScheduleId,
                      beneficiaryAddress: item.streamflowBeneficiaryAddress,
                      mintAddress: item.streamflowMintAddress,
                      creationTxSignature: item.streamflowCreationTxSignature,
                      scheduleState: item.streamflowObservedScheduleState,
                    },
                  }}
                />
              </div>

              {item.streamflowManualReviewRequired || item.streamflowReconciliationFailureReason ? (
                <OperatorHandoffBlock item={item} />
              ) : null}

              {item.streamflowManualReviewRequired ? (
                <div className="internalAdminNotice">
                  <strong>Manual review required</strong>
                  <p>{item.streamflowManualReviewReason ?? "This vesting item needs operator review."}</p>
                  {item.canClearManualReview ? (
                    <div className="adminSettlementActions">
                      <StreamflowClearManualReviewButton vestingPositionId={item.id} />
                    </div>
                  ) : (
                    <p className="adminHelperText">
                      Manual review can only be cleared after the latest mocked reconciliation rerun
                      succeeds with a matched result.
                    </p>
                  )}
                </div>
              ) : null}

              {item.streamflowReconciliationFailureReason ? (
                <div className="internalAdminNotice">
                  <strong>Reconciliation note</strong>
                  <p>{item.streamflowReconciliationFailureReason}</p>
                </div>
              ) : null}

              <details className="historySubsection" open={item.streamflowManualReviewRequired}>
                <summary className="historySectionHeader">
                  <div>
                    <p className="statusEyebrow">Attempt history</p>
                    <h3>{item.reconciliationAttempts.length}</h3>
                  </div>
                </summary>

                {item.reconciliationAttempts.length === 0 ? (
                  <p className="exchangeEmpty">No Streamflow reconciliation attempts recorded yet.</p>
                ) : (
                  <div className="historyWithdrawalList">
                    {item.reconciliationAttempts.map((attempt) => (
                      <StreamflowAttemptItem attempt={attempt} key={attempt.id} />
                    ))}
                  </div>
                )}
              </details>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function OperatorHandoffBlock({
  item,
}: {
  item: AdminStreamflowItem;
}) {
  const comparison = getMismatchComparison(item);

  return (
    <section className="panel historySubsection">
      <div className="historySectionHeader">
        <div>
          <p className="statusEyebrow">Operator handoff</p>
          <h3>Compact support summary</h3>
        </div>
      </div>

      <div className="historyStatsGrid">
        <article className="historyStatCard">
          <span>Item ID</span>
          <strong>{item.id}</strong>
        </article>
        <article className="historyStatCard">
          <span>Reconciliation status</span>
          <strong>{item.streamflowLifecycleStatus ?? "expected_only"}</strong>
        </article>
        <article className="historyStatCard">
          <span>Mismatch reason</span>
          <strong>{item.streamflowReconciliationFailureReason ?? "None"}</strong>
        </article>
        <article className="historyStatCard">
          <span>Last attempt</span>
          <strong>{item.lastAttemptAt ? formatDateTime(item.lastAttemptAt) : "Never"}</strong>
        </article>
      </div>

      <div className="historyStatsGrid">
        <article className="historyStatCard">
          <span>{comparison.label}: expected</span>
          <strong>{comparison.expected}</strong>
        </article>
        <article className="historyStatCard">
          <span>{comparison.label}: observed</span>
          <strong>{comparison.observed}</strong>
        </article>
        <article className="historyStatCard">
          <span>Manual review</span>
          <strong>{item.streamflowManualReviewRequired ? "Required" : "Clear"}</strong>
        </article>
        <article className="historyStatCard">
          <span>Manual review note</span>
          <strong>{item.streamflowManualReviewReason ?? "None"}</strong>
        </article>
      </div>
    </section>
  );
}

function StreamflowAttemptItem({
  attempt,
}: {
  attempt: AdminStreamflowItem["reconciliationAttempts"][number];
}) {
  const details = parseAttemptDetails(attempt.detailsJson);
  const clearedBy = typeof details?.clearedBy === "string" ? details.clearedBy : null;
  const clearedAt = typeof details?.clearedAt === "string" ? details.clearedAt : null;
  const operatorNote = typeof details?.operatorNote === "string" ? details.operatorNote : null;

  return (
    <article className="historyWithdrawalItem">
      <div>
        <strong>
          {attempt.attemptType} • {attempt.result}
        </strong>
        <p>{formatDateTime(attempt.createdAt)}</p>
      </div>
      <div>
        <strong>{attempt.observedState ?? "No observed state"}</strong>
        {attempt.attemptType === "admin-clear-manual-review" ? (
          <>
            <p>
              Manual review cleared by {clearedBy ?? "unknown actor"}
              {clearedAt ? ` at ${formatDateTime(clearedAt)}` : ""}.
            </p>
            {operatorNote ? <p>Operator note: {operatorNote}</p> : null}
          </>
        ) : (
          <p>{attempt.errorMessage ?? attempt.detailsJson ?? "No details"}</p>
        )}
        {attempt.observedScheduleId ? <p>Schedule: {attempt.observedScheduleId}</p> : null}
        {attempt.observedTxSignature ? <p>Tx: {attempt.observedTxSignature}</p> : null}
        {attempt.matchedBy ? <p>Matched by: {attempt.matchedBy}</p> : null}
      </div>
    </article>
  );
}

export default async function InternalAdminStreamflowPage({
  searchParams,
}: StreamflowAdminPageProps) {
  const session = await getInternalAdminSession();

  if (!session) {
    redirect("/internal/admin/login");
  }

  const { state } = await searchParams;
  const filter = STREAMFLOW_FILTERS.some((item) => item.value === state)
    ? (state as AdminStreamflowStateFilter)
    : "all";

  const [allDashboard, filteredDashboard, config] = await Promise.all([
    getAdminStreamflowDashboard("all"),
    getAdminStreamflowDashboard(filter),
    getExchangeConfig(),
  ]);

  return (
    <main className="shell dashboardShell">
      <section className="panel dashboardHero">
        <div>
          <p className="heroKicker">Internal admin</p>
          <h1>Streamflow mock reconciliation</h1>
          <p>
            This page is dedicated to the mocked Streamflow reconciliation lifecycle. Operators can
            prefill artifact JSON from tracked vesting positions, run explicit reconcile passes, and
            inspect attempt history without any live provider calls or background automation.
          </p>
        </div>
        <div className="adminSettlementActions">
          <Link className="secondaryLinkButton" href="/internal/admin/settlements">
            Back to settlements
          </Link>
          <form action={logoutInternalAdminAction}>
            <button className="secondaryButton" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </section>

      <section className="adminSettlementGrid">
        <StreamflowReconciliationPanel items={allDashboard.items} />

        <section className="panel adminSettlementSection">
          <div className="adminSettlementHeader">
            <div>
              <p className="statusEyebrow">Streamflow mock</p>
              <h2>Overview</h2>
            </div>
          </div>
          <div className="historyStatsGrid">
            <article className="historyStatCard">
              <span>Total tracked</span>
              <strong>{allDashboard.summary.total}</strong>
            </article>
            <article className="historyStatCard">
              <span>Eligible now</span>
              <strong>{allDashboard.summary.eligible}</strong>
            </article>
            <article className="historyStatCard">
              <span>Matched</span>
              <strong>{allDashboard.summary.matched}</strong>
            </article>
            <article className="historyStatCard">
              <span>Manual review</span>
              <strong>{allDashboard.summary.manualReview}</strong>
            </article>
            <article className="historyStatCard">
              <span>Missing artifact</span>
              <strong>{allDashboard.summary.missingArtifact}</strong>
            </article>
            <article className="historyStatCard">
              <span>Duplicate</span>
              <strong>{allDashboard.summary.duplicateArtifact}</strong>
            </article>
          </div>

          <div className="internalAdminNotice">
            <strong>Manual-only gate</strong>
            <p>
              The “Reconcile due Streamflow items” button is explicit and operator-triggered only.
              There is still no scheduler, worker, or automatic polling.
            </p>
          </div>
        </section>
      </section>

      <section className="panel adminSettlementSection">
        <div className="adminSettlementHeader">
          <div>
            <p className="statusEyebrow">Filters</p>
            <h2>Reconciliation states</h2>
          </div>
          <span className="historyBadge">{filteredDashboard.summary.filtered}</span>
        </div>
        <div className="adminSettlementActions">
          {STREAMFLOW_FILTERS.map((item) => (
            <Link
              className={filter === item.value ? "primaryLinkButton" : "secondaryLinkButton"}
              href={item.value === "all" ? "/internal/admin/streamflow" : `/internal/admin/streamflow?state=${item.value}`}
              key={item.value}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </section>

      <section className="adminSettlementGrid">
        <StreamflowSection decimals={config.peanutTokenDecimals} items={filteredDashboard.items} />
      </section>
    </main>
  );
}
