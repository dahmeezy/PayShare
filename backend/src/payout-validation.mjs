import { StrKey } from "@stellar/stellar-sdk";

// Check the x402 facilitator's settlement response before recording a payout.
// This does not replace independent on-chain verification.
export function validateSettlement(settlement) {
  if (!settlement || settlement.success !== true) {
    throw new Error("Payment settlement was not confirmed");
  }
  if (typeof settlement.transaction !== "string" || !/^[a-fA-F0-9]{64}$/.test(settlement.transaction)) {
    throw new Error("Settlement is missing a valid Stellar transaction hash");
  }
  return settlement.transaction;
}

export function canStartPayout(state, workerId) {
  if (!state || typeof state !== "object") throw new Error("Invalid payout history");
  if (state.clientConfirmed !== true) throw new Error("Client has not confirmed the work");
  const status = state.payouts?.[workerId]?.status;
  if (status === undefined) throw new Error("Missing payout record; refusing to pay");
  // Even a 'failed' request may have settled. Require manual reconciliation.
  if (status !== "pending") throw new Error(`Payout status is ${status}; check the ledger before retrying`);
  return true;
}

export function canResetPayouts(state) {
  if (!state?.payouts || typeof state.payouts !== "object" || Array.isArray(state.payouts)) {
    throw new Error("Invalid payout history; cannot reset");
  }
  if (Object.values(state.payouts).some((p) => p?.status !== "pending")) {
    throw new Error("Cannot reset after a payout attempt; reconcile transactions on Stellar first");
  }
  return true;
}

export function validatePayoutHistory(state, workerIds) {
  if (!state || typeof state !== "object" || Array.isArray(state) ||
      typeof state.clientConfirmed !== "boolean" ||
      !state.payouts || typeof state.payouts !== "object" || Array.isArray(state.payouts)) {
    throw new Error("Invalid payout history");
  }
  const expected = new Set(workerIds);
  if (expected.size !== workerIds.length || Object.keys(state.payouts).length !== expected.size) {
    throw new Error("Payout records do not match project workers");
  }
  for (const id of workerIds) {
    const payout = state.payouts[id];
    if (!payout || !["pending", "processing", "paid", "failed"].includes(payout.status)) {
      throw new Error(`Invalid payout record for ${id}`);
    }
    if (payout.status === "paid" && !/^[a-fA-F0-9]{64}$/.test(payout.tx ?? "")) {
      throw new Error(`Paid record for ${id} has no valid transaction hash`);
    }
  }
  return true;
}

/**
 * Confirm that a reported settlement exists and succeeded on Stellar Horizon.
 * This only confirms transaction success, not the worker or token amount.
 */
export async function verifyTransactionOnHorizon(hash, horizonUrl, fetcher = fetch) {
  if (typeof hash !== "string" || !/^[a-fA-F0-9]{64}$/.test(hash)) {
    throw new Error("Invalid Stellar transaction hash");
  }
  const url = new URL(horizonUrl);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("Horizon URL must use HTTPS");
  }
  const response = await fetcher(`${url.href.replace(/\/$/, "")}/transactions/${hash}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Horizon transaction lookup failed: HTTP ${response.status}`);
  const tx = await response.json();
  if (tx.hash?.toLowerCase() !== hash.toLowerCase() || tx.successful !== true) {
    throw new Error("Horizon did not confirm a successful matching transaction");
  }
  return tx.hash;
}

/**
 * Ensure the Horizon endpoint is connected to the configured Stellar network.
 * Prevents a testnet transaction being mistaken for a public-network payment.
 */
export async function verifyHorizonNetwork(horizonUrl, expectedPassphrase, fetcher = fetch) {
  if (typeof expectedPassphrase !== "string" || !expectedPassphrase.trim()) {
    throw new Error("Expected Stellar network passphrase is required");
  }
  const url = new URL(horizonUrl);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("Horizon URL must use HTTPS");
  }
  const response = await fetcher(url.href, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Horizon network lookup failed: HTTP ${response.status}`);
  const network = await response.json();
  if (network.network_passphrase !== expectedPassphrase) {
    throw new Error("Horizon network does not match the configured Stellar network");
  }
  return true;
}

/**
 * This prototype must never move real-money assets on Stellar public network.
 * The current demo confirmation is not authenticated.
 */
export function requireTestnet(network, passphrase) {
  if (network !== "stellar:testnet" || passphrase !== "Test SDF Network ; September 2015") {
    throw new Error("PayShare demo payouts are restricted to Stellar testnet");
  }
  return true;
}

/**
 * Refuse ambiguous worker payout instructions before any payment is signed.
 * A wallet may only appear once in this single-project demo.
 */
export function validateWorkerRecipients(workers) {
  if (!Array.isArray(workers) || workers.length === 0) throw new Error("No workers configured");
  const ids = new Set();
  const wallets = new Set();
  for (const worker of workers) {
    if (typeof worker?.id !== "string" || !worker.id.trim()) throw new Error("Worker ID is required");
    if (typeof worker.wallet !== "string" || !StrKey.isValidEd25519PublicKey(worker.wallet)) {
      throw new Error(`Invalid Stellar wallet for worker ${worker.id}`);
    }
    if (ids.has(worker.id)) throw new Error(`Duplicate worker ID: ${worker.id}`);
    if (wallets.has(worker.wallet)) throw new Error(`Duplicate worker wallet: ${worker.wallet}`);
    if (typeof worker.allocation !== "number" || !Number.isFinite(worker.allocation) ||
        worker.allocation <= 0 || !Number.isSafeInteger(Math.round(worker.allocation * 100)) ||
        Math.abs(worker.allocation * 100 - Math.round(worker.allocation * 100)) > 0.000001) {
      throw new Error(`Invalid allocation for worker ${worker.id}`);
    }
    ids.add(worker.id);
    wallets.add(worker.wallet);
  }
  return true;
}

/**
 * Check the configured token identifiers before enabling paid routes or payouts.
 * This checks format only; it does not prove the contract is genuine USDC.
 */
export function validateUsdcConfig(usdc) {
  if (!usdc || usdc.code !== "USDC") throw new Error("USDC asset code is required");
  if (!StrKey.isValidEd25519PublicKey(usdc.issuer || "")) {
    throw new Error("Invalid USDC issuer wallet");
  }
  if (!StrKey.isValidContract(usdc.contractId || "")) {
    throw new Error("Invalid USDC contract ID");
  }
  if (usdc.decimals !== 7) throw new Error("Expected Stellar USDC to use 7 decimals");
  return true;
}
