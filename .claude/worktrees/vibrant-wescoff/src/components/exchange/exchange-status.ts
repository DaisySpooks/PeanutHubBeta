type ExchangeStatusSummaryParams = {
  status: string;
  unlockAt?: string;
  streamflowLifecycleStatus?: string | null;
  streamflowScheduleId?: string | null;
};

export function getExchangeStatusSummary(params: ExchangeStatusSummaryParams) {
  if (params.status === "FAILED") {
    return "This exchange failed and needs attention before it can continue.";
  }

  if (params.status === "COMPLETED") {
    return "This exchange is complete and the vesting record is in place.";
  }

  if (params.streamflowLifecycleStatus === "matched") {
    return "Accepted and matched to a Streamflow vesting artifact.";
  }

  if (params.streamflowLifecycleStatus === "created" && params.streamflowScheduleId) {
    return "Accepted and created in Streamflow. Vesting is now tracked on-chain.";
  }

  if (params.streamflowLifecycleStatus === "expected_only") {
    return params.unlockAt
      ? `Accepted and queued for vesting. Current unlock target: ${new Date(params.unlockAt).toLocaleDateString()}.`
      : "Accepted and queued for vesting.";
  }

  if (params.status === "PENDING") {
    return "Accepted and waiting for the vesting flow to advance.";
  }

  return "Submitted and being tracked through the vesting flow.";
}
