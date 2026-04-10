export class MultisigAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MultisigAdapterError";
  }
}

export type SupportedMultisigProvider = "squads";

export type SquadsPayoutPreparationRequest = {
  withdrawalId: string;
  payoutReference: string;
  recipientWalletAddress: string;
  mintAddress: string;
  netAmountAtomic: bigint;
  decimals: number;
  memo: string;
  preparedInstructionHash: string;
};

export type SquadsPreparedPayout = {
  provider: SupportedMultisigProvider;
  multisigAccountAddress: string;
  vaultIndex: number;
  transactionIndex: string;
  transactionPda: string;
  proposalPda: string;
  proposalId: string;
  proposalStatus: string;
  preparedInstructionHash: string;
  preparedAt: Date;
};

export type SquadsProposalStatus =
  | {
      state: "awaiting_signatures";
      proposalStatusRaw: string;
      approvalsCollected?: number;
      approvalsRequired?: number;
      lastCheckedAt: Date;
    }
  | {
      state: "ready_for_execution";
      proposalStatusRaw: string;
      approvalsCollected?: number;
      approvalsRequired?: number;
      lastCheckedAt: Date;
    }
  | {
      state: "cancelled";
      proposalStatusRaw: string;
      reason?: string;
      lastCheckedAt: Date;
    };

export type SquadsExecutionDetectionResult =
  | {
      state: "not_executed";
      proposalStatusRaw: string;
      executionStatusRaw?: string;
      lastCheckedAt: Date;
    }
  | {
      state: "execution_suspected";
      proposalStatusRaw: string;
      executionStatusRaw?: string;
      detectionSource: "squads_state";
      lastCheckedAt: Date;
    }
  | {
      state: "signature_found";
      proposalStatusRaw: string;
      executionStatusRaw?: string;
      txSignature: string;
      detectedAt: Date;
      detectionSource: "event" | "chain_search";
      matchedBy: "memo" | "instruction_hash" | "transfer_tuple";
      lastCheckedAt: Date;
    }
  | {
      state: "ambiguous";
      proposalStatusRaw: string;
      executionStatusRaw?: string;
      candidateTxSignatures: string[];
      lastCheckedAt: Date;
    };

export type SquadsSignatureSearchRequest = {
  multisigAccountAddress: string;
  vaultIndex: number;
  transactionIndex: string;
  transactionPda: string;
  proposalPda: string;
  payoutReference: string;
  expectedRecipientWalletAddress: string;
  expectedMintAddress: string;
  expectedNetAmountAtomic: bigint;
  preparedInstructionHash: string;
  searchWindowStart: Date;
  searchWindowEnd: Date;
};

export type SquadsSignatureSearchResult =
  | {
      state: "not_found";
      searchedAt: Date;
    }
  | {
      state: "match_found";
      txSignature: string;
      matchedBy: "memo" | "instruction_hash" | "transfer_tuple";
      detectedAt: Date;
      searchedAt: Date;
    }
  | {
      state: "ambiguous";
      candidateTxSignatures: string[];
      searchedAt: Date;
    };

export type MultisigSubmittedPayoutStatus =
  | {
      state: "submitted";
      txSignature: string;
      proposalStatus: string;
      lastCheckedAt: Date;
    }
  | {
      state: "confirmed";
      txSignature: string;
      confirmedAt: Date;
      recipientWalletAddress: string;
      mintAddress: string;
      netAmountAtomic: bigint;
      slot?: number;
      proposalStatus: string;
      lastCheckedAt: Date;
    };

export interface MultisigPayoutAdapter {
  preparePayout(request: SquadsPayoutPreparationRequest): Promise<SquadsPreparedPayout>;
  getProposalStatus(params: {
    multisigAccountAddress: string;
    transactionIndex: string;
    proposalPda: string;
  }): Promise<SquadsProposalStatus>;
  detectExecution(params: {
    multisigAccountAddress: string;
    transactionIndex: string;
    transactionPda: string;
    proposalPda: string;
  }): Promise<SquadsExecutionDetectionResult>;
  searchForExecutionSignature(
    request: SquadsSignatureSearchRequest,
  ): Promise<SquadsSignatureSearchResult>;
  confirmSubmittedPayout(params: {
    proposalId: string;
    txSignature: string;
    payoutReference: string;
    expectedRecipientWalletAddress: string;
    expectedMintAddress: string;
    expectedNetAmountAtomic: bigint;
  }): Promise<MultisigSubmittedPayoutStatus>;
}
