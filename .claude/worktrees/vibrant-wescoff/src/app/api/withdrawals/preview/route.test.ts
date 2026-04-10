import assert from "node:assert/strict";
import test from "node:test";
import { createWithdrawalPreviewRouteHandler } from "./route-handler";
import { WithdrawalValidationError } from "@/lib/withdrawals/withdrawal-validation-error";

const authenticatedResult = {
  status: "authorized" as const,
  user: {
    id: "user-1",
    walletAddress: "wallet-1",
  },
};

function buildPreviewRequest(body: unknown) {
  return new Request("http://localhost/api/withdrawals/preview", {
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

test("maps preview withdrawal validation errors to 400 JSON responses", async () => {
  const handler = createWithdrawalPreviewRouteHandler({
    getProtectedRouteResult: async () => authenticatedResult,
    assertTrustedOrigin: () => {},
    enforceRateLimit: async () => {},
    getWithdrawalPreview: async () => {
      throw new WithdrawalValidationError("Withdrawals are currently disabled by system configuration.");
    },
  });

  const response = await handler(
    buildPreviewRequest({
      vestingPositionId: "vesting-1",
      amount: "100",
    }),
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "Withdrawals are currently disabled by system configuration.",
  });
});

test("maps successful preview withdrawal responses to 200 JSON payloads", async () => {
  const handler = createWithdrawalPreviewRouteHandler({
    getProtectedRouteResult: async () => authenticatedResult,
    assertTrustedOrigin: () => {},
    enforceRateLimit: async () => {},
    getWithdrawalPreview: async () => ({
      vestingPositionId: "vesting-1",
      requestedAmount: "100",
    }),
  });

  const response = await handler(
    buildPreviewRequest({
      vestingPositionId: "vesting-1",
      amount: "100",
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    preview: {
      vestingPositionId: "vesting-1",
      requestedAmount: "100",
    },
  });
});

test("maps preview withdrawal rate-limit failures to 429 responses with Retry-After", async () => {
  const handler = createWithdrawalPreviewRouteHandler({
    getProtectedRouteResult: async () => authenticatedResult,
    assertTrustedOrigin: () => {},
    enforceRateLimit: async () => {
      throw new FakeRateLimitError("Too many withdrawal preview requests.", 9);
    },
    getWithdrawalPreview: async () => {
      throw new Error("should not be called");
    },
  });

  const response = await handler(
    buildPreviewRequest({
      vestingPositionId: "vesting-1",
      amount: "100",
    }),
  );

  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "9");
  assert.deepEqual(await response.json(), {
    error: "Too many withdrawal preview requests.",
  });
});
