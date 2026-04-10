import assert from "node:assert/strict";
import test from "node:test";
import { createWithdrawalRouteHandler } from "./route-handler";
import { WithdrawalValidationError } from "@/lib/withdrawals/withdrawal-validation-error";

const authenticatedResult = {
  status: "authorized" as const,
  user: {
    id: "user-1",
    walletAddress: "wallet-1",
  },
};

function buildCreateRequest(body: unknown) {
  return new Request("http://localhost/api/withdrawals", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
    },
    body: JSON.stringify(body),
  });
}

class FakeRateLimitError extends Error {
  constructor(message: string, readonly retryAfterSeconds: number) {
    super(message);
  }
}

test("maps create withdrawal validation errors to 400 JSON responses", async () => {
  const handler = createWithdrawalRouteHandler({
    getProtectedRouteResult: async () => authenticatedResult,
    assertTrustedOrigin: () => {},
    enforceRateLimit: async () => {},
    createWithdrawal: async () => {
      throw new WithdrawalValidationError("Requested amount exceeds the remaining vested balance.");
    },
  });

  const response = await handler(
    buildCreateRequest({
      vestingPositionId: "vesting-1",
      amount: "100",
    }),
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "Requested amount exceeds the remaining vested balance.",
  });
});

test("maps successful create withdrawal responses to 201 JSON payloads", async () => {
  const handler = createWithdrawalRouteHandler({
    getProtectedRouteResult: async () => authenticatedResult,
    assertTrustedOrigin: () => {},
    enforceRateLimit: async () => {},
    createWithdrawal: async () => ({
      id: "withdrawal-1",
      status: "PENDING",
    }),
  });

  const response = await handler(
    buildCreateRequest({
      vestingPositionId: "vesting-1",
      amount: "100",
    }),
  );

  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), {
    withdrawal: {
      id: "withdrawal-1",
      status: "PENDING",
    },
  });
});

test("maps create withdrawal rate-limit failures to 429 responses with Retry-After", async () => {
  const handler = createWithdrawalRouteHandler({
    getProtectedRouteResult: async () => authenticatedResult,
    assertTrustedOrigin: () => {},
    enforceRateLimit: async () => {
      throw new FakeRateLimitError("Too many withdrawal create requests.", 17);
    },
    createWithdrawal: async () => {
      throw new Error("should not be called");
    },
  });

  const response = await handler(
    buildCreateRequest({
      vestingPositionId: "vesting-1",
      amount: "100",
    }),
  );

  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "17");
  assert.deepEqual(await response.json(), {
    error: "Too many withdrawal create requests.",
  });
});
