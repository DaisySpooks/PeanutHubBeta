import Link from "next/link";

export default function NoAccessPage() {
  return (
    <main className="shell dashboardShell">
      <section className="panel dashboardHero">
        <div>
          <p className="heroKicker">Collection gate</p>
          <h1>No access yet</h1>
          <p>
            Your wallet authenticated successfully, but Nut Reserve could not verify ownership of an
            NFT from the required collection. Connect a wallet that holds the collection NFT to enter
            the dashboard.
          </p>
        </div>
        <Link className="secondaryLinkButton" href="/">
          Back home
        </Link>
      </section>
    </main>
  );
}
