import type { NutshellActivityItem } from "@/lib/exchanges/queries";

type RecentNutshellActivityProps = {
  currentBalance: number;
  items: NutshellActivityItem[];
};

function formatActivityReason(reason: NutshellActivityItem["reason"]) {
  switch (reason) {
    case "ADMIN_CREDIT":
      return "Manual reward";
    case "DISCORD_REWARD":
      return "Community reward";
    case "EXCHANGE_DEBIT":
      return "Exchange used";
    case "ADMIN_DEBIT":
      return "Manual adjustment";
    case "REFUND":
      return "Refund";
    default:
      return reason;
  }
}

function formatDelta(delta: number) {
  return `${delta > 0 ? "+" : ""}${delta.toLocaleString()} Nutshells`;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

export function RecentNutshellActivity({
  currentBalance,
  items,
}: RecentNutshellActivityProps) {
  return (
    <section className="panel historyPreviewPanel">
      <div className="historySectionHeader">
        <div>
          <p className="statusEyebrow">Nutshell rewards</p>
          <h2>Current balance and recent activity</h2>
          <p>
            Your current in-app reward balance comes from the same append-only ledger that powers
            exchanges and reward credits.
          </p>
        </div>
        <div className="historyBadgeGroup">
          <span className="historyBadge">{currentBalance.toLocaleString()} available</span>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="exchangeEmpty">No Nutshell activity has been recorded for this wallet yet.</p>
      ) : (
        <div className="historyWithdrawalList">
          {items.map((item) => (
            <article className="historyWithdrawalItem" key={item.id}>
              <div>
                <strong>{formatActivityReason(item.reason)}</strong>
                <p>{formatDateTime(item.createdAt)}</p>
              </div>
              <div>
                <strong>{formatDelta(item.delta)}</strong>
                <p>{item.note ?? "No note recorded."}</p>
              </div>
              <div>
                <strong>{item.delta > 0 ? "Credit" : "Debit"}</strong>
                <p>{item.exchangeId ? `Exchange ${item.exchangeId}` : "Reward ledger entry"}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
