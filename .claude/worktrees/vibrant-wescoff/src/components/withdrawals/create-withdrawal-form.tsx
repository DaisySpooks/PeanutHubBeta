"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatTokenAtomicAmount } from "@/lib/exchanges/token-format";

type CreateWithdrawalFormProps = {
  vestingPositionId: string;
  remainingAmount: string;
  peanutTokenDecimals: number;
  canWithdraw: boolean;
  unlockAt: string;
  withdrawalsEnabled: boolean;
  currentFeeTier: {
    thresholdDaysAfterUnlock: number;
    feePercent: string;
    label: string | null;
    currentDaysAfterUnlock: number;
  } | null;
  initialPreview: {
    requestedAmount: string;
    estimatedFeeAmount: string;
    estimatedNetAmount: string;
    selectedTier: {
      thresholdDaysAfterUnlock: number;
      feePercent: string;
      label: string | null;
    };
  } | null;
};

export function CreateWithdrawalForm({
  vestingPositionId,
  remainingAmount,
  peanutTokenDecimals,
  canWithdraw,
  unlockAt,
  withdrawalsEnabled,
  currentFeeTier,
  initialPreview,
}: CreateWithdrawalFormProps) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [preview, setPreview] = useState(initialPreview);

  useEffect(() => {
    if (!withdrawalsEnabled || !canWithdraw) {
      setPreview(initialPreview);
      setPreviewError(null);
      return;
    }

    const requestedAmount = amount.trim();
    const controller = new AbortController();

    async function loadPreview() {
      try {
        const response = await fetch("/api/withdrawals/preview", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            vestingPositionId,
            amount: requestedAmount || undefined,
          }),
          signal: controller.signal,
        });

        const data = (await response.json()) as {
          error?: string;
          preview?: NonNullable<typeof initialPreview>;
        };

        if (!response.ok || !data.preview) {
          throw new Error(data.error || "Unable to preview withdrawal.");
        }

        setPreview(data.preview);
        setPreviewError(null);
      } catch (caughtError) {
        if (controller.signal.aborted) {
          return;
        }

        const message =
          caughtError instanceof Error ? caughtError.message : "Unable to preview withdrawal.";
        setPreview(null);
        setPreviewError(message);
      }
    }

    void loadPreview();

    return () => {
      controller.abort();
    };
  }, [amount, canWithdraw, initialPreview, vestingPositionId, withdrawalsEnabled]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!withdrawalsEnabled) {
      setError("Withdrawals are currently disabled by system configuration.");
      return;
    }

    if (!canWithdraw) {
      setError(`This position is locked until ${new Date(unlockAt).toLocaleString()}.`);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/withdrawals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          vestingPositionId,
          amount,
        }),
      });

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error || "Unable to create withdrawal.");
      }

      setAmount("");
      router.refresh();
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Unable to create withdrawal.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="withdrawalForm" onSubmit={handleSubmit}>
      <label className="withdrawalField">
        <span>Withdrawal amount</span>
        <input
          inputMode="decimal"
          min="0"
          name="amount"
          onChange={(event) => setAmount(event.target.value)}
          placeholder={formatTokenAtomicAmount(remainingAmount, peanutTokenDecimals)}
          step="any"
          type="text"
          value={amount}
        />
      </label>

      <div className="withdrawalMeta">
        <p>Available to request</p>
        <strong>{formatTokenAtomicAmount(remainingAmount, peanutTokenDecimals)} PEANUT</strong>
        <span>
          {!withdrawalsEnabled
            ? "Withdrawals are currently disabled by system configuration."
            : canWithdraw
            ? "Eligibility is checked again on the server before the request is accepted."
            : `Locked until ${new Date(unlockAt).toLocaleString()}.`}
        </span>
      </div>

      <div className="withdrawalPreviewCard">
        <p>Selected fee tier</p>
        <strong>
          {preview?.selectedTier.feePercent ?? currentFeeTier?.feePercent ?? "0.00"}% fee
        </strong>
        <span>
          {preview?.selectedTier.label ??
            currentFeeTier?.label ??
            "Current active withdrawal tier"}
        </span>
        <span>
          Threshold day:{" "}
          {preview?.selectedTier.thresholdDaysAfterUnlock ??
            currentFeeTier?.thresholdDaysAfterUnlock ??
            0}
          {" • "}Current days after unlock: {currentFeeTier?.currentDaysAfterUnlock ?? 0}
        </span>
        <span>
          Estimated fee:{" "}
          {preview
            ? formatTokenAtomicAmount(preview.estimatedFeeAmount, peanutTokenDecimals)
            : "0"}{" "}
          PEANUT
          {" • "}Estimated net:{" "}
          {preview
            ? formatTokenAtomicAmount(preview.estimatedNetAmount, peanutTokenDecimals)
            : "0"}{" "}
          PEANUT
        </span>
        {previewError ? <span className="authError">{previewError}</span> : null}
      </div>

      <div className="authActions">
        <button
          className="primaryLinkButton"
          disabled={isSubmitting || !canWithdraw || !withdrawalsEnabled || !preview}
          type="submit"
        >
          {isSubmitting ? "Creating withdrawal..." : "Create withdrawal"}
        </button>
      </div>

      {error ? <p className="authError">{error}</p> : null}
    </form>
  );
}
