import "dotenv/config";
import {
  getWithdrawalWorkerOptionsFromEnv,
  runWithdrawalWorkerLoop,
  runWithdrawalWorkerOnce,
} from "../src/lib/withdrawals/worker.ts";

async function main() {
  const mode = process.argv[2] ?? "once";
  const options = getWithdrawalWorkerOptionsFromEnv();

  if (mode === "once") {
    const summary = await runWithdrawalWorkerOnce(options);
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  if (mode === "loop") {
    await runWithdrawalWorkerLoop(options);
    return;
  }

  console.error("Usage: node --import tsx scripts/withdrawal-worker.ts [once|loop]");
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
