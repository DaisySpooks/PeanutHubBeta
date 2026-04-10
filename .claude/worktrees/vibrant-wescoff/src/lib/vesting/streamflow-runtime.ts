import "server-only";

import { serverEnv } from "@/lib/config/server-env";

export function getStreamflowRuntimeConfig() {
  return {
    enabled: serverEnv.STREAMFLOW_INTEGRATION_ENABLED,
    adapterMode: serverEnv.STREAMFLOW_ADAPTER_MODE,
    createEnabled: serverEnv.STREAMFLOW_CREATE_ENABLED,
    reconcileEnabled: serverEnv.STREAMFLOW_RECONCILE_ENABLED,
    sdkExecutionEnabled: serverEnv.STREAMFLOW_SDK_EXECUTION_ENABLED,
    sdkAllowsProduction: serverEnv.STREAMFLOW_SDK_ALLOW_PRODUCTION,
    cluster: serverEnv.STREAMFLOW_CLUSTER ?? null,
    apiUrl: serverEnv.STREAMFLOW_API_URL ?? null,
    treasuryAddress: serverEnv.STREAMFLOW_TREASURY_ADDRESS ?? null,
    senderConfigured: Boolean(serverEnv.STREAMFLOW_SENDER_SECRET_KEY),
  };
}

export function isStreamflowIntegrationEnabled() {
  return getStreamflowRuntimeConfig().enabled;
}
