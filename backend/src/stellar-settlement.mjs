import { rpc, scValToNative, StrKey } from "@stellar/stellar-sdk";
import { horizon, TESTNET_PASSPHRASE, TESTNET_USDC_CONTRACT, TESTNET_USDC_ISSUER, usdcUnits, validHash } from "./funding.mjs";
import { projectError, updateProjectState } from "./project-store.mjs";

export const TESTNET_RPC = "https://soroban-testnet.stellar.org";
export const payoutUnits = (cents) => String(BigInt(cents) * 100_000n);

export async function walletUsdc(payer) {
  const account = await horizon(`/accounts/${payer}`);
  const line = account.balances?.find((balance) =>
    balance.asset_code === "USDC" && balance.asset_issuer === TESTNET_USDC_ISSUER);
  if (!line || line.is_authorized === false) return 0n;
  return usdcUnits(line.balance) - usdcUnits(line.selling_liabilities ?? "0");
}

export function quoteMatches(version, option, payment) {
  return version === 2 && option.scheme === "exact" && option.network === "stellar:testnet" &&
    option.payTo === payment.recipient && option.asset === TESTNET_USDC_CONTRACT &&
    option.amount === payoutUnits(payment.amount);
}

export function verifiedSettlement(hash, tx, payment) {
  if (!validHash(hash) || tx.status !== "SUCCESS" || tx.txHash?.toLowerCase() !== hash.toLowerCase()) {
    throw new Error("Stellar has not confirmed a successful matching transaction");
  }
  // Stellar records seconds. Accept the second in which we reserved the payout.
  const started = Date.parse(payment.startedAt);
  const settled = Number(tx.createdAt) * 1000;
  if (!Number.isFinite(started) || !Number.isFinite(settled) || settled < Math.floor(started / 1000) * 1000) {
    throw new Error("Transaction predates this payout");
  }
  const meta = tx.resultMetaXdr;
  let events = tx.events?.contractEventsXdr?.flat() ?? [];
  if (!events.length && meta?.switch() === 4) events = meta.v4().operations().flatMap((operation) => operation.events());
  if (!events.length && meta?.switch() === 3) events = meta.v3().sorobanMeta()?.events() ?? [];
  const transfers = events.flatMap((event) => {
    if (!event.contractId() || event.type().name !== "contract" ||
        StrKey.encodeContract(event.contractId()) !== TESTNET_USDC_CONTRACT) return [];
    const body = event.body().v0();
    const [action, from, to] = body.topics().map(scValToNative);
    return action === "transfer" && from === payment.payer ? [{ to, amount: scValToNative(body.data()) }] : [];
  });
  if (transfers.length !== 1 || transfers[0].to !== payment.recipient ||
      transfers[0].amount !== BigInt(payoutUnits(payment.amount))) {
    throw new Error("Stellar USDC transfer does not match the reserved payer, recipient and amount");
  }
  return { tx: hash.toLowerCase(), paidAt: new Date(settled).toISOString() };
}

export async function finishPayout(id, payment, hash, server = new rpc.Server(TESTNET_RPC, { timeout: 12_000 })) {
  if (!validHash(hash)) throw projectError("Provide a valid Stellar transaction hash");
  const network = await server.getNetwork();
  if (network.passphrase !== TESTNET_PASSPHRASE) throw new Error("Unexpected Stellar network");
  const receipt = verifiedSettlement(hash, await server.getTransaction(hash), payment);
  return updateProjectState((state) => {
    const current = state.payouts[id];
    if (current.status === "paid" && current.tx === receipt.tx) return current;
    if (current.attempt !== payment.attempt || !current.submittedAt || !["processing", "failed"].includes(current.status) ||
        Object.values(state.payouts).some((entry) => entry.tx === receipt.tx && entry.id !== current.id)) {
      throw projectError("Cannot apply this receipt to the reserved payout", 409);
    }
    delete current.error;
    return Object.assign(current, receipt, { status: "paid" });
  });
}
