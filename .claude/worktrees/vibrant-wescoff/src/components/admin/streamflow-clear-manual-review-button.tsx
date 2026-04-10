"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function StreamflowClearManualReviewButton({
  vestingPositionId,
  disabled = false,
}: {
  vestingPositionId: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [operatorNote, setOperatorNote] = useState("");

  async function clearManualReview() {
    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch("/api/internal/vesting/streamflow/manual-review/clear", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          vestingPositionId,
          operatorNote: operatorNote.trim() || undefined,
        }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Unable to clear manual review.");
        return;
      }

      setSuccessMessage("Manual review cleared successfully. Refreshing item state…");
      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to clear manual review.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="streamflowManualReviewAction">
      <label className="withdrawalField">
        <span>Optional operator note</span>
        <input
          onChange={(event) => setOperatorNote(event.target.value)}
          placeholder="Why this clear is safe after the matched rerun"
          type="text"
          value={operatorNote}
        />
      </label>
      <button
        className="secondaryButton"
        disabled={disabled || isSubmitting}
        onClick={() => void clearManualReview()}
        type="button"
      >
        {isSubmitting ? "Clearing…" : "Clear manual review"}
      </button>
      {successMessage ? <p className="adminHelperText">{successMessage}</p> : null}
      {error ? <p className="formError">{error}</p> : null}
    </div>
  );
}
