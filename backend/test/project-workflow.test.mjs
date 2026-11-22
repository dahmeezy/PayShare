import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
import { Keypair } from "@stellar/stellar-sdk";
import { x402Client, x402HTTPClient } from "@x402/fetch";

test("project API enforces roles, recorded approvals, changes and single x402 submission", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "payshare-api-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const payer = Keypair.random().publicKey();
  const clientWallet = Keypair.random().publicKey();
  const amara = Keypair.random().publicKey();
  const contractor = "contractor-fixture-" + "a".repeat(32);
  const client = "client-fixture-" + "b".repeat(32);
  const worker = "amara-fixture-" + "c".repeat(32);
  const otherWorker = "bisi-fixture-" + "d".repeat(32);
  const agent = "agent-fixture-" + "e".repeat(32);
  Object.assign(process.env, {
    PAYSHARE_STATE_FILE: path.join(dir, "project.json"),
    PAYSHARE_CONTRACTOR_TOKEN: contractor, PAYSHARE_CLIENT_TOKEN: client, PAYSHARE_WORKER_AMARA_TOKEN: worker,
    PAYSHARE_WORKER_BISI_TOKEN: otherWorker, PAYSHARE_AGENT_TOKEN: agent, PAYSHARE_PAYER_WALLET: payer,
    PAYSHARE_CLIENT_WALLET: clientWallet, PAYSHARE_ENABLE_TESTNET_PAYOUTS: "true", WORKER_AMARA: amara,
  });
  const { moneyRouter, moneyErrors } = await import("../src/money-api.mjs");
  const { mountPayoutRoutes } = await import("../src/payout-routes.mjs");
  const { readProjectState } = await import("../src/project-store.mjs");
  const { TESTNET_PASSPHRASE, TESTNET_USDC_CONTRACT, TESTNET_USDC_ISSUER } = await import("../src/funding.mjs");
  const app = express();
  const hash = "5".repeat(64);
  const settlementHash = "6".repeat(64);
  let settled = 0;
  mountPayoutRoutes(app, { network: "stellar:testnet", networkPassphrase: TESTNET_PASSPHRASE }, {
    getSupported: async () => ({
      kinds: [{ x402Version: 2, scheme: "exact", network: "stellar:testnet", extra: { areFeesSponsored: true } }],
      extensions: [], signers: {},
    }),
    verify: async () => ({ isValid: true, payer }),
    settle: async () => {
      settled += 1;
      return { success: true, transaction: settlementHash, network: "stellar:testnet", payer };
    },
  });
  app.use("/api", moneyRouter);
  app.use(moneyErrors);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const fetchLocal = fetch;
  const paymentOperation = {
    type: "payment", from: clientWallet, to: payer, amount: "10.0000000",
    asset_code: "USDC", asset_issuer: TESTNET_USDC_ISSUER,
  };
  t.mock.method(globalThis, "fetch", async (url, options) => {
    const path = new URL(url).pathname;
    let body;
    if (path === "/") body = { network_passphrase: TESTNET_PASSPHRASE };
    if (path === `/transactions/${hash}`) body = { hash, successful: true, created_at: "2026-11-22T14:20:00Z" };
    if (path === `/transactions/${hash}/operations`) body = { _embedded: { records: [paymentOperation] } };
    if (path === `/accounts/${payer}`) body = { balances: [{ ...paymentOperation, balance: "10.0" }] };
    return body ? Response.json(body) : fetchLocal(url, options);
  });
  async function api(role, route, payload, expected = 200) {
    const response = await fetchLocal(base + "/api" + route, {
      method: payload === undefined ? "GET" : "POST",
      headers: { authorization: `Bearer ${role}`, "content-type": "application/json" },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
    const body = await response.json();
    assert.equal(response.status, expected, JSON.stringify(body));
    return body;
  }
  const project = "/projects/proj_demo";
  const task = "/tasks/amara";
  const invoke = { task_id: "amara", worker_id: "amara", payment_id: "pay_amara" };
  const spoof = await fetchLocal(base + "/api" + project + "/money-summary", { headers: { "x-demo-role": "contractor" } });
  assert.equal(spoof.status, 401);
  await api(worker, "/expenses", { amount: 100 }, 403);
  const overview = await api(worker, project + "/money-summary");
  assert.equal(overview.contractor_comp, null);
  assert.equal(overview.remaining, null);
  assert.equal(Object.hasOwn(overview, "allocated"), false);
  assert.deepEqual((await api(worker, project + "/allocations")).map(({ worker_id }) => worker_id), ["amara"]);
  await api(contractor, "/expenses", { amount: 300, description: "Pending supplies", approved: false }, 201);
  await api(contractor, "/expenses", { amount: 1, description: "Over budget", approved: true }, 409);

  const funding = await api(client, "/funding", { amount: 1000, funding_address: clientWallet }, 201);
  assert.equal((await api(worker, project + "/funding"))[0].funding_address, undefined);
  assert.equal((await api(client, project + "/money-summary")).funded, 0);
  paymentOperation.amount = "10.0000001";
  await api(client, `/funding/${funding.id}/verify`, { transaction: hash }, 422);
  paymentOperation.amount = "10.0000000";
  await api(client, `/funding/${funding.id}/verify`, { transaction: hash });
  await api(client, `/funding/${funding.id}/verify`, { transaction: hash });
  assert.equal((await api(client, project + "/money-summary")).funded, 1000);

  await api(contractor, task + "/terms", { criteria: "Backdrop installed", requires_client: true }, 201);
  await api(otherWorker, task + "/accept", { amount: 150 }, 404);
  await api(worker, task + "/accept", { amount: 150 });
  await api(contractor, task + "/contractor-approve", { evidence: "Reviewed photo" });
  await api(agent, "/payments", invoke, 409);
  await api(worker, task + "/client-confirm", { confirmed: true }, 403);
  await api(client, task + "/client-confirm", { confirmed: true });

  const change = await api(contractor, "/allocation-changes", { allocation_id: "alloc_amara", proposed_amount: 120, reason: "Reduce after scope change" }, 201);
  assert.equal((await api(worker, project + "/allocations"))[0].amount, 150);
  await api(otherWorker, `/allocation-changes/${change.id}/respond`, { action: "accept" }, 404);
  await api(worker, `/allocation-changes/${change.id}/respond`, { action: "counter", amount: 130 });
  assert.equal((await api(worker, project + "/allocations"))[0].amount, 150);
  await api(contractor, `/allocation-changes/${change.id}/respond`, { action: "accept" });
  assert.equal((await api(worker, project + "/allocations"))[0].amount, 130);
  const increase = await api(contractor, "/allocation-changes", { allocation_id: "alloc_amara", proposed_amount: 140, reason: "Restored scope" }, 201);
  await api(worker, `/allocation-changes/${increase.id}/respond`, { action: "accept" });
  assert.equal((await api(worker, project + "/allocations"))[0].amount, 130);
  await api(client, `/allocation-changes/${increase.id}/respond`, { action: "accept" });
  assert.equal((await api(worker, project + "/allocations"))[0].amount, 140);

  const report = await api(worker, task + "/incomplete-reports", { reason: "Only part installed" }, 201);
  assert.equal((await api(client, project + "/incomplete-notifications")).length, 1);
  const resolveUrl = `/incomplete-reports/${report.id}/resolve`;
  await api(contractor, resolveUrl, { action: "reassign", worker_id: "bisi", reason: "Worker unavailable" }, 400);
  await api(contractor, resolveUrl, { action: "partial_payment", amount: 75, reason: "Half delivered" });
  await api(agent, "/payments", invoke, 409);
  await api(worker, `/incomplete-reports/${report.id}/respond`, { accepted: true });
  await api(contractor, task + "/contractor-approve", { evidence: "Reviewed completed portion" });
  await api(client, task + "/client-confirm", { confirmed: true });

  const reservations = await Promise.all([1, 2].map(() => fetchLocal(base + "/api/payments", {
    method: "POST", headers: { authorization: `Bearer ${agent}`, "content-type": "application/json" },
    body: JSON.stringify(invoke),
  })));
  assert.deepEqual(reservations.map(({ status }) => status).sort(), [201, 409]);
  const reserved = await reservations.find(({ status }) => status === 201).json();
  assert.equal(reserved.amount, 75);
  const delivery = base + "/paid/deliverable/amara";
  assert.equal((await fetchLocal(delivery)).status, 401);
  const headers = { authorization: `Bearer ${agent}`, "x-payshare-attempt": reserved.attempt };
  const quote = await fetchLocal(delivery, { headers });
  assert.equal(quote.status, 402);
  const http = new x402HTTPClient(new x402Client());
  const required = http.getPaymentRequiredResponse((name) => quote.headers.get(name));
  assert.equal(required.accepts[0].amount, "7500000");
  assert.equal(required.accepts[0].asset, TESTNET_USDC_CONTRACT);
  assert.equal(required.accepts[0].payTo, amara);
  const signature = http.encodePaymentSignatureHeader({
    x402Version: 2, accepted: required.accepts[0], payload: { transaction: "fixture-only" },
  });
  const replies = await Promise.all([1, 2].map(() => fetchLocal(delivery, { headers: { ...headers, ...signature } })));
  assert.deepEqual(replies.map(({ status }) => status).sort(), [200, 409]);
  assert.equal(settled, 1);
  assert.ok((await readProjectState()).payouts.amara.submittedAt);
  assert.equal((await api(worker, project + "/payments")).payments[0].status, "processing");
  assert.equal((await api(otherWorker, project + "/payments")).payments[0].worker_id, "bisi");

  await api(worker, "/whatsapp", {}, 403);
  process.env.PAYSHARE_APP_URL = "https://payshare.example";
  process.env.PAYSHARE_WHATSAPP_AMARA = "2348012345678";
  const draft = await api(contractor, "/whatsapp", {
    project_id: "proj_demo", message: "Review the project in PayShare", message_type: "task_update", sent_to: "amara",
  }, 201);
  assert.equal(draft.sent, false);
  assert.equal(new URL(draft.share_url).host, "wa.me");
});
