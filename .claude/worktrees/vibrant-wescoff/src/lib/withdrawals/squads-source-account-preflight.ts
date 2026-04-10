import { MultisigAdapterError } from "./multisig-adapter";

export class SquadsSourceAccountPreflightError extends MultisigAdapterError {
  constructor(
    message: string,
    public readonly context: {
      stage: "source_account_missing" | "source_account_underfunded";
      vaultAddress: string;
      mintAddress: string;
      sourceAccountAddress: string;
      requiredAmountAtomic: string;
      availableAmountAtomic?: string | null;
    },
  ) {
    super(message);
    this.name = "SquadsSourceAccountPreflightError";
  }
}

export type SquadsSourceAccountSnapshot =
  | {
      exists: false;
    }
  | {
      exists: true;
      availableAmountAtomic: bigint;
    };

export async function assertSquadsSourceAccountReady(params: {
  vaultAddress: string;
  mintAddress: string;
  sourceAccountAddress: string;
  requiredAmountAtomic: bigint;
  loadSnapshot: () => Promise<SquadsSourceAccountSnapshot>;
}) {
  const snapshot = await params.loadSnapshot();

  if (!snapshot.exists) {
    throw new SquadsSourceAccountPreflightError(
      `Squads payout preparation cannot run because vault ${params.vaultAddress} does not have the required source token account ${params.sourceAccountAddress} for mint ${params.mintAddress}.`,
      {
        stage: "source_account_missing",
        vaultAddress: params.vaultAddress,
        mintAddress: params.mintAddress,
        sourceAccountAddress: params.sourceAccountAddress,
        requiredAmountAtomic: params.requiredAmountAtomic.toString(),
        availableAmountAtomic: null,
      },
    );
  }

  if (snapshot.availableAmountAtomic < params.requiredAmountAtomic) {
    throw new SquadsSourceAccountPreflightError(
      `Squads payout preparation cannot run because source token account ${params.sourceAccountAddress} only holds ${snapshot.availableAmountAtomic.toString()} atomic units for mint ${params.mintAddress}, but ${params.requiredAmountAtomic.toString()} are required.`,
      {
        stage: "source_account_underfunded",
        vaultAddress: params.vaultAddress,
        mintAddress: params.mintAddress,
        sourceAccountAddress: params.sourceAccountAddress,
        requiredAmountAtomic: params.requiredAmountAtomic.toString(),
        availableAmountAtomic: snapshot.availableAmountAtomic.toString(),
      },
    );
  }
}
