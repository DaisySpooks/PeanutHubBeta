import "server-only";

import { serverEnv } from "@/lib/config/server-env";

export function getMultisigRuntimeConfig() {
  return {
    enabled: serverEnv.MULTISIG_PAYOUT_ENABLED,
    provider: serverEnv.MULTISIG_PAYOUT_PROVIDER ?? null,
  };
}

export function isMultisigPayoutEnabled() {
  return getMultisigRuntimeConfig().enabled;
}
