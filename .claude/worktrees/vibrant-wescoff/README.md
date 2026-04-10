# Nut Reserve

Nut Reserve is a Solana-based NFT-gated rewards and token vesting app. This repository is initialized with Next.js, Prisma, and PostgreSQL configuration, including the current Nut Reserve Prisma schema, initial migration SQL, and a seed script for bootstrap data.

## Stack

- Next.js App Router
- Prisma ORM
- PostgreSQL
- Solana wallet adapter with Phantom support
- TypeScript

## Project structure

```text
.
├── prisma/
│   ├── migrations/
│   ├── migration_lock.toml
│   ├── schema.prisma
│   └── seed.mjs
├── src/
│   ├── app/
│   │   └── api/health/route.ts
│   ├── components/
│   │   ├── providers/
│   │   └── ui/
│   ├── features/
│   │   ├── auth/
│   │   ├── nft-gating/
│   │   ├── rewards/
│   │   └── vesting/
│   └── lib/
│       ├── config/client-env.ts
│       ├── config/server-env.ts
│       ├── db.ts
│       └── solana/constants.ts
├── .env.example
├── package.json
└── prisma.config.ts
```

## Environment variables

Copy `.env.example` to `.env` if needed and set the values for your environment.

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/nut_reserve?schema=public"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NEXT_PUBLIC_SOLANA_NETWORK="devnet"
NEXT_PUBLIC_SOLANA_RPC_URL="https://api.devnet.solana.com"
SOLANA_RPC_URL="https://api.devnet.solana.com"
NEXT_PUBLIC_REQUIRED_COLLECTION_ADDRESS="replace-with-required-nft-collection-address"
PEANUT_TOKEN_MINT_ADDRESS="replace-with-peanut-token-mint-address"
SOLANA_TREASURY_SECRET_KEY="replace-with-server-side-base58-or-json-secret-key"
STREAMFLOW_INTEGRATION_ENABLED="false"
STREAMFLOW_ADAPTER_MODE="disabled"
STREAMFLOW_CLUSTER="devnet"
STREAMFLOW_API_URL="https://api.devnet.streamflow.finance"
STREAMFLOW_TREASURY_ADDRESS="replace-with-streamflow-treasury-address"
STREAMFLOW_PROGRAM_ID="replace-with-streamflow-program-id-or-delete-this-line"
STREAMFLOW_FEE_PAYER_ADDRESS="replace-with-streamflow-fee-payer-address"
MULTISIG_PAYOUT_ENABLED="false"
MULTISIG_PAYOUT_PROVIDER="replace-with-multisig-provider-when-phase-3-is-ready"
WALLET_AUTH_MESSAGE="Sign this message to access Nut Reserve."
JWT_SECRET="replace-this-with-a-long-random-secret-at-least-32-characters"
```

## Local setup

### 1. Install Node.js

Use Node 22 locally to match this setup.

### 2. Install dependencies

```bash
npm install
```

### 3. Start PostgreSQL

Make sure PostgreSQL is running and that `DATABASE_URL` points to your local database.

### 4. Validate the Prisma schema

```bash
npm run prisma:validate
```

### 5. Generate the Prisma client

```bash
npm run prisma:generate
```

### 6. Apply the initial migration to your database

Use the checked-in initial migration:

```bash
npm run prisma:migrate
```

If the migration files already exist and you only want to apply them:

```bash
npm run prisma:migrate:deploy
```

### 7. Seed bootstrap data

```bash
npm run prisma:seed
```

This seeds:
- `FeeSchedule`
- `SystemConfig`

Important seeded system config keys for the current exchange flow:
- `exchange_rate`
- `vesting_days`
- `peanut_token_mint_address`
- `peanut_token_decimals`

### 8. Run the app

```bash
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Helpful commands

```bash
npm run lint
npm run build
npm run prisma:studio
npm run worker:withdrawals:once
npm run worker:withdrawals:loop
```

## Withdrawal worker

Nut Reserve now includes a server-side withdrawal worker that can scan for `PENDING`
withdrawals, claim them safely, and settle them through the withdrawal state machine.

Worker-related environment variables:

```env
WITHDRAWAL_WORKER_ACTOR_NAME="withdrawal-worker"
WITHDRAWAL_WORKER_PAYOUT_MODE="disabled"
WITHDRAWAL_WORKER_BATCH_SIZE="10"
WITHDRAWAL_WORKER_POLL_INTERVAL_MS="30000"
WITHDRAWAL_WORKER_RETRY_LIMIT="3"
WITHDRAWAL_WORKER_STALE_PROCESSING_MS="300000"
WITHDRAWAL_WORKER_FAILED_RETRY_BACKOFF_MS="600000"
WITHDRAWAL_WORKER_FAILED_REQUEUE_LIMIT="3"
```

Run one worker pass:

```bash
npm run worker:withdrawals:once
```

Run the polling loop:

```bash
npm run worker:withdrawals:loop
```

Notes:
- `WITHDRAWAL_WORKER_PAYOUT_MODE="mock"` is intended for non-production testing only.
- `WITHDRAWAL_WORKER_PAYOUT_MODE="real"` enables real on-chain SPL token payouts.
- `WITHDRAWAL_WORKER_PAYOUT_MODE="multisig"` enables the new multisig orchestration path, but only when `MULTISIG_PAYOUT_ENABLED="true"`.
- `SOLANA_TREASURY_SECRET_KEY` must stay server-side only. Never expose it to the client.
- The worker persists submitted payout signatures before waiting for confirmation, so retries can confirm or rebroadcast safely without creating a second payout path.
- Stale `PROCESSING` withdrawals without a submitted signature can be automatically returned to `PENDING` after `WITHDRAWAL_WORKER_STALE_PROCESSING_MS`.
- Failed withdrawals without any submitted on-chain signature can be requeued automatically after `WITHDRAWAL_WORKER_FAILED_RETRY_BACKOFF_MS`, up to `WITHDRAWAL_WORKER_FAILED_REQUEUE_LIMIT` times.
- Phase 2 adds multisig withdrawal states and admin reconciliation tooling, but the live payout runtime stays unchanged until the multisig feature flag is explicitly enabled and a real provider adapter is implemented.

## Streamflow boundary

Nut Reserve now includes a Streamflow integration boundary for future token-lock or vesting
schedule creation, but it does not execute live Streamflow SDK calls yet.

What exists today:
- adapter interface and mock implementation under `src/lib/vesting/`
- config placeholders for future Streamflow connectivity
- persisted expected Streamflow lock metadata on `VestingPosition`
- persisted client correlation id for future provider-side matching and recovery
- reconciliation-ready fields for matching a Nut Reserve vesting position to a future
  Streamflow-created artifact

What remains inactive:
- no live Streamflow execution
- no Streamflow reconciliation worker
- no runtime cutover away from the current local vesting flow

Internal non-production operator checklist:
- [Streamflow internal operator checklist](/Users/daisyspooks/Documents/Peanut%20Bank/docs/streamflow-internal-operator-checklist.md)

## Seed assumptions

The seed script includes a default decreasing fee schedule and baseline system config values. Update those values after seeding if your production numbers differ.

## Notes

- `src/lib/db.ts` exports a shared Prisma client instance for server-side use.
- `src/lib/config/client-env.ts` and `src/lib/config/server-env.ts` validate required environment variables with Zod.
- `src/components/providers/app-providers.tsx` sets up Solana wallet providers with Phantom support.
- `src/app/api/health/route.ts` provides a simple health endpoint for local checks.
