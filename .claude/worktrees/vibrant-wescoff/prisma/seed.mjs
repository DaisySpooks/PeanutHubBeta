import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
});

const feeSchedules = [
  { daysAfterUnlock: 0, feePercent: "12.50", label: "Immediate withdrawal" },
  { daysAfterUnlock: 7, feePercent: "10.00", label: "1 week after unlock" },
  { daysAfterUnlock: 14, feePercent: "8.00", label: "2 weeks after unlock" },
  { daysAfterUnlock: 30, feePercent: "5.00", label: "30 days after unlock" },
  { daysAfterUnlock: 60, feePercent: "2.50", label: "60 days after unlock" },
  { daysAfterUnlock: 90, feePercent: "0.00", label: "90 days after unlock" },
];

const systemConfigs = [
  {
    key: "exchange_rate",
    value: "0",
    description: "Default Nutshell-to-PEANUT exchange rate. Update before enabling exchanges.",
    updatedBy: "seed",
  },
  {
    key: "vesting_days",
    value: "90",
    description: "Number of days tokens remain locked after exchange.",
    updatedBy: "seed",
  },
  {
    key: "withdrawals_enabled",
    value: "true",
    description: "Feature flag controlling whether vested withdrawals are allowed.",
    updatedBy: "seed",
  },
  {
    key: "nutshell_supply_cap",
    value: "21000000",
    description: "Hard cap for the total Nutshell supply that may ever be issued.",
    updatedBy: "seed",
  },
  {
    key: "nutshell_supply_issued",
    value: "0",
    description: "Total Nutshell supply issued so far.",
    updatedBy: "seed",
  },
  {
    key: "required_collection_address",
    value: process.env.NEXT_PUBLIC_REQUIRED_COLLECTION_ADDRESS || "replace-with-required-nft-collection-address",
    description: "Solana NFT collection required to access Nut Reserve.",
    updatedBy: "seed",
  },
  {
    key: "peanut_token_mint_address",
    value: process.env.PEANUT_TOKEN_MINT_ADDRESS || "replace-with-peanut-token-mint-address",
    description: "Mint address for the PEANUT token.",
    updatedBy: "seed",
  },
  {
    key: "peanut_token_decimals",
    value: "9",
    description: "Number of decimals used for the PEANUT token mint.",
    updatedBy: "seed",
  },
];

async function main() {
  for (const feeSchedule of feeSchedules) {
    await prisma.feeSchedule.upsert({
      where: { daysAfterUnlock: feeSchedule.daysAfterUnlock },
      update: {
        feePercent: feeSchedule.feePercent,
        label: feeSchedule.label,
        isActive: true,
      },
      create: feeSchedule,
    });
  }

  for (const config of systemConfigs) {
    await prisma.systemConfig.upsert({
      where: { key: config.key },
      update: {
        value: config.value,
        description: config.description,
        updatedBy: config.updatedBy,
      },
      create: config,
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    await pool.end();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  });
