import type { SquadsSignatureSearchResult } from "./multisig-adapter";

type MatchKind = "memo" | "instruction_hash" | "transfer_tuple";

const MATCH_PRIORITY: Record<MatchKind, number> = {
  memo: 3,
  instruction_hash: 2,
  transfer_tuple: 1,
};

export function classifySquadsExecutionCandidate(params: {
  memo: string | null;
  payoutReference: string;
  preparedInstructionHash: string;
  transferMatched: boolean;
}): MatchKind | null {
  if (params.memo && params.memo.includes(params.payoutReference)) {
    return "memo";
  }

  if (params.memo && params.memo.includes(params.preparedInstructionHash)) {
    return "instruction_hash";
  }

  if (params.transferMatched) {
    return "transfer_tuple";
  }

  return null;
}

export function resolveSquadsExecutionMatches(params: {
  matches: Array<{
    txSignature: string;
    matchedBy: MatchKind;
    detectedAt: Date;
  }>;
  searchedAt: Date;
}): SquadsSignatureSearchResult {
  const deduped = new Map<
    string,
    {
      txSignature: string;
      matchedBy: MatchKind;
      detectedAt: Date;
    }
  >();

  for (const match of params.matches) {
    const existing = deduped.get(match.txSignature);

    if (!existing || MATCH_PRIORITY[match.matchedBy] > MATCH_PRIORITY[existing.matchedBy]) {
      deduped.set(match.txSignature, match);
    }
  }

  const uniqueMatches = Array.from(deduped.values());

  if (uniqueMatches.length === 0) {
    return {
      state: "not_found",
      searchedAt: params.searchedAt,
    };
  }

  if (uniqueMatches.length > 1) {
    return {
      state: "ambiguous",
      candidateTxSignatures: uniqueMatches.map((match) => match.txSignature),
      searchedAt: params.searchedAt,
    };
  }

  return {
    state: "match_found",
    txSignature: uniqueMatches[0].txSignature,
    matchedBy: uniqueMatches[0].matchedBy,
    detectedAt: uniqueMatches[0].detectedAt,
    searchedAt: params.searchedAt,
  };
}
