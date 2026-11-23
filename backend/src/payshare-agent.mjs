import { readProjectState } from "./project-store.mjs";

try {
  if (process.argv[2] !== "status") {
    throw new Error("Use the verified testnet payout flow after the settlement PR is installed.");
  }
  const state = await readProjectState();
  for (const [workerId, payment] of Object.entries(state.payouts)) {
    console.log(`${workerId}: ${payment.status}`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
