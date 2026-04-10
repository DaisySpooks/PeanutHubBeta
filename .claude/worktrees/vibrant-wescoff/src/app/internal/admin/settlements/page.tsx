import Link from "next/link";
import { logoutInternalAdminAction } from "@/app/internal/admin/login/actions";
import {
  beginSettlementAction,
  completeSettlementAction,
  failSettlementAction,
  issueNutshellRewardsAction,
  reconcileMultisigSettlementAction,
  requeueFailedSettlementAction,
} from "@/app/internal/admin/settlements/actions";
import { getAdminOperationalOverview } from "@/lib/admin/operations";
import { getAdminSettlementDashboard, type AdminSettlementItem } from "@/lib/admin/settlements";
import { getAdminStreamflowDashboard } from "@/lib/admin/streamflow";
import { formatTokenAtomicAmount } from "@/lib/exchanges/token-format";
import { getExchangeConfig } from "@/lib/system-config/exchange-config";
import { getInternalAdminSession } from "@/lib/internal-auth";
import { getWithdrawalWorkerOptionsFromEnv } from "@/lib/withdrawals/worker";
import { redirect } from "next/navigation";

type SettlementsPageProps = {
  searchParams: Promise<{
    flash?: string;
    detail?: string;
  }>;
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function getFlashMessage(flash?: string) {
  switch (flash) {
    case "issue-success":
      return { tone: "success" as const, text: "Nutshell rewards were issued successfully." };
    case "begin-success":
      return { tone: "success" as const, text: "Withdrawal moved to PROCESSING." };
    case "complete-success":
      return { tone: "success" as const, text: "Withdrawal marked COMPLETED." };
    case "fail-success":
      return { tone: "success" as const, text: "Withdrawal marked FAILED and reservation released." };
    case "requeue-success":
      return { tone: "success" as const, text: "Failed withdrawal requeued to PENDING for controlled recovery." };
    case "reconcile-success":
      return { tone: "success" as const, text: "Multisig withdrawal reconciliation completed." };
    case "begin-error":
      return { tone: "error" as const, text: "Could not move the withdrawal to PROCESSING." };
    case "complete-error":
      return { tone: "error" as const, text: "Could not mark the withdrawal as COMPLETED." };
    case "fail-error":
      return { tone: "error" as const, text: "Could not mark the withdrawal as FAILED." };
    case "requeue-error":
      return { tone: "error" as const, text: "Could not requeue the failed withdrawal." };
    case "reconcile-error":
      return { tone: "error" as const, text: "Could not reconcile the multisig withdrawal state." };
    case "issue-error":
      return { tone: "error" as const, text: "Could not issue Nutshell rewards." };
    case "action-error":
      return { tone: "error" as const, text: "The requested settlement action could not be completed." };
    default:
      return null;
  }
}

function SettlementSection({
  title,
  items,
  decimals,
}: {
  title: string;
  items: AdminSettlementItem[];
  decimals: number;
}) {
  return (
    <section className="panel adminSettlementSection">
      <div className="adminSettlementHeader">
        <div>
          <p className="statusEyebrow">Withdrawals</p>
          <h2>{title}</h2>
        </div>
        <span className="historyBadge">{items.length}</span>
      </div>

      {items.length === 0 ? (
        <p className="exchangeEmpty">No withdrawals in this status right now.</p>
      ) : (
        <div className="historyList">
          {items.map((item) => (
            <article className="historyItem" key={item.id}>
              <div className="historyItemHeader">
                <div>
                  <p className="statusEyebrow">Withdrawal</p>
                  <h2>{item.id}</h2>
                  <p>
                    Wallet {item.vestingPosition.userWalletAddress}
                    {" • "}Job {item.jobId ?? "unclaimed"}
                  </p>
                </div>
                <div className="historyBadgeGroup">
                  <span className="historyBadge">{item.status}</span>
                </div>
              </div>

              <div className="historyStatsGrid">
                <article className="historyStatCard">
                  <span>Gross amount</span>
                  <strong>{formatTokenAtomicAmount(item.grossAmount, decimals)}</strong>
                </article>
                <article className="historyStatCard">
                  <span>Fee / Net</span>
                  <strong>
                    {formatTokenAtomicAmount(item.feeAmount, decimals)}
                    {" / "}
                    {formatTokenAtomicAmount(item.netAmount, decimals)}
                  </strong>
                </article>
                <article className="historyStatCard">
                  <span>Created</span>
                  <strong>{formatDateTime(item.createdAt)}</strong>
                </article>
                <article className="historyStatCard">
                  <span>Unlock date</span>
                  <strong>{formatDateTime(item.vestingPosition.unlockAt)}</strong>
                </article>
              </div>

              {item.payoutReference || item.multisigProposalId || item.submittedTxSignature ? (
                <div className="historyStatsGrid">
                  <article className="historyStatCard">
                    <span>Payout reference</span>
                    <strong>{item.payoutReference ?? "Not set"}</strong>
                  </article>
                  <article className="historyStatCard">
                    <span>Proposal</span>
                    <strong>{item.multisigProposalId ?? "Not set"}</strong>
                  </article>
                  <article className="historyStatCard">
                    <span>Proposal status</span>
                    <strong>{item.multisigProposalStatus ?? "Unknown"}</strong>
                  </article>
                  <article className="historyStatCard">
                    <span>Submitted tx</span>
                    <strong>{item.submittedTxSignature ?? "Not submitted"}</strong>
                  </article>
                </div>
              ) : null}

              {item.squadsTransactionIndex || item.squadsProposalPda || item.nextReconcileAt ? (
                <div className="historyStatsGrid">
                  <article className="historyStatCard">
                    <span>Squads tx index</span>
                    <strong>{item.squadsTransactionIndex ?? "Not set"}</strong>
                  </article>
                  <article className="historyStatCard">
                    <span>Proposal PDA</span>
                    <strong>{item.squadsProposalPda ?? "Not set"}</strong>
                  </article>
                  <article className="historyStatCard">
                    <span>Next reconcile</span>
                    <strong>{item.nextReconcileAt ? formatDateTime(item.nextReconcileAt) : "Immediate"}</strong>
                  </article>
                  <article className="historyStatCard">
                    <span>Search attempts</span>
                    <strong>
                      {item.reconcileAttemptCount} / {item.signatureSearchAttemptCount}
                    </strong>
                  </article>
                </div>
              ) : null}

              {item.manualReviewRequired ? (
                <div className="internalAdminNotice">
                  <strong>Manual review required</strong>
                  <p>{item.manualReviewReason ?? "This payout needs operator review before continuing."}</p>
                </div>
              ) : null}

              {item.reconciliationFailureReason ? (
                <div className="internalAdminNotice">
                  <strong>Reconciliation note</strong>
                  <p>{item.reconciliationFailureReason}</p>
                </div>
              ) : null}

              {item.failureReason ? (
                <div className="internalAdminNotice">
                  <strong>Failure reason</strong>
                  <p>{item.failureReason}</p>
                </div>
              ) : null}

              <div className="adminSettlementActions">
                {item.status === "PENDING" ? (
                  <form action={beginSettlementAction} className="adminActionForm">
                    <input name="withdrawalId" type="hidden" value={item.id} />
                    <label className="withdrawalField">
                      <span>Job ID</span>
                      <input defaultValue={`job-${item.id.slice(0, 8)}`} name="jobId" type="text" />
                    </label>
                    <button className="primaryLinkButton" type="submit">
                      Move to PROCESSING
                    </button>
                  </form>
                ) : null}

                {item.status === "PROCESSING" ? (
                  <>
                    {item.solanaTxSignature ? (
                      <form action={completeSettlementAction} className="adminActionForm">
                        <input name="withdrawalId" type="hidden" value={item.id} />
                        <input name="jobId" type="hidden" value={item.jobId ?? ""} />
                        <input name="solanaTxSignature" type="hidden" value={item.solanaTxSignature} />
                        <div className="internalAdminNotice">
                          <strong>Stored payout signature</strong>
                          <p>{item.solanaTxSignature}</p>
                        </div>
                        <button className="primaryLinkButton" type="submit">
                          Confirm on-chain payout and mark COMPLETED
                        </button>
                      </form>
                    ) : (
                      <div className="internalAdminNotice">
                        <strong>Awaiting payout submission</strong>
                        <p>
                          This withdrawal does not have a stored payout signature yet, so it cannot
                          be manually completed.
                        </p>
                      </div>
                    )}

                    <form action={failSettlementAction} className="adminActionForm">
                      <input name="withdrawalId" type="hidden" value={item.id} />
                      <input name="jobId" type="hidden" value={item.jobId ?? ""} />
                      <label className="withdrawalField">
                        <span>Failure reason</span>
                        <input name="failureReason" type="text" />
                      </label>
                      <button className="secondaryButton" type="submit">
                        Mark FAILED
                      </button>
                    </form>
                  </>
                ) : null}

                {item.status === "PENDING" ? (
                  <form action={failSettlementAction} className="adminActionForm">
                    <input name="withdrawalId" type="hidden" value={item.id} />
                    <label className="withdrawalField">
                      <span>Failure reason</span>
                      <input name="failureReason" type="text" />
                    </label>
                    <button className="secondaryButton" type="submit">
                      Mark FAILED
                    </button>
                  </form>
                ) : null}

                {item.status === "FAILED" && !item.solanaTxSignature ? (
                  <form action={requeueFailedSettlementAction} className="adminActionForm">
                    <input name="withdrawalId" type="hidden" value={item.id} />
                    <label className="withdrawalField">
                      <span>Requeue note</span>
                      <input
                        defaultValue="Internal admin requeued the failed withdrawal for a controlled retry."
                        name="note"
                        type="text"
                      />
                    </label>
                    <button className="primaryLinkButton" type="submit">
                      Requeue to PENDING
                    </button>
                  </form>
                ) : null}

                {(item.status === "AWAITING_SIGNATURES" || item.status === "SUBMITTED") ? (
                  <form action={reconcileMultisigSettlementAction} className="adminActionForm">
                    <input name="withdrawalId" type="hidden" value={item.id} />
                    <input name="status" type="hidden" value={item.status} />
                    <div className="internalAdminNotice">
                      <strong>Multisig reconciliation</strong>
                      <p>
                        Proposal {item.multisigProposalId ?? "unknown"}.
                        {" "}Last reconciled {item.lastReconciledAt ? formatDateTime(item.lastReconciledAt) : "never"}.
                      </p>
                    </div>
                    <button className="primaryLinkButton" type="submit">
                      Reconcile now
                    </button>
                  </form>
                ) : null}
              </div>

              <div className="historySubsection">
                <div className="historySectionHeader">
                  <div>
                    <p className="statusEyebrow">Reconciliation attempts</p>
                    <h3>{item.squadsReconciliationAttempts.length}</h3>
                  </div>
                </div>

                {item.squadsReconciliationAttempts.length === 0 ? (
                  <p className="exchangeEmpty">No Squads reconciliation attempts recorded yet.</p>
                ) : (
                  <div className="historyWithdrawalList">
                    {item.squadsReconciliationAttempts.map((attempt) => (
                      <article className="historyWithdrawalItem" key={attempt.id}>
                        <div>
                          <strong>
                            {attempt.attemptType} • {attempt.result}
                          </strong>
                          <p>{formatDateTime(attempt.createdAt)}</p>
                        </div>
                        <div>
                          <strong>
                            {attempt.proposalState ?? "No proposal state"}
                            {attempt.executionState ? ` • ${attempt.executionState}` : ""}
                          </strong>
                          <p>{attempt.errorMessage ?? attempt.detailsJson ?? "No details"}</p>
                          {attempt.txSignature ? <p>Tx: {attempt.txSignature}</p> : null}
                          {attempt.matchedBy ? <p>Matched by: {attempt.matchedBy}</p> : null}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>

              <div className="historySubsection">
                <div className="historySectionHeader">
                  <div>
                    <p className="statusEyebrow">Audit history</p>
                    <h3>{item.transitionAudits.length}</h3>
                  </div>
                </div>

                {item.transitionAudits.length === 0 ? (
                  <p className="exchangeEmpty">No transition audits recorded yet.</p>
                ) : (
                  <div className="historyWithdrawalList">
                    {item.transitionAudits.map((audit) => (
                      <article className="historyWithdrawalItem" key={audit.id}>
                        <div>
                          <strong>
                            {audit.fromStatus} to {audit.toStatus}
                          </strong>
                          <p>{formatDateTime(audit.createdAt)}</p>
                        </div>
                        <div>
                          <strong>{audit.triggeredBy}</strong>
                          <p>{audit.note ?? "No note"}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>

              <div className="historySubsection">
                <div className="historySectionHeader">
                  <div>
                    <p className="statusEyebrow">Payout attempts</p>
                    <h3>{item.payoutAttempts.length}</h3>
                  </div>
                </div>

                {item.payoutAttempts.length === 0 ? (
                  <p className="exchangeEmpty">No payout attempts recorded yet.</p>
                ) : (
                  <div className="historyWithdrawalList">
                    {item.payoutAttempts.map((attempt) => (
                      <article className="historyWithdrawalItem" key={attempt.id}>
                        <div>
                          <strong>{attempt.eventType}</strong>
                          <p>{formatDateTime(attempt.createdAt)}</p>
                        </div>
                        <div>
                          <strong>
                            {attempt.actor}
                            {attempt.attemptNumber ? ` • attempt ${attempt.attemptNumber}` : ""}
                          </strong>
                          <p>{attempt.message ?? "No details"}</p>
                          {attempt.solanaTxSignature ? (
                            <p>Signature: {attempt.solanaTxSignature}</p>
                          ) : null}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>

              <div className="historySubsection">
                <div className="historySectionHeader">
                  <div>
                    <p className="statusEyebrow">Payout events</p>
                    <h3>{item.payoutEvents.length}</h3>
                  </div>
                </div>

                {item.payoutEvents.length === 0 ? (
                  <p className="exchangeEmpty">No payout lifecycle events recorded yet.</p>
                ) : (
                  <div className="historyWithdrawalList">
                    {item.payoutEvents.map((event) => (
                      <article className="historyWithdrawalItem" key={event.id}>
                        <div>
                          <strong>{event.eventType}</strong>
                          <p>{formatDateTime(event.createdAt)}</p>
                        </div>
                        <div>
                          <strong>{event.triggeredBy}</strong>
                          <p>{event.detailsJson ?? "No details"}</p>
                          {event.proposalId ? <p>Proposal: {event.proposalId}</p> : null}
                          {event.txSignature ? <p>Tx: {event.txSignature}</p> : null}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export default async function InternalAdminSettlementsPage({
  searchParams,
}: SettlementsPageProps) {
  const session = await getInternalAdminSession();

  if (!session) {
    redirect("/internal/admin/login");
  }

  const { flash, detail } = await searchParams;
  const flashMessage = getFlashMessage(flash);
  const workerOptions = getWithdrawalWorkerOptionsFromEnv();
  const [dashboard, streamflowDashboard, config, operations] = await Promise.all([
    getAdminSettlementDashboard(),
    getAdminStreamflowDashboard("all"),
    getExchangeConfig(),
    getAdminOperationalOverview(workerOptions.staleProcessingMs),
  ]);

  return (
    <main className="shell dashboardShell">
      <section className="panel dashboardHero">
        <div>
          <p className="heroKicker">Internal admin</p>
          <h1>Withdrawal settlements</h1>
          <p>
            This page is protected by an http-only internal admin session and every state change is
            executed through server actions that call the settlement state machine directly.
          </p>
        </div>
        <form action={logoutInternalAdminAction}>
          <button className="secondaryButton" type="submit">
            Sign out
          </button>
        </form>
      </section>

      {flashMessage ? (
        <section
          className={`panel adminFlash adminFlash${flashMessage.tone === "success" ? "Success" : "Error"}`}
        >
          <p>{flashMessage.text}</p>
          {detail ? <p>{detail}</p> : null}
        </section>
      ) : null}

      <section className="adminSettlementGrid">
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
              <strong>{streamflowDashboard.summary.total}</strong>
            </article>
            <article className="historyStatCard">
              <span>Eligible now</span>
              <strong>{streamflowDashboard.summary.eligible}</strong>
            </article>
            <article className="historyStatCard">
              <span>Matched</span>
              <strong>{streamflowDashboard.summary.matched}</strong>
            </article>
            <article className="historyStatCard">
              <span>Manual review</span>
              <strong>{streamflowDashboard.summary.manualReview}</strong>
            </article>
          </div>

          <div className="internalAdminNotice">
            <strong>Manual-only gate</strong>
            <p>
              Streamflow reconciliation now lives on a dedicated internal admin page so operators
              can inspect mock artifacts, filters, and attempt history without crowding the
              settlement workflow.
            </p>
          </div>
          <div className="adminSettlementActions">
            <Link className="primaryLinkButton" href="/internal/admin/streamflow">
              Open Streamflow admin
            </Link>
          </div>
        </section>

        <section className="panel adminSettlementSection">
          <div className="adminSettlementHeader">
            <div>
              <p className="statusEyebrow">Operations</p>
              <h2>Worker health</h2>
            </div>
          </div>
          <div className="historyStatsGrid">
            <article className="historyStatCard">
              <span>Pending</span>
              <strong>{operations.queueStats.pendingCount}</strong>
            </article>
            <article className="historyStatCard">
              <span>Awaiting signatures</span>
              <strong>{operations.queueStats.awaitingSignaturesCount}</strong>
            </article>
            <article className="historyStatCard">
              <span>Submitted</span>
              <strong>{operations.queueStats.submittedCount}</strong>
            </article>
            <article className="historyStatCard">
              <span>Failed</span>
              <strong>{operations.queueStats.failedCount}</strong>
            </article>
            <article className="historyStatCard">
              <span>Stale processing</span>
              <strong>{operations.queueStats.staleProcessingCount}</strong>
            </article>
          </div>

          {operations.workerStatuses.length === 0 ? (
            <p className="exchangeEmpty">No worker heartbeat has been recorded yet.</p>
          ) : (
            <div className="historyList">
              {operations.workerStatuses.map((worker) => (
                <article className="historyItem" key={worker.actor}>
                  <div className="historyItemHeader">
                    <div>
                      <p className="statusEyebrow">Worker</p>
                      <h2>{worker.actor}</h2>
                      <p>Mode {worker.currentMode ?? "unknown"}</p>
                    </div>
                    <div className="historyBadgeGroup">
                      <span className="historyBadge">
                        {worker.isRunning ? "RUNNING" : "IDLE"}
                      </span>
                    </div>
                  </div>
                  <div className="historyStatsGrid">
                    <article className="historyStatCard">
                      <span>Heartbeat</span>
                      <strong>{worker.lastHeartbeatAt ? formatDateTime(worker.lastHeartbeatAt) : "Never"}</strong>
                    </article>
                    <article className="historyStatCard">
                      <span>Started</span>
                      <strong>{worker.lastRunStartedAt ? formatDateTime(worker.lastRunStartedAt) : "Never"}</strong>
                    </article>
                    <article className="historyStatCard">
                      <span>Completed</span>
                      <strong>{worker.lastRunCompletedAt ? formatDateTime(worker.lastRunCompletedAt) : "Never"}</strong>
                    </article>
                  </div>
                  {worker.lastSummary ? (
                    <div className="internalAdminNotice">
                      <strong>Last summary</strong>
                      <p>{worker.lastSummary}</p>
                    </div>
                  ) : null}
                  {worker.lastError ? (
                    <div className="internalAdminNotice">
                      <strong>Last error</strong>
                      <p>{worker.lastError}</p>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="panel adminSettlementSection">
          <div className="adminSettlementHeader">
            <div>
              <p className="statusEyebrow">Treasury</p>
              <h2>Reward token balance</h2>
            </div>
          </div>

          {operations.treasuryBalance ? (
            <div className="historyStatsGrid">
              <article className="historyStatCard">
                <span>Wallet</span>
                <strong>{operations.treasuryBalance.treasuryWalletAddress}</strong>
              </article>
              <article className="historyStatCard">
                <span>Token account</span>
                <strong>{operations.treasuryBalance.treasuryTokenAccountAddress}</strong>
              </article>
              <article className="historyStatCard">
                <span>Balance</span>
                <strong>
                  {formatTokenAtomicAmount(
                    operations.treasuryBalance.rawAmount,
                    operations.treasuryBalance.decimals,
                  )}
                </strong>
              </article>
            </div>
          ) : (
            <div className="internalAdminNotice">
              <strong>Treasury unavailable</strong>
              <p>{operations.treasuryError ?? "Treasury balance could not be loaded."}</p>
            </div>
          )}
        </section>

        <section className="panel adminSettlementSection">
          <div className="adminSettlementHeader">
            <div>
              <p className="statusEyebrow">Nutshell rewards</p>
              <h2>Issue rewards manually</h2>
            </div>
          </div>

          <form action={issueNutshellRewardsAction} className="adminActionForm">
            <label className="withdrawalField">
              <span>Wallet address</span>
              <input name="walletAddress" type="text" />
            </label>
            <label className="withdrawalField">
              <span>Amount</span>
              <input inputMode="numeric" min="1" name="amount" step="1" type="number" />
            </label>
            <label className="withdrawalField">
              <span>Reason</span>
              <select defaultValue="ADMIN_CREDIT" name="reason">
                <option value="ADMIN_CREDIT">ADMIN_CREDIT</option>
                <option value="DISCORD_REWARD">DISCORD_REWARD</option>
              </select>
            </label>
            <label className="withdrawalField">
              <span>Note (optional)</span>
              <input
                name="note"
                placeholder="Optional note for the reward issuance ledger entry"
                type="text"
              />
            </label>
            <button className="primaryLinkButton" type="submit">
              Issue Nutshell rewards
            </button>
          </form>
        </section>
      </section>

      <section className="adminSettlementGrid">
        <SettlementSection decimals={config.peanutTokenDecimals} items={dashboard.pending} title="PENDING" />
        <SettlementSection decimals={config.peanutTokenDecimals} items={dashboard.processing} title="PROCESSING" />
        <SettlementSection decimals={config.peanutTokenDecimals} items={dashboard.awaitingSignatures} title="AWAITING_SIGNATURES" />
        <SettlementSection decimals={config.peanutTokenDecimals} items={dashboard.submitted} title="SUBMITTED" />
        <SettlementSection decimals={config.peanutTokenDecimals} items={dashboard.completed} title="COMPLETED" />
        <SettlementSection decimals={config.peanutTokenDecimals} items={dashboard.failed} title="FAILED" />
      </section>
    </main>
  );
}
