# Streamflow Internal Operator Checklist

## Purpose and scope

This checklist covers one internal-only, non-production Streamflow run for one
`VestingPosition` at a time:

1. guarded real Streamflow create by `VestingPosition` id
2. guarded real Streamflow reconciliation by `VestingPosition` id

This checklist is intentionally narrow.

It does **not** enable:
- automation
- batch processing
- scheduled execution
- background workers
- production usage by default

Use it only for explicit internal admin testing in a non-production environment.

## Required env/config guards

Set these before running the create flow:

```env
STREAMFLOW_INTEGRATION_ENABLED="true"
STREAMFLOW_ADAPTER_MODE="sdk"
STREAMFLOW_CREATE_ENABLED="true"
STREAMFLOW_SDK_EXECUTION_ENABLED="true"
STREAMFLOW_SDK_ALLOW_PRODUCTION="false"
STREAMFLOW_RECONCILE_ENABLED="true"

STREAMFLOW_CLUSTER="devnet"
SOLANA_RPC_URL="https://..."
STREAMFLOW_TREASURY_ADDRESS="..."
STREAMFLOW_SENDER_SECRET_KEY="..."
INTERNAL_ADMIN_API_KEY="..."
```

Important:
- keep `STREAMFLOW_SDK_ALLOW_PRODUCTION="false"`
- do not run this in production
- do not enable any batch or scheduled behavior

## Preflight checks before running create

Confirm the target `VestingPosition` is eligible:

- `vestingProvider = "streamflow"`
- `status = "LOCKED"`
- `withdrawnAmount = 0`
- `streamflowManualReviewRequired = false`
- `streamflowScheduleId IS NULL`
- `streamflowLifecycleStatus IN (NULL, "expected_only", "retryable_failure")`

Confirm expected Streamflow fields are present:

- `vestingReference`
- `streamflowClientCorrelationId`
- `streamflowExpectedRecipientWalletAddress`
- `streamflowExpectedMintAddress`
- `streamflowExpectedAmountAtomic`
- `streamflowExpectedStartAt`
- `streamflowExpectedEndAt`
- `streamflowExpectedVestingKind`

Confirm your sender wallet is non-production and funded appropriately for the test.

## Trigger the internal-only create flow

Endpoint:

```text
POST /api/internal/vesting/streamflow/create
```

Example:

```bash
curl -X POST http://127.0.0.1:3000/api/internal/vesting/streamflow/create \
  -H "Content-Type: application/json" \
  -H "x-internal-admin-key: $INTERNAL_ADMIN_API_KEY" \
  -d '{"vestingPositionId":"<VESTING_POSITION_ID>"}'
```

Expected successful response shape:

```json
{
  "trigger": "internal-admin-streamflow-create",
  "vestingPositionId": "<VESTING_POSITION_ID>",
  "actor": "...",
  "result": {
    "status": "created",
    "vestingPositionId": "<VESTING_POSITION_ID>",
    "scheduleId": "...",
    "txSignature": "..."
  }
}
```

## Expected database changes after create

On the `VestingPosition` row, verify:

- `streamflowLifecycleStatus = "created"`
- `streamflowScheduleId` is populated
- `streamflowCreationTxSignature` is populated if returned by provider
- `streamflowScheduleCreatedAt` is populated
- `streamflowObservedScheduleState` is populated
- `streamflowBeneficiaryAddress` is populated
- `streamflowMintAddress` is populated
- `streamflowTreasuryAddress` is populated if returned/configured
- `streamflowEscrowAddress` is populated if returned
- `streamflowManualReviewRequired = false`
- `streamflowManualReviewReason IS NULL`
- `streamflowReconciliationFailureReason IS NULL`

Expected snapshot fields should remain unchanged:

- `vestingReference`
- `streamflowClientCorrelationId`
- `streamflowExpectedRecipientWalletAddress`
- `streamflowExpectedMintAddress`
- `streamflowExpectedAmountAtomic`
- `streamflowExpectedStartAt`
- `streamflowExpectedEndAt`
- `streamflowExpectedVestingKind`

## Expected audit log entries after create

In `VestingStreamflowReconciliationAttempt`, verify:

Before provider request:
- `attemptType = "sdk-create-requested"`
- `result = "pending"`

After success:
- `attemptType = "sdk-create"`
- `result = "created"`

The success row should include:
- `observedScheduleId`
- `observedTxSignature` if returned
- `observedState`

## Trigger reconciliation

Endpoint:

```text
POST /api/internal/vesting/streamflow/reconcile-real
```

Example:

```bash
curl -X POST http://127.0.0.1:3000/api/internal/vesting/streamflow/reconcile-real \
  -H "Content-Type: application/json" \
  -H "x-internal-admin-key: $INTERNAL_ADMIN_API_KEY" \
  -d '{"vestingPositionId":"<VESTING_POSITION_ID>"}'
```

Possible successful response shape:

```json
{
  "trigger": "internal-admin-streamflow-reconcile-real",
  "vestingPositionId": "<VESTING_POSITION_ID>",
  "actor": "...",
  "result": {
    "status": "matched",
    "vestingPositionId": "<VESTING_POSITION_ID>",
    "scheduleId": "...",
    "providerState": "confirmed"
  }
}
```

Other possible result statuses:
- `pending_creation`
- `manual_review`
- `validation_failed`
- `retryable_failure`

## Expected database changes after reconciliation

If reconciliation matches successfully:

- `streamflowScheduleId` stays the same
- `streamflowObservedScheduleState` updates to provider status
- `streamflowBeneficiaryAddress` matches provider
- `streamflowMintAddress` matches provider
- `streamflowTreasuryAddress` updates if provider returns it
- `streamflowEscrowAddress` updates if provider returns it
- `streamflowConfirmedAt` is populated when provider status is `confirmed`
- `streamflowManualReviewRequired = false`
- `streamflowManualReviewReason IS NULL`
- `streamflowReconciliationFailureReason IS NULL`

Expected lifecycle status:

- `streamflowLifecycleStatus = "created"` when provider state is still `created`
- `streamflowLifecycleStatus = "matched"` when provider state is `confirmed`
- `streamflowLifecycleStatus = "pending_reconciliation"` when provider state is still pending

If reconciliation finds a mismatch or cancelled item:

- `streamflowLifecycleStatus = "manual_review"`
- `streamflowManualReviewRequired = true`
- `streamflowManualReviewReason` is populated
- `streamflowReconciliationFailureReason` is populated

If reconciliation hits a retryable provider/runtime problem:

- `streamflowLifecycleStatus = "retryable_failure"`
- `streamflowReconciliationFailureReason` is populated
- `streamflowManualReviewRequired = false`

## Expected audit log entries after reconciliation

In `VestingStreamflowReconciliationAttempt`, verify:

Before provider fetch:
- `attemptType = "sdk-status-requested"`
- `result = "pending"`

Then one terminal outcome:
- `attemptType = "sdk-status"`
- `result = "pending_creation"`
- or `result = "created"`
- or `result = "confirmed"`
- or `result = "mismatched"`
- or `result = "cancelled"`
- or `result = "validation_failed"`
- or `result = "retryable_failure"`

If the item was blocked before reconciliation:
- `attemptType = "sdk-status-refused"`
- `result = "refused"`

## Provider-returned identifiers and status fields to verify

Compare the route response, database row, and provider data for:

- `scheduleId`
- provider state / raw status
- beneficiary wallet
- mint
- amount
- startAt
- endAt
- vesting kind
- treasury address if exposed
- escrow address if exposed
- tx signature if exposed
- created/confirmed timestamp if exposed

Exact comparisons should remain strict for:
- wallet
- mint
- amount
- startAt
- endAt
- vesting kind

## Failure cases / stop conditions

Stop and investigate if any of these happen:

### Create refused by guard

Cause:
- required env flag is off

Expected:
- route returns `409`
- no create success row
- no schedule id persisted

### Create refused by eligibility

Cause:
- schedule already exists
- item not locked
- item already in manual review

Expected:
- route returns `422`
- audit row:
  - `sdk-create-refused`
  - `result = "refused"` or `manual_review`

### Create validation failure

Cause:
- invalid expected wallet, mint, amount, dates, or correlation data

Expected:
- result is `validation_failed`
- item is moved to manual review
- audit row:
  - `sdk-create`
  - `result = "validation_failed"`

### Reconcile refused

Cause:
- missing `streamflowScheduleId`
- item already under manual review

Expected:
- route returns `422`
- audit row:
  - `sdk-status-refused`
  - `result = "refused"`

### Reconcile mismatch

Cause:
- provider artifact differs on wallet, mint, amount, dates, or vesting kind

Expected:
- result is `manual_review`
- item moves to manual review
- audit row:
  - `sdk-status`
  - `result = "mismatched"`

### Reconcile cancelled

Cause:
- provider reports schedule is closed/cancelled

Expected:
- result is `manual_review`
- item moves to manual review
- audit row:
  - `sdk-status`
  - `result = "cancelled"`

### Reconcile retryable failure

Cause:
- provider/API/RPC failure

Expected:
- result is `retryable_failure`
- item moves to `retryable_failure`
- audit row:
  - `sdk-status`
  - `result = "retryable_failure"`

## Explicit operating note

This flow is:
- internal-only
- one-item-at-a-time
- non-production by default
- explicitly triggered by an operator

It is **not**:
- automation
- batch processing
- scheduled execution
- production enablement
