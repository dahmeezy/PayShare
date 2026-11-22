import { Keypair } from "@stellar/stellar-sdk";
import { x402Client, x402HTTPClient } from "@x402/fetch";
import { createEd25519Signer } from "@x402/stellar";
import { ExactStellarScheme } from "@x402/stellar/exact/client";
import { config } from "./config.mjs";
import { fundingWallet, validHash } from "./funding.mjs";
import { requireTestnet, validateSettlement } from "./payout-validation.mjs";
import { PROJECT } from "./project.mjs";
import { readProjectState, updateProjectState } from "./project-store.mjs";
import { finishPayout, quoteMatches, TESTNET_RPC } from "./stellar-settlement.mjs";

function localUrl() {
  const url = new URL(config.apiBaseUrl);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname) ||
      url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
    throw new Error("Use the local PayShare server as API_BASE_URL");
  }
  url.hostname = "127.0.0.1";
  return url.origin;
}

async function pay(id) {
  if (process.env.PAYSHARE_ENABLE_TESTNET_PAYOUTS !== "true") throw new Error("Enable testnet payouts first");
  const payer = fundingWallet();
  if (Keypair.fromSecret(config.agentSecret).publicKey() !== payer) throw new Error("Signer does not match the funding wallet");
  const base = localUrl();
  const authorization = `Bearer ${process.env.PAYSHARE_AGENT_TOKEN ?? ""}`;
  const request = { redirect: "error", signal: AbortSignal.timeout(90_000) };
  const hold = await fetch(base + "/api/payments", {
    ...request, method: "POST", headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify({ task_id: id, worker_id: id, payment_id: `pay_${id}` }),
  });
  const payment = await hold.json();
  if (!hold.ok) throw new Error(payment.error ?? `Could not reserve payment (HTTP ${hold.status})`);
  let hash;
  try {
    const client = new x402Client();
    client.setSpendControls({ maxAmountPerPayment: `$${(payment.amount / 100).toFixed(2)}` });
    const signer = createEd25519Signer(config.agentSecret, "stellar:testnet");
    client.register("stellar:testnet", new ExactStellarScheme(signer, { url: TESTNET_RPC }));
    client.registerPolicy((version, options) => options.filter((option) => quoteMatches(version, option, payment)));
    const http = new x402HTTPClient(client);
    const url = `${base}/paid/deliverable/${id}`;
    const headers = { authorization, "x-payshare-attempt": payment.attempt };
    const quote = await fetch(url, { ...request, headers });
    if (quote.status !== 402) throw new Error(`Expected a payment quote, got HTTP ${quote.status}`);
    const terms = http.getPaymentRequiredResponse((name) => quote.headers.get(name));
    await quote.body?.cancel();
    const payload = await client.createPaymentPayload(terms);
    const response = await fetch(url, {
      ...request, headers: { ...headers, ...http.encodePaymentSignatureHeader(payload) },
    });
    if (!response.ok) throw new Error(`Payment submission returned HTTP ${response.status}`);
    const settlement = http.getPaymentSettleResponse((name) => response.headers.get(name));
    await response.body?.cancel();
    hash = validateSettlement(settlement);
    await updateProjectState((state) => {
      const current = state.payouts[id];
      if (current.attempt !== payment.attempt || !current.submittedAt) throw new Error("Payout state changed");
      current.candidateTx = hash;
    });
    const result = await finishPayout(id, payment, hash);
    console.log(`Paid ${(result.amount / 100).toFixed(2)} USDC: https://stellar.expert/explorer/testnet/tx/${result.tx}`);
  } catch (error) {
    await updateProjectState((state) => {
      const current = state.payouts[id];
      if (current.attempt !== payment.attempt || current.status === "paid") return;
      // The server writes submittedAt before a signature can reach the facilitator.
      // With no submission it is safe to release the reservation under the same lock.
      if (!current.submittedAt) {
        state.payouts[id] = { id: payment.id, status: "pending", error: "Last attempt stopped before submission" };
      } else {
        current.status = hash ? "processing" : "failed";
        current.error = "Check the Stellar ledger before taking further action";
      }
    });
    throw error;
  }
}

async function main([command, id, suppliedHash]) {
  requireTestnet(config.network, config.networkPassphrase);
  if (command === "status") {
    const state = await readProjectState();
    for (const worker of PROJECT.workers) {
      const payment = state.payouts[worker.id];
      console.log(`${worker.id}: ${payment.status}${payment.tx ? ` (${payment.tx})` : ""}`);
    }
    return;
  }
  if (!PROJECT.workers.some((worker) => worker.id === id)) throw new Error("Provide a valid project task ID");
  if (command === "pay") return pay(id);
  if (command === "release") {
    await updateProjectState((state) => {
      const payment = state.payouts[id];
      if (payment.status !== "processing" || payment.submittedAt || !payment.attempt) {
        throw new Error("Only an unsubmitted reservation can be released");
      }
      state.payouts[id] = { id: payment.id, status: "pending" };
    });
    console.log("Released the unsubmitted testnet reservation");
    return;
  }
  if (command === "reconcile") {
    const payment = (await readProjectState()).payouts[id];
    const hash = payment.candidateTx ?? suppliedHash;
    if (!payment.submittedAt || !validHash(hash)) throw new Error("Provide the testnet transaction hash for a submitted payout");
    const result = await finishPayout(id, payment, hash);
    console.log(`Verified payment ${result.tx}`);
    return;
  }
  throw new Error("Use status, pay <task-id>, release <task-id>, or reconcile <task-id> [transaction-hash]");
}

try {
  await main(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
