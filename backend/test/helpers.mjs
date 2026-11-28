import { TransactionBuilder } from "@stellar/stellar-sdk";
import { TESTNET_PASSPHRASE, TESTNET_USDC_ISSUER } from "../src/funding.mjs";

// Test double for the email provider: keeps what would have been sent.
export function testMailer() {
  const outbox = [];
  return {
    available: true,
    outbox,
    async send(message) { outbox.push(message); },
    code(email) {
      const message = outbox.findLast(entry => entry.to === email);
      return message?.text.match(/\b\d{6}\b/)?.[0];
    },
  };
}
// A Horizon double that reads actual signed XDR. It never makes network requests.
export function testFundingLedger(wallet) {
  const ledger = {
    sequence: 123, submissions: [], visible: true, outcome: "accepted", closedAt: null, operations: [],
    async get(url, options) {
      const parsed = new URL(url);
      const path = parsed.pathname;
      if (path === "/") return Response.json({ network_passphrase: TESTNET_PASSPHRASE });
      if (path === "/accounts/" + wallet) return Response.json({
        sequence: String(ledger.sequence),
        balances: [{ asset_code: "USDC", asset_issuer: TESTNET_USDC_ISSUER,
          balance: "110.1234500", selling_liabilities: "10.0000000", is_authorized: true }],
      });
      if (path === "/fee_stats") return Response.json({ last_ledger_base_fee: "100", fee_charged: { p70: "250" } });
      if (path === "/ledgers") return Response.json({ _embedded: { records: [{ closed_at: ledger.closedAt }] } });
      if (path === "/transactions" && options.method === "POST") {
        const tx = TransactionBuilder.fromXDR(options.body.get("tx"), TESTNET_PASSPHRASE);
        const hash = tx.hash().toString("hex");
        ledger.submissions.push(hash);
        if (ledger.outcome === "bad-sequence") return Response.json({ extras: { result_codes: { transaction: "tx_bad_seq" } } }, { status: 400 });
        ledger.sequence += 1;
        ledger.tx = { hash, successful: true, created_at: new Date().toISOString(), memo_type: "hash", memo: tx.memo.value.toString("base64") };
        ledger.operations = tx.operations.map(op => ({
          type: op.type, from: tx.source, to: op.destination, asset_code: op.asset.code, asset_issuer: op.asset.issuer, amount: op.amount,
        }));
        if (ledger.outcome === "timeout") throw new Error("Simulated network timeout after acceptance");
        return Response.json(ledger.tx);
      }
      if (ledger.visible && ledger.tx) {
        if (path === "/transactions/" + ledger.tx.hash) return Response.json(ledger.tx);
        if (path === "/transactions/" + ledger.tx.hash + "/operations") return Response.json({ _embedded: { records: ledger.operations } });
      }
      return Response.json({}, { status: 404 });
    },
  };
  return ledger;
}
