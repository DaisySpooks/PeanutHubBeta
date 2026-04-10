"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getExchangeImpact } from "@/components/exchange/exchange-impact";
import { getExchangeStatusSummary } from "@/components/exchange/exchange-status";
import { formatExchangeQuote, formatTokenAtomicAmount } from "@/lib/exchanges/token-format";

type ExchangeSummary = {
  id: string;
  nutshellAmount: number;
  tokenAmount: string;
  exchangeRate: string;
  status: string;
  failureReason: string | null;
  createdAt: string;
  vestingPosition: {
    id: string;
    unlockAt: string;
    status: string;
    vestingProvider?: string | null;
    streamflowLifecycleStatus?: string | null;
    streamflowScheduleId?: string | null;
  } | null;
};

type ExchangePanelProps = {
  nutshellBalance: number;
  exchangeRate: string;
  vestingDays: number;
  peanutTokenDecimals: number;
  peanutTokenMintAddress: string;
  recentExchanges: ExchangeSummary[];
};

export function ExchangePanel({
  nutshellBalance,
  exchangeRate,
  vestingDays,
  peanutTokenDecimals,
  peanutTokenMintAddress,
  recentExchanges,
}: ExchangePanelProps) {
  const router = useRouter();
  const [nutshellAmount, setNutshellAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const parsedNutshellAmount = Number.parseInt(nutshellAmount, 10);
  const quote = useMemo(() => {
    if (!Number.isInteger(parsedNutshellAmount) || parsedNutshellAmount <= 0) {
      return null;
    }

    return formatExchangeQuote(parsedNutshellAmount, exchangeRate, peanutTokenDecimals);
  }, [exchangeRate, parsedNutshellAmount, peanutTokenDecimals]);
  const exchangeImpact = useMemo(
    () =>
      getExchangeImpact({
        nutshellBalance,
        parsedNutshellAmount,
      }),
    [nutshellBalance, parsedNutshellAmount],
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const amount = Number.parseInt(nutshellAmount, 10);
    if (!Number.isInteger(amount) || amount <= 0) {
      setError("Enter a positive whole-number Nutshell amount.");
      return;
    }

    if (amount > nutshellBalance) {
      setError("You do not have enough Nutshells available for that exchange.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch("/api/exchanges", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ nutshellAmount: amount }),
      });

      const data = (await response.json()) as {
        error?: string;
        exchange?: {
          nutshellAmount: number;
          tokenAmount: string;
          remainingBalance: number;
          vestingPosition?: {
            unlockAt: string;
          } | null;
        };
      };

      if (!response.ok) {
        throw new Error(data.error || "Unable to create exchange.");
      }

      if (data.exchange) {
        const unlockText = data.exchange.vestingPosition?.unlockAt
          ? ` Unlock target: ${new Date(data.exchange.vestingPosition.unlockAt).toLocaleDateString()}.`
          : "";

        setSuccessMessage(
          `Exchange accepted. Used ${data.exchange.nutshellAmount.toLocaleString()} Nutshells, locked ${formatTokenAtomicAmount(data.exchange.tokenAmount, peanutTokenDecimals)} PEANUT, and left ${data.exchange.remainingBalance.toLocaleString()} Nutshells available.${unlockText}`,
        );
      }

      setNutshellAmount("");
      router.refresh();
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Unable to create exchange.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="panel exchangePanel">
      <div className="exchangePanelHeader">
        <div>
          <p className="statusEyebrow">Exchange Nutshells</p>
          <h2>Move Nutshell rewards into token vesting</h2>
        </div>
        <p className="exchangeHint">Server-side balance checks and NFT gating are enforced on every request.</p>
      </div>

      {successMessage ? (
        <div className="internalAdminNotice">
          <strong>Exchange accepted</strong>
          <p>{successMessage}</p>
        </div>
      ) : null}

      <div className="exchangeMetaGrid">
        <article className="exchangeMetaCard">
          <span>Available Nutshells</span>
          <strong>{nutshellBalance.toLocaleString()} Nutshells</strong>
        </article>
        <article className="exchangeMetaCard">
          <span>Exchange rate</span>
          <strong>{exchangeRate} PEANUT / Nutshell</strong>
        </article>
        <article className="exchangeMetaCard">
          <span>Vesting period</span>
          <strong>{vestingDays} days</strong>
        </article>
      </div>

      <form className="exchangeForm" onSubmit={handleSubmit}>
        <label className="exchangeField">
          <span>Nutshell amount</span>
          <input
            inputMode="numeric"
            min="1"
            name="nutshellAmount"
            onChange={(event) => setNutshellAmount(event.target.value)}
            placeholder="250"
            step="1"
            type="number"
            value={nutshellAmount}
          />
        </label>

        <div className="exchangeQuote">
          <p>Exchange impact</p>
          <strong>{quote ? `${quote} PEANUT` : "Enter an amount"}</strong>
          {exchangeImpact ? (
            exchangeImpact.exceedsBalance ? (
              <span className="authError">
                This request uses {exchangeImpact.requestedAmount.toLocaleString()} Nutshells, which
                is more than your available balance.
              </span>
            ) : (
              <span>
                Uses {exchangeImpact.requestedAmount.toLocaleString()} Nutshells and leaves{" "}
                {exchangeImpact.remainingBalance.toLocaleString()} available after the exchange.
              </span>
            )
          ) : (
            <span>Choose how many Nutshells you want to move into the current exchange rate.</span>
          )}
          <span>Mint: {peanutTokenMintAddress}</span>
        </div>

        <div className="authActions">
          <button
            className="primaryLinkButton"
            disabled={isSubmitting || Boolean(exchangeImpact?.exceedsBalance)}
            type="submit"
          >
            {isSubmitting ? "Creating exchange..." : "Exchange Nutshells"}
          </button>
        </div>

        {error ? <p className="authError">{error}</p> : null}
      </form>

      <div className="exchangeHistory">
        <div className="exchangeHistoryHeader">
          <p className="statusEyebrow">Recent exchanges</p>
          <div className="authActions">
            <span>Newest first</span>
            <a className="secondaryLinkButton" href="/dashboard/history">
              Full history
            </a>
          </div>
        </div>

        {recentExchanges.length === 0 ? (
          <p className="exchangeEmpty">No exchanges yet. Your first successful exchange will create a vesting position automatically.</p>
        ) : (
          <div className="exchangeHistoryList">
            {recentExchanges.map((exchange) => (
              <article className="exchangeHistoryItem" key={exchange.id}>
                <div>
                  <strong>{exchange.nutshellAmount.toLocaleString()} Nutshells</strong>
                  <p>{formatTokenAtomicAmount(exchange.tokenAmount, peanutTokenDecimals)} PEANUT locked</p>
                </div>
                <div>
                  <strong>{exchange.status}</strong>
                  <p>
                    {getExchangeStatusSummary({
                      status: exchange.status,
                      unlockAt: exchange.vestingPosition?.unlockAt,
                      streamflowLifecycleStatus:
                        exchange.vestingPosition?.streamflowLifecycleStatus ?? null,
                      streamflowScheduleId: exchange.vestingPosition?.streamflowScheduleId ?? null,
                    })}
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
