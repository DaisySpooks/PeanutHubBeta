import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { serverEnv } from "./config/server-env";

const globalForPrisma = globalThis as unknown as {
  dbPool?: Pool;
  prisma?: PrismaClient;
};

const pool =
  globalForPrisma.dbPool ??
  new Pool({
    connectionString: serverEnv.DATABASE_URL,
  });

const adapter = new PrismaPg(pool);

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.dbPool = pool;
  globalForPrisma.prisma = db;
}
