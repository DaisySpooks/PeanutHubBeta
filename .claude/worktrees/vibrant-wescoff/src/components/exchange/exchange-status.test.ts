import assert from "node:assert/strict";
import test from "node:test";
import { getExchangeStatusSummary } from "./exchange-status";

test("describes accepted exchanges that are still in the expected-only vesting state", () => {
  assert.match(
    getExchangeStatusSummary({
      status: "PENDING",
      unlockAt: "2026-07-01T00:00:00.000Z",
      streamflowLifecycleStatus: "expected_only",
    }),
    /Accepted and queued for vesting/i,
  );
});

test("describes exchanges that have been created in Streamflow", () => {
  assert.match(
    getExchangeStatusSummary({
      status: "PENDING",
      streamflowLifecycleStatus: "created",
      streamflowScheduleId: "schedule-1",
    }),
    /created in Streamflow/i,
  );
});

test("describes failed exchanges plainly", () => {
  assert.match(
    getExchangeStatusSummary({
      status: "FAILED",
    }),
    /failed/i,
  );
});
