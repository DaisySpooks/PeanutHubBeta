import Link from "next/link";
import { redirect } from "next/navigation";
import { CreateWithdrawalForm } from "@/components/withdrawals/create-withdrawal-form";
import { getWithdrawalReadinessSummary } from "@/components/withdrawals/withdrawal-readiness";
import { formatTokenAtomicAmount } from "@/lib/exchanges/token-format";
import { getProtectedRouteResult } from "@/lib/nft-gating/require-collection-access";
import { getAccountHistory } from "@/lib/account-history/queries";

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

export default async function DashboardHistoryPage() {
  const result = await getProtectedRouteResult();

  if (result.status === "unauthenticated") {
    redirect("/");
  }

  if (result.status === "forbidden") {
    redirect("/no-access");
  }

  const history = await getAccountHistory(result.user.id);
  const decimals = history.config.peanutTokenDecimals;

  return (
    <main className="shell dashboardShell">
      <section className="panel dashboardHero">
        <div>
          <p className="heroKicker">Exchange history</p>
          <h1>Vesting and withdrawals</h1>
          <p>
            Every record here is fetched on the server for the signed-in wallet only. Exchange,
            vesting, and withdrawal status are all scoped from the authenticated session rather than
            any client-supplied wallet input.
          </p>
        </div>
        <div className="authActions">
          <Link className="secondaryLinkButton" href="/dashboard">
            Back to dashboard
          </Link>
        </div>
      </section>

      <section className="panel historyPanel">
        <div className="historyPanelHeader">
          <div>
            <p className="statusEyebrow">Authenticated wallet</p>
            <h2>{result.user.walletAddress}</h2>
          </div>
          <p className="historyMeta">
            Configured vesting period: {history.config.vestingDays} days. Token mint:{" "}
            {history.config.peanutTokenMintAddress}
          </p>
        </div>

        {history.items.length === 0 ? (
          <p className="exchangeEmpty">
            No exchanges yet. Once a Nutshell exchange is created, the vesting position and any
            future withdrawals will appear here.
          </p>
        ) : (
          <div className="historyList">
            {history.items.map((item) => (
              <article className="historyItem" key={item.id}>
                {item.vestingPosition
                  ? (() => {
                      const readiness = getWithdrawalReadinessSummary({
                        unlockAt: item.vestingPosition.unlockAt,
                        canWithdraw: item.vestingPosition.canWithdraw,
                        isUnlocked: item.vestingPosition.isUnlocked,
                        remainingAmount: item.vestingPosition.remainingAmount,
                      });

                      return (
                        <div className="internalAdminNotice">
                          <strong>{readiness.title}</strong>
                          <p>{readiness.detail}</p>
                        </div>
                      );
                    })()
                  : null}
                <div className="historyItemHeader">
                  <div>
                    <p className="statusEyebrow">Exchange</p>
                    <h2>{item.id}</h2>
                    <p>
                      {item.nutshellAmount.toLocaleString()} Nutshells exchanged at rate{" "}
                      {item.exchangeRate}.
                    </p>
                  </div>
                  <div className="historyBadgeGroup">
                    <span className="historyBadge">{item.status}</span>
                    {item.vestingPosition?.latestWithdrawalStatus ? (
                      <span className="historyBadge historyBadgeMuted">
                        Latest withdrawal: {item.vestingPosition.latestWithdrawalStatus}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="historyStatsGrid">
                  <article className="historyStatCard">
                    <span>PEANUT received</span>
                    <strong>{formatTokenAtomicAmount(item.tokenAmount, decimals)}</strong>
                  </article>
                  <article className="historyStatCard">
                    <span>Exchange created</span>
                    <strong>{formatDateTime(item.createdAt)}</strong>
                  </article>
                  <article className="historyStatCard">
                    <span>Exchange status</span>
                    <strong>{item.status}</strong>
                  </article>
                </div>

                {item.vestingPosition ? (
                  <section className="historySection">
                    <div className="historySectionHeader">
                      <div>
                        <p className="statusEyebrow">Vesting position</p>
                        <h3>{item.vestingPosition.id}</h3>
                      </div>
                      <span className="historyBadge">{item.vestingPosition.status}</span>
                    </div>

                    <div className="historyStatsGrid">
                      <article className="historyStatCard">
                        <span>Locked amount</span>
                        <strong>
                          {formatTokenAtomicAmount(item.vestingPosition.lockedAmount, decimals)}
                        </strong>
                      </article>
                      <article className="historyStatCard">
                        <span>Withdrawn amount</span>
                        <strong>
                          {formatTokenAtomicAmount(item.vestingPosition.withdrawnAmount, decimals)}
                        </strong>
                      </article>
                      <article className="historyStatCard">
                        <span>Unlock date</span>
                        <strong>{formatDateTime(item.vestingPosition.unlockAt)}</strong>
                      </article>
                      <article className="historyStatCard">
                        <span>Available to withdraw</span>
                        <strong>
                          {formatTokenAtomicAmount(item.vestingPosition.remainingAmount, decimals)}
                        </strong>
                      </article>
                    </div>

                    <div className="historySubsection">
                      <div className="historySectionHeader">
                        <div>
                          <p className="statusEyebrow">Create withdrawal</p>
                          <h3>{getWithdrawalReadinessSummary({
                            unlockAt: item.vestingPosition.unlockAt,
                            canWithdraw: item.vestingPosition.canWithdraw,
                            isUnlocked: item.vestingPosition.isUnlocked,
                            remainingAmount: item.vestingPosition.remainingAmount,
                          }).title}</h3>
                        </div>
                        <span className="historyBadge historyBadgeMuted">
                          {getWithdrawalReadinessSummary({
                            unlockAt: item.vestingPosition.unlockAt,
                            canWithdraw: item.vestingPosition.canWithdraw,
                            isUnlocked: item.vestingPosition.isUnlocked,
                            remainingAmount: item.vestingPosition.remainingAmount,
                          }).badge}
                        </span>
                      </div>

                      <CreateWithdrawalForm
                        canWithdraw={item.vestingPosition.canWithdraw}
                        currentFeeTier={item.vestingPosition.currentFeeTier}
                        initialPreview={
                          item.vestingPosition.currentFeeTier &&
                          item.vestingPosition.currentFeePreview
                            ? {
                                requestedAmount: item.vestingPosition.remainingAmount,
                                estimatedFeeAmount:
                                  item.vestingPosition.currentFeePreview.estimatedFeeAmount,
                                estimatedNetAmount:
                                  item.vestingPosition.currentFeePreview.estimatedNetAmount,
                                selectedTier: {
                                  thresholdDaysAfterUnlock:
                                    item.vestingPosition.currentFeeTier.thresholdDaysAfterUnlock,
                                  feePercent: item.vestingPosition.currentFeeTier.feePercent,
                                  label: item.vestingPosition.currentFeeTier.label,
                                },
                              }
                            : null
                        }
                        peanutTokenDecimals={decimals}
                        remainingAmount={item.vestingPosition.remainingAmount}
                        unlockAt={item.vestingPosition.unlockAt}
                        vestingPositionId={item.vestingPosition.id}
                        withdrawalsEnabled={item.vestingPosition.withdrawalsEnabled}
                      />
                    </div>

                    <div className="historySubsection">
                      <div className="historySectionHeader">
                        <div>
                          <p className="statusEyebrow">Withdrawals</p>
                          <h3>{item.vestingPosition.withdrawals.length}</h3>
                        </div>
                      </div>

                      {item.vestingPosition.withdrawals.length === 0 ? (
                        <p className="exchangeEmpty">
                          No withdrawals have been created for this vesting position yet.
                        </p>
                      ) : (
                        <div className="historyWithdrawalList">
                          {item.vestingPosition.withdrawals.map((withdrawal) => (
                            <article className="historyWithdrawalItem" key={withdrawal.id}>
                              <div>
                                <strong>{withdrawal.status}</strong>
                                <p>Created {formatDateTime(withdrawal.createdAt)}</p>
                              </div>
                              <div>
                                <strong>
                                  {formatTokenAtomicAmount(withdrawal.netAmount, decimals)} PEANUT net
                                </strong>
                                <p>
                                  Gross {formatTokenAtomicAmount(withdrawal.grossAmount, decimals)}
                                  {" • "}Fee {formatTokenAtomicAmount(withdrawal.feeAmount, decimals)}
                                </p>
                              </div>
                              <div>
                                <strong>{withdrawal.feePercent}% fee</strong>
                                <p>{withdrawal.daysAfterUnlock} days after unlock</p>
                              </div>
                            </article>
                          ))}
                        </div>
                      )}
                    </div>
                  </section>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
