"use client";

import { useState } from "react";

type AttemptSummary = {
  itemId: string;
  reconciliationStatus: string | null;
  lastAttemptTimestamp: string | null;
  lastAttemptOutcome: string | null;
  mismatchReason: string | null;
  manualReviewRequired: boolean;
  manualReviewReason: string | null;
  expected: {
    vestingReference: string | null;
    clientCorrelationId: string | null;
    recipientWalletAddress: string | null;
    mintAddress: string | null;
    amountAtomic: string | null;
    startAt: string | null;
    endAt: string | null;
    vestingKind: string | null;
  };
  observed: {
    scheduleId: string | null;
    beneficiaryAddress: string | null;
    mintAddress: string | null;
    creationTxSignature: string | null;
    scheduleState: string | null;
  };
};

export function StreamflowCopyAttemptSummaryButton({
  summary,
}: {
  summary: AttemptSummary;
}) {
  const [message, setMessage] = useState<string | null>(null);

  function buildMismatchSummary() {
    return {
      itemId: summary.itemId,
      reconciliationStatus: summary.reconciliationStatus,
      lastAttemptTimestamp: summary.lastAttemptTimestamp,
      lastAttemptOutcome: summary.lastAttemptOutcome,
      mismatchReason: summary.mismatchReason,
      manualReviewRequired: summary.manualReviewRequired,
      manualReviewReason: summary.manualReviewReason,
      expected: {
        recipientWalletAddress: summary.expected.recipientWalletAddress,
        mintAddress: summary.expected.mintAddress,
        amountAtomic: summary.expected.amountAtomic,
        startAt: summary.expected.startAt,
        endAt: summary.expected.endAt,
        vestingKind: summary.expected.vestingKind,
      },
      observed: {
        beneficiaryAddress: summary.observed.beneficiaryAddress,
        mintAddress: summary.observed.mintAddress,
        scheduleId: summary.observed.scheduleId,
        scheduleState: summary.observed.scheduleState,
      },
    };
  }

  async function copySummary(mode: "full" | "mismatch") {
    const payload = JSON.stringify(mode === "full" ? summary : buildMismatchSummary(), null, 2);

    try {
      await navigator.clipboard.writeText(payload);
      setMessage(
        mode === "full"
          ? "Latest attempt summary copied."
          : "Mismatch-only summary copied.",
      );
    } catch {
      setMessage("Unable to access clipboard. You can still inspect the summary on this page.");
    }
  }

  return (
    <div className="streamflowCopySummaryAction">
      <button className="secondaryButton" onClick={() => void copySummary("full")} type="button">
        Copy current attempt details
      </button>
      <button
        className="secondaryButton"
        onClick={() => void copySummary("mismatch")}
        type="button"
      >
        Copy mismatch-only summary
      </button>
      {message ? <p className="adminHelperText">{message}</p> : null}
    </div>
  );
}
