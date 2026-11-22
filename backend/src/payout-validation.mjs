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
  if (state.clientConfirmed !== true) throw new Error("Client has not confirmed the work");
  const status = state.payouts?.[workerId]?.status ?? "pending";
  // Even a 'failed' request may have settled. Require manual reconciliation.
  if (status !== "pending") throw new Error(`Payout status is ${status}; check the ledger before retrying`);
  return true;
}
