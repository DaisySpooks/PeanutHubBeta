import assert from "node:assert/strict";
import test from "node:test";
import {
  classifySquadsExecutionCandidate,
  resolveSquadsExecutionMatches,
} from "./squads-signature-match";

test("prefers memo over instruction-hash and transfer-tuple matches for the same candidate", () => {
  const matchedBy = classifySquadsExecutionCandidate({
    memo: "peanut-withdrawal:wd_1:withdrawal:wd_1:v1 prepared-hash-1",
    payoutReference: "withdrawal:wd_1:v1",
    preparedInstructionHash: "prepared-hash-1",
    transferMatched: true,
  });

  assert.equal(matchedBy, "memo");
});

test("uses instruction_hash when memo contains the prepared instruction hash but not the payout reference", () => {
  const matchedBy = classifySquadsExecutionCandidate({
    memo: "prepared-hash-1",
    payoutReference: "withdrawal:wd_1:v1",
    preparedInstructionHash: "prepared-hash-1",
    transferMatched: false,
  });

  assert.equal(matchedBy, "instruction_hash");
});

test("falls back to transfer_tuple when memo does not match", () => {
  const matchedBy = classifySquadsExecutionCandidate({
    memo: null,
    payoutReference: "withdrawal:wd_1:v1",
    preparedInstructionHash: "prepared-hash-1",
    transferMatched: true,
  });

  assert.equal(matchedBy, "transfer_tuple");
});

test("dedupes the same signature and keeps the strongest match kind", () => {
  const result = resolveSquadsExecutionMatches({
    searchedAt: new Date("2026-04-03T00:00:00.000Z"),
    matches: [
      {
        txSignature: "sig-1",
        matchedBy: "transfer_tuple",
        detectedAt: new Date("2026-04-03T00:01:00.000Z"),
      },
      {
        txSignature: "sig-1",
        matchedBy: "memo",
        detectedAt: new Date("2026-04-03T00:01:00.000Z"),
      },
    ],
  });

  assert.equal(result.state, "match_found");
  if (result.state !== "match_found") {
    throw new Error("Expected a single match.");
  }
  assert.equal(result.txSignature, "sig-1");
  assert.equal(result.matchedBy, "memo");
});

test("returns ambiguous when different signatures match on different criteria", () => {
  const result = resolveSquadsExecutionMatches({
    searchedAt: new Date("2026-04-03T00:00:00.000Z"),
    matches: [
      {
        txSignature: "sig-1",
        matchedBy: "memo",
        detectedAt: new Date("2026-04-03T00:01:00.000Z"),
      },
      {
        txSignature: "sig-2",
        matchedBy: "transfer_tuple",
        detectedAt: new Date("2026-04-03T00:02:00.000Z"),
      },
    ],
  });

  assert.equal(result.state, "ambiguous");
  if (result.state !== "ambiguous") {
    throw new Error("Expected ambiguous result.");
  }
  assert.deepEqual(result.candidateTxSignatures, ["sig-1", "sig-2"]);
});
