import "server-only";

import {
  MultisigAdapterError,
  type MultisigPayoutAdapter,
  type MultisigSubmittedPayoutStatus,
  type SquadsExecutionDetectionResult,
  type SquadsPayoutPreparationRequest,
  type SquadsPreparedPayout,
  type SquadsProposalStatus,
  type SquadsSignatureSearchRequest,
  type SquadsSignatureSearchResult,
} from "./multisig-adapter";
import { getMultisigRuntimeConfig } from "./multisig-runtime";
import { SquadsMultisigAdapter } from "./squads-provider-adapter";

class UnsupportedConfiguredMultisigAdapter implements MultisigPayoutAdapter {
  constructor(private readonly provider: string | null) {}

  async preparePayout(request: SquadsPayoutPreparationRequest): Promise<SquadsPreparedPayout> {
    void request;
    throw new MultisigAdapterError(
      `Multisig payout provider ${this.provider ?? "unconfigured"} is not implemented yet.`,
    );
  }

  async getProposalStatus(params: {
    multisigAccountAddress: string;
    transactionIndex: string;
    proposalPda: string;
  }): Promise<SquadsProposalStatus> {
    void params;
    throw new MultisigAdapterError(
      `Multisig payout provider ${this.provider ?? "unconfigured"} is not implemented yet.`,
    );
  }

  async detectExecution(params: {
    multisigAccountAddress: string;
    transactionIndex: string;
    transactionPda: string;
    proposalPda: string;
  }): Promise<SquadsExecutionDetectionResult> {
    void params;
    throw new MultisigAdapterError(
      `Multisig payout provider ${this.provider ?? "unconfigured"} is not implemented yet.`,
    );
  }

  async searchForExecutionSignature(
    request: SquadsSignatureSearchRequest,
  ): Promise<SquadsSignatureSearchResult> {
    void request;
    throw new MultisigAdapterError(
      `Multisig payout provider ${this.provider ?? "unconfigured"} is not implemented yet.`,
    );
  }

  async confirmSubmittedPayout(params: {
    proposalId: string;
    txSignature: string;
    payoutReference: string;
    expectedRecipientWalletAddress: string;
    expectedMintAddress: string;
    expectedNetAmountAtomic: bigint;
  }): Promise<MultisigSubmittedPayoutStatus> {
    void params;
    throw new MultisigAdapterError(
      `Multisig payout provider ${this.provider ?? "unconfigured"} is not implemented yet.`,
    );
  }
}

export function getConfiguredMultisigPayoutAdapter(): MultisigPayoutAdapter {
  const config = getMultisigRuntimeConfig();

  if (!config.enabled) {
    throw new MultisigAdapterError("Multisig payout flow is disabled.");
  }

  if (config.provider === "squads") {
    return new SquadsMultisigAdapter();
  }

  return new UnsupportedConfiguredMultisigAdapter(config.provider);
}
