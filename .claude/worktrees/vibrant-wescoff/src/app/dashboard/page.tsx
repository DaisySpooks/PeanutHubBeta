import Link from "next/link";
import { redirect } from "next/navigation";
import { ExchangePanel } from "@/components/exchange/exchange-panel";
import { RecentNutshellActivity } from "@/components/rewards/recent-nutshell-activity";
import { getExchangeDashboardData } from "@/lib/exchanges/queries";
import { getProtectedRouteResult } from "@/lib/nft-gating/require-collection-access";

function shortenWalletAddress(walletAddress: string) {
  return `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;
}

export default async function DashboardPage() {
  const result = await getProtectedRouteResult();

  if (result.status === "unauthenticated") {
    redirect("/");
  }

  if (result.status === "forbidden") {
    redirect("/no-access");
  }

  const { user } = result;
  const exchangeData = await getExchangeDashboardData(user.id);

  return (
    <main className="shell dashboardShell">
      <section className="panel dashboardHero">
        <div>
          <p className="heroKicker">Nut Reserve dashboard</p>
          <h1>{shortenWalletAddress(user.walletAddress)}</h1>
          <p>
            This wallet is signed in and loaded from the Nut Reserve user table. From here we can
            track gated access, Nutshell rewards, vesting positions, and withdrawals.
          </p>
        </div>
        <Link className="secondaryLinkButton" href="/">
          Back home
        </Link>
      </section>

      <section className="dashboardGrid">
        <article className="panel dashboardCard">
          <p className="statusEyebrow">Wallet</p>
          <h2>{user.walletAddress}</h2>
          <p>Your Solana wallet address is the primary account identifier for Nut Reserve.</p>
        </article>

        <article className="panel dashboardCard dashboardBalanceCard">
          <p className="statusEyebrow">Nutshell balance</p>
          <h2>{exchangeData.nutshellBalance.toLocaleString()}</h2>
          <p>Derived from the append-only ledger and checked again before every exchange.</p>
        </article>

        <article className="panel dashboardCard">
          <p className="statusEyebrow">Verified collection NFT</p>
          <h2>{user.requiredCollectionMint ?? "Verified"}</h2>
          <p>
            Access was granted because this wallet currently holds an NFT from the required verified
            collection.
          </p>
        </article>

        <article className="panel dashboardCard">
          <p className="statusEyebrow">Created</p>
          <h2>{user.createdAt.toLocaleDateString()}</h2>
          <p>The first successful wallet authentication created this user record.</p>
        </article>

        <article className="panel dashboardCard">
          <p className="statusEyebrow">Collection checked</p>
          <h2>{user.requiredCollectionCheckedAt?.toLocaleString() ?? "Not checked yet"}</h2>
          <p>Updated each protected request when collection ownership is revalidated on the server.</p>
        </article>
      </section>

      <section className="section">
        <ExchangePanel
          exchangeRate={exchangeData.config.exchangeRate}
          nutshellBalance={exchangeData.nutshellBalance}
          peanutTokenDecimals={exchangeData.config.peanutTokenDecimals}
          peanutTokenMintAddress={exchangeData.config.peanutTokenMintAddress}
          recentExchanges={exchangeData.exchanges}
          vestingDays={exchangeData.config.vestingDays}
        />
      </section>

      <section className="section">
        <RecentNutshellActivity
          currentBalance={exchangeData.nutshellBalance}
          items={exchangeData.recentNutshellActivity}
        />
      </section>

      <section className="section">
        <div className="panel historyPreviewPanel">
          <div>
            <p className="statusEyebrow">History and vesting</p>
            <h2>Review exchanges, locks, and withdrawals</h2>
            <p>
              Open the secure history view to inspect past exchanges, active vesting positions,
              locked token amounts, unlock dates, and any withdrawal records tied to this wallet.
            </p>
          </div>
          <Link className="primaryLinkButton" href="/dashboard/history">
            Open history
          </Link>
        </div>
      </section>
    </main>
  );
}
