import assert from "node:assert/strict";
import test from "node:test";
import { MultisigAdapterError } from "./multisig-adapter";
import { assertSquadsSourceAccountReady } from "./squads-source-account-preflight";

test("reports a clear error when the Squads source token account is missing", async () => {
  await assert.rejects(
    () =>
      assertSquadsSourceAccountReady({
        vaultAddress: "vault-1",
        mintAddress: "mint-1",
        sourceAccountAddress: "source-ata-1",
        requiredAmountAtomic: BigInt(1_000_000),
        async loadSnapshot() {
          return { exists: false };
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof MultisigAdapterError);
      assert.match(error.message, /does not have the required source token account/i);
      assert.match(error.message, /source-ata-1/);
      assert.match(error.message, /mint-1/);
      return true;
    },
  );
});

test("reports a clear error when the Squads source token account is underfunded", async () => {
  await assert.rejects(
    () =>
      assertSquadsSourceAccountReady({
        vaultAddress: "vault-1",
        mintAddress: "mint-1",
        sourceAccountAddress: "source-ata-1",
        requiredAmountAtomic: BigInt(1_000_000),
        async loadSnapshot() {
          return {
            exists: true,
            availableAmountAtomic: BigInt(250_000),
          };
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof MultisigAdapterError);
      assert.match(error.message, /only holds 250000 atomic units/i);
      assert.match(error.message, /1000000 are required/i);
      return true;
    },
  );
});

test("passes when the Squads source token account exists with sufficient balance", async () => {
  await assert.doesNotReject(() =>
    assertSquadsSourceAccountReady({
      vaultAddress: "vault-1",
      mintAddress: "mint-1",
      sourceAccountAddress: "source-ata-1",
      requiredAmountAtomic: BigInt(1_000_000),
      async loadSnapshot() {
        return {
          exists: true,
          availableAmountAtomic: BigInt(1_000_000),
        };
      },
    }),
  );
});
