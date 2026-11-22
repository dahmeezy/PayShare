// The PayShare Agent: pays each worker's deliverable over x402, but only when the rules allow it.
// Usage:  node src/payshare-agent.mjs status    (see who is paid)
//         node src/payshare-agent.mjs confirm   (stand-in for the client's "work completed" button)
//         node src/payshare-agent.mjs pay       (the agent runs the payouts)
//         node src/payshare-agent.mjs reset     (start over: testnet only)
import fs from "node:fs/promises";
import { wrapFetchWithPaymentFromConfig, decodePaymentResponseHeader } from "@x402/fetch";
import { createEd25519Signer } from "@x402/stellar";
import { ExactStellarScheme } from "@x402/stellar/exact/client";
import { config, explorer } from "./config.mjs";
import { PROJECT } from "./project.mjs";
import { validateSettlement, canResetPayouts, validatePayoutHistory, verifyTransactionOnHorizon, verifyHorizonNetwork, requireTestnet } from "./payout-validation.mjs";

const STATE_FILE = "payshare-state.json";

// ── State: who has been paid. Lives in a local file so a re-run remembers. ──
const freshState = () => ({
  clientConfirmed: false,
  payouts: Object.fromEntries(PROJECT.workers.map((w) => [w.id, { status: "pending" }])),
});
async function readState() {
  try { return JSON.parse(await fs.readFile(STATE_FILE, "utf8")); }
  catch (error) {
    if (error.code === "ENOENT") throw new Error("Payout history missing. Run init for a new testnet project; never reinitialize after real payments.");
    throw new Error("Cannot read payout history; refusing to continue", { cause: error });
  }
}
const saveState = async (s) => {
  const temp = `${STATE_FILE}.${process.pid}.tmp`;
  await fs.writeFile(temp, JSON.stringify(s, null, 2), { mode: 0o600 });
  await fs.rename(temp, STATE_FILE);
};

// Only one agent process may attempt payouts at a time.
// After a crash, inspect the ledger before manually removing the lock file.
async function withPayoutLock(action) {
  const lockFile = `${STATE_FILE}.lock`;
  let lock;
  try {
    lock = await fs.open(lockFile, "wx", 0o600);
  } catch (error) {
    if (error.code === "EEXIST") throw new Error("Another payout run may be active; inspect the lock and Stellar ledger before retrying");
    throw error;
  }
  try {
    await lock.writeFile(String(process.pid));
    return await action();
  } finally {
    await lock.close();
    await fs.unlink(lockFile);
  }
}

// ── Commands ──
async function status() {
  const s = await readState();
  console.log(`\n${PROJECT.name}`);
  console.log(`Client confirmed the work: ${s.clientConfirmed ? "yes" : "no"}\n`);
  for (const w of PROJECT.workers) {
    const p = s.payouts[w.id] ?? { status: "pending" };
    console.log(`${w.name.padEnd(6)} ${String(w.allocation).padStart(4)} USDC  ${p.status}${p.tx ? `  ${explorer.tx(p.tx)}` : ""}${p.error ? `  (${p.error})` : ""}`);
  }
  console.log();
}

async function confirm() {
  const s = await readState();
  if (process.env.NODE_ENV === "production") throw new Error("CLI demo confirmation is disabled in production");
  if (Object.values(s.payouts ?? {}).some((p) => p.status !== "pending")) {
    throw new Error("Cannot confirm after payouts have started");
  }
  s.clientConfirmed = true;
  await saveState(s);
  console.log("✓ Client confirmed the work. The agent may now pay.");
}

async function pay() {
  const s = await readState();
  validatePayoutHistory(s, PROJECT.workers.map((w) => w.id));

  // GATE 1: no payment until the client has confirmed.
  if (!s.clientConfirmed) {
    console.log("✗ Not paying: the client hasn't confirmed the work yet.\n  Run: node src/payshare-agent.mjs confirm");
    return;
  }

  requireTestnet(config.network, config.networkPassphrase);
  const signer = createEd25519Signer(config.agentSecret, config.network);

  for (const w of PROJECT.workers) {
    if (!s.payouts[w.id] || typeof s.payouts[w.id] !== "object") {
      throw new Error(`Missing or invalid payout record for ${w.id}; refusing to pay`);
    }
    const p = s.payouts[w.id];

    // GATE 2: never pay twice.
    if (p.status === "paid") { console.log(`↷ ${w.name}: already paid, skipping`); continue; }
    if (p.status === "processing") {
      console.log(`⚠ ${w.name}: a previous run didn't finish. Check the explorer before retrying (the agent won't guess).`);
      continue;
    }

    if (p.status === "failed") { console.log("Previous payout outcome uncertain; check Stellar before retrying."); continue; }
    if (p.status !== "pending") throw new Error(`Unknown payout status for ${w.id}: ${p.status}`);

    // Write "processing" to the file BEFORE sending, so even a crash can't lead to a double payment.
    p.status = "processing";
    await saveState(s);

    try {
      // GATE 3: pay at most this worker's agreed allocation. If the server quotes more, nothing is signed.
      const paidFetch = wrapFetchWithPaymentFromConfig(fetch, {
        schemes: [{ network: config.network, client: new ExactStellarScheme(signer, { url: config.rpcUrl }) }],
        spendControls: { maxAmountPerPayment: `$${w.allocation}` },
      });
      const res = await paidFetch(`${config.apiBaseUrl}/paid/deliverable/${w.id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const header = res.headers.get("PAYMENT-RESPONSE");
      const settlement = header ? decodePaymentResponseHeader(header) : null;
      const transaction = validateSettlement(settlement);
      // A facilitator response alone is not proof of a successful ledger transaction.
      await verifyHorizonNetwork(config.horizonUrl, config.networkPassphrase);
      await verifyTransactionOnHorizon(transaction, config.horizonUrl);

      p.status = "paid";
      p.tx = transaction;
      p.paidAt = new Date().toISOString();
      delete p.error;
      console.log(`✓ ${w.name}: paid ${w.allocation} USDC  ${explorer.tx(p.tx)}`);
    } catch (e) {
      p.status = "processing"; // outcome uncertain: check ledger before retrying
      p.error = e.message;
      console.log(`✗ ${w.name}: ${e.message}`);
    }
    await saveState(s);
  }
  console.log("\nRun 'status' to see the summary.");
}

async function init() {
  if (process.env.NODE_ENV === "production") throw new Error("Demo initialization is disabled in production");
  const file = await fs.open(STATE_FILE, "wx", 0o600);
  try { await file.writeFile(JSON.stringify(freshState(), null, 2)); }
  finally { await file.close(); }
  console.log("Created new demo payout history. Never initialize again after a real payout.");
}

async function reset() {
  const current = await readState();
  validatePayoutHistory(current, PROJECT.workers.map((w) => w.id));
  canResetPayouts(current);
  throw new Error("Reset is disabled: use a new testnet project to avoid duplicate payments");
}

const commands = { status, init, confirm, pay, reset };
const run = commands[process.argv[2]];
if (!run) { console.log("Usage: node src/payshare-agent.mjs status | init | confirm | pay | reset"); process.exit(1); }
await (process.argv[2] === "status" ? run() : withPayoutLock(run));