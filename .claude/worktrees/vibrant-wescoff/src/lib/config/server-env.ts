import { z } from "zod";

const serverSchema = z.object({
  DATABASE_URL: z.string().url(),
  NEXT_PUBLIC_SOLANA_RPC_URL: z.string().url(),
  SOLANA_RPC_URL: z.string().url().optional(),
  PEANUT_TOKEN_MINT_ADDRESS: z.string().min(1),
  SOLANA_TREASURY_SECRET_KEY: z.string().min(1).optional(),
  STREAMFLOW_INTEGRATION_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  STREAMFLOW_ADAPTER_MODE: z.enum(["disabled", "mock", "sdk"]).default("disabled"),
  STREAMFLOW_CREATE_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  STREAMFLOW_RECONCILE_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  STREAMFLOW_SDK_EXECUTION_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  STREAMFLOW_SDK_ALLOW_PRODUCTION: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  STREAMFLOW_CLUSTER: z.string().min(1).optional(),
  STREAMFLOW_API_URL: z.string().url().optional(),
  STREAMFLOW_TREASURY_ADDRESS: z.string().min(1).optional(),
  STREAMFLOW_SENDER_SECRET_KEY: z.string().min(1).optional(),
  STREAMFLOW_PROGRAM_ID: z.string().min(1).optional(),
  STREAMFLOW_FEE_PAYER_ADDRESS: z.string().min(1).optional(),
  MULTISIG_PAYOUT_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  MULTISIG_PAYOUT_PROVIDER: z.string().min(1).optional(),
  SQUADS_MULTISIG_ADDRESS: z.string().min(1).optional(),
  SQUADS_VAULT_INDEX: z
    .string()
    .regex(/^\d+$/)
    .transform((value) => Number.parseInt(value, 10))
    .optional(),
  SQUADS_PROPOSER_SECRET_KEY: z.string().min(1).optional(),
  SQUADS_PROGRAM_ID: z.string().min(1).optional(),
  WALLET_AUTH_MESSAGE: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  INTERNAL_ADMIN_API_KEY: z.string().min(32).optional(),
  INTERNAL_ADMIN_ACTOR_NAME: z.string().min(1).default("internal-admin-api"),
});

export const serverEnv = serverSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  NEXT_PUBLIC_SOLANA_RPC_URL: process.env.NEXT_PUBLIC_SOLANA_RPC_URL,
  SOLANA_RPC_URL: process.env.SOLANA_RPC_URL,
  PEANUT_TOKEN_MINT_ADDRESS: process.env.PEANUT_TOKEN_MINT_ADDRESS,
  SOLANA_TREASURY_SECRET_KEY: process.env.SOLANA_TREASURY_SECRET_KEY,
  STREAMFLOW_INTEGRATION_ENABLED: process.env.STREAMFLOW_INTEGRATION_ENABLED,
  STREAMFLOW_ADAPTER_MODE: process.env.STREAMFLOW_ADAPTER_MODE,
  STREAMFLOW_CREATE_ENABLED: process.env.STREAMFLOW_CREATE_ENABLED,
  STREAMFLOW_RECONCILE_ENABLED: process.env.STREAMFLOW_RECONCILE_ENABLED,
  STREAMFLOW_SDK_EXECUTION_ENABLED: process.env.STREAMFLOW_SDK_EXECUTION_ENABLED,
  STREAMFLOW_SDK_ALLOW_PRODUCTION: process.env.STREAMFLOW_SDK_ALLOW_PRODUCTION,
  STREAMFLOW_CLUSTER: process.env.STREAMFLOW_CLUSTER,
  STREAMFLOW_API_URL: process.env.STREAMFLOW_API_URL,
  STREAMFLOW_TREASURY_ADDRESS: process.env.STREAMFLOW_TREASURY_ADDRESS,
  STREAMFLOW_SENDER_SECRET_KEY: process.env.STREAMFLOW_SENDER_SECRET_KEY,
  STREAMFLOW_PROGRAM_ID: process.env.STREAMFLOW_PROGRAM_ID,
  STREAMFLOW_FEE_PAYER_ADDRESS: process.env.STREAMFLOW_FEE_PAYER_ADDRESS,
  MULTISIG_PAYOUT_ENABLED: process.env.MULTISIG_PAYOUT_ENABLED,
  MULTISIG_PAYOUT_PROVIDER: process.env.MULTISIG_PAYOUT_PROVIDER,
  SQUADS_MULTISIG_ADDRESS: process.env.SQUADS_MULTISIG_ADDRESS,
  SQUADS_VAULT_INDEX: process.env.SQUADS_VAULT_INDEX,
  SQUADS_PROPOSER_SECRET_KEY: process.env.SQUADS_PROPOSER_SECRET_KEY,
  SQUADS_PROGRAM_ID: process.env.SQUADS_PROGRAM_ID,
  WALLET_AUTH_MESSAGE: process.env.WALLET_AUTH_MESSAGE,
  JWT_SECRET: process.env.JWT_SECRET,
  INTERNAL_ADMIN_API_KEY: process.env.INTERNAL_ADMIN_API_KEY,
  INTERNAL_ADMIN_ACTOR_NAME: process.env.INTERNAL_ADMIN_ACTOR_NAME,
});
