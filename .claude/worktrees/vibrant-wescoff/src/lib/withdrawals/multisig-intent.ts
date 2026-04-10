import crypto from "node:crypto";

export function buildWithdrawalPayoutReference(withdrawalId: string) {
  return `withdrawal:${withdrawalId}:v1`;
}

export function buildWithdrawalPayoutMemo(withdrawalId: string, payoutReference: string) {
  return `peanut-withdrawal:${withdrawalId}:${payoutReference}`;
}

export function hashPreparedInstructionPayload(payload: unknown) {
  const serialized = JSON.stringify(payload, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value,
  );

  return crypto.createHash("sha256").update(serialized).digest("hex");
}
