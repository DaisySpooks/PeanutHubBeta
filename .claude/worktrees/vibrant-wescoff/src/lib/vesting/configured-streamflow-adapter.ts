import "server-only";

import { serverEnv } from "@/lib/config/server-env";
import { MockStreamflowAdapter } from "./mock-streamflow-adapter";
import { RealStreamflowAdapter } from "./streamflow-provider-adapter";
import {
  StreamflowAdapterError,
  type StreamflowAdapter,
  type StreamflowCreatedSchedule,
  type StreamflowPreparedSchedule,
  type StreamflowScheduleRequest,
  type StreamflowScheduleSearchRequest,
  type StreamflowScheduleSearchResult,
  type StreamflowScheduleStatus,
} from "./streamflow-adapter";

class DisabledStreamflowAdapter implements StreamflowAdapter {
  private throwDisabled(): never {
    throw new StreamflowAdapterError(
      "Streamflow integration is disabled. Enable the Streamflow boundary explicitly before using it.",
    );
  }

  async prepareSchedule(request: StreamflowScheduleRequest): Promise<StreamflowPreparedSchedule> {
    void request;
    this.throwDisabled();
  }

  async createSchedule(request: StreamflowScheduleRequest): Promise<StreamflowCreatedSchedule> {
    void request;
    this.throwDisabled();
  }

  async getScheduleStatus(params: {
    vestingReference: string;
    scheduleId: string;
  }): Promise<StreamflowScheduleStatus> {
    void params;
    this.throwDisabled();
  }

  async searchForSchedule(
    request: StreamflowScheduleSearchRequest,
  ): Promise<StreamflowScheduleSearchResult> {
    void request;
    this.throwDisabled();
  }
}

export function getConfiguredStreamflowAdapter(): StreamflowAdapter {
  if (!serverEnv.STREAMFLOW_INTEGRATION_ENABLED) {
    return new DisabledStreamflowAdapter();
  }

  if (serverEnv.STREAMFLOW_ADAPTER_MODE === "mock") {
    return new MockStreamflowAdapter();
  }

  if (serverEnv.STREAMFLOW_ADAPTER_MODE === "sdk") {
    return new RealStreamflowAdapter();
  }

  return new DisabledStreamflowAdapter();
}
