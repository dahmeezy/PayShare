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
