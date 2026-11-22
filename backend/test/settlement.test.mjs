import test from "node:test";
import assert from "node:assert/strict";
import { Keypair, StrKey, nativeToScVal, xdr } from "@stellar/stellar-sdk";
import { TESTNET_USDC_CONTRACT } from "../src/funding.mjs";
import { verifiedSettlement, quoteMatches } from "../src/stellar-settlement.mjs";

const hash = "ab".repeat(32);
const payer = Keypair.random().publicKey();
const recipient = Keypair.random().publicKey();
const payment = { payer, recipient, amount: 150, startedAt: "2026-11-22T12:00:00.450Z" };
const settlement = (amount = 15_000_000n, to = recipient, from = payer, token = TESTNET_USDC_CONTRACT) => ({
  status: "SUCCESS", txHash: hash, createdAt: Date.parse(payment.startedAt) / 1000 | 0,
  events: { contractEventsXdr: [[new xdr.ContractEvent({
    ext: new xdr.ExtensionPoint(0),
    contractId: StrKey.decodeContract(token),
    type: xdr.ContractEventType.contract(),
    body: new xdr.ContractEventBody(0, new xdr.ContractEventV0({
      topics: [nativeToScVal("transfer", { type: "symbol" }), ...[from, to].map((address) => nativeToScVal(address, { type: "address" }))],
      data: nativeToScVal(amount, { type: "i128" }),
    })),
  })]] },
});

test("requires the exact testnet network, Circle USDC amount and worker wallet in the x402 quote", () => {
  const quote = { scheme: "exact", network: "stellar:testnet", asset: TESTNET_USDC_CONTRACT, payTo: recipient, amount: "15000000" };
  assert.ok(quoteMatches(2, quote, payment));
  for (const wrong of [{ amount: "15000001" }, { amount: "10000000" }, { asset: "USDC" }, { network: "stellar:pubnet" }, { payTo: payer }]) {
    assert.equal(quoteMatches(2, { ...quote, ...wrong }, payment), false);
  }
  assert.equal(quoteMatches(1, quote, payment), false);
});

test("only a successful matching testnet USDC event qualifies as paid", () => {
  assert.deepEqual(verifiedSettlement(hash, settlement(), payment), { tx: hash, paidAt: "2026-11-22T12:00:00.000Z" });
  for (const tx of [settlement(10n), settlement(15_000_000n, payer), settlement(15_000_000n, recipient, recipient),
    settlement(15_000_000n, recipient, payer, StrKey.encodeContract(Buffer.alloc(32, 1))),
    { ...settlement(), status: "FAILED" }, { ...settlement(), createdAt: 1 }]) {
    assert.throws(() => verifiedSettlement(hash, tx, payment));
  }
});
