import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Keypair, StrKey, nativeToScVal, xdr } from "@stellar/stellar-sdk";
import express from "express";
import request from "supertest";

const password = "isolated-test-password";
const prefix = "/api/workspace";

async function setup(t) {
  const dir = await mkdtemp(join(tmpdir(), "payshare-workspace-"));
  const files = { workspace: join(dir, "workspace.json"), users: join(dir, "users.json") };
  process.env.PAYSHARE_WORKSPACE_FILE = files.workspace;
  process.env.PAYSHARE_USERS_FILE = files.users;
  process.env.PAYSHARE_SECURE_COOKIES = "false";
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = await import("../src/workspace-store.mjs");
  await store.initializeWorkspace();
  return { ...files, createApp: (await import("../src/server.mjs")).createApp };
}

async function account(app, who, role, stellarAddress) {
  const agent = request.agent(app);
  const email = who + "@example.test";
  const { body, headers } = await agent.post("/api/register").send({ name: who, email, role, password, stellarAddress }).expect(201);
  assert.match(headers["set-cookie"][0], /HttpOnly.*SameSite=Strict/i);
  return { agent, email, user: body };
}

async function invitation(author, guest, base, role, decision = "accept") {
  const invite = await author.agent.post(base + "/invitations").send({ role, email: guest.email }).expect(200);
  const { token } = invite.body;
  await request(author.agent.app).post(prefix + "/invitations/lookup").send({ token }).expect(200);
  await guest.agent.post(prefix + "/invitations/respond").send({ token, decision }).expect(200);
  await guest.agent.post(prefix + "/invitations/respond").send({ token, decision }).expect(404);
}

async function team(app, mode, addresses = {}) {
  const client = await account(app, "Client", "client", addresses.client);
  const contractor = await account(app, "Contractor", "contractor");
  const worker = await account(app, "Worker", "worker", addresses.worker);
  const { body: project } = await client.agent.post(prefix + "/projects").send({ name: "Launch", budget: 10000, mode }).expect(201);
  const base = prefix + "/projects/" + project.id;
  await invitation(client, contractor, base, "contractor");
  await invitation(contractor, worker, base, "worker");
  return { client, contractor, worker, base, project };
}

async function assign(team, amount = 1200, title = "Build stage", worker = team.worker, clientApprovalRequired = false) {
  const { body } = await team.contractor.agent.post(team.base + "/tasks").send({
    title, description: "Install the backdrop", workerId: worker.user.id, allocation: amount, clientApprovalRequired,
  }).expect(200);
  return team.base + "/tasks/" + body.id;
}
async function approve(team, task) {
  await team.worker.agent.post(task + "/submission").send({ notes: "Ready to review" }).expect(200);
  await team.contractor.agent.post(task + "/review").send({ decision: "approved" }).expect(200);
}

// The two scenarios share only module instances. They use distinct state within the same temporary store.
test("integrated workspace API keeps sessions, budgets, approvals and money records scoped to each role", async t => {
  const fixture = await setup(t);
  const app = fixture.createApp();
  await t.test("preview project completes safely and fails closed if payout history is damaged", async () => {
    await request(app).get("/").expect(302).expect("Location", "/frontend/prototype.html?app=1");
    await request(app).get("/frontend/prototype.html").expect(200);
    await request(app).get(prefix + "/projects").expect(401);
    await request(app).get("/api/users").expect(401);
    const group = await team(app, "preview");
    const { client, contractor, worker, base } = group;
    const guest = await account(app, "Guest", "worker");
    await invitation(contractor, guest, base, "worker", "decline");
    await guest.agent.get(prefix + "/projects").expect(200, []);
    await worker.agent.put(base + "/budget").send({ budget: 9900, compensation: 0 }).expect(403);
    await contractor.agent.post(base + "/funding").send({ amount: 1000 }).expect(403);
    await client.agent.post(base + "/funding").set("Origin", "https://foreign.example").send({ amount: 3000 }).expect(403);
    await contractor.agent.post(base + "/tasks").send({ title: "Unfunded", description: "Try it", workerId: worker.user.id, allocation: 1200 }).expect(409);
    await client.agent.post(base + "/funding").send({ amount: 8000 }).expect(200);
    await contractor.agent.put(base + "/budget").send({ budget: 10000, compensation: 1000 }).expect(200);
    await contractor.agent.post(base + "/expenses").send({ amount: 500, description: "Supplies" }).expect(200);
    await contractor.agent.post(base + "/tasks").send({ title: "Overfunded", description: "Try it", workerId: worker.user.id, allocation: 6501 }).expect(409);
    const task = await assign(group, 1200, "Build stage", worker, true);
    const other = await account(app, "Second", "worker");
    await invitation(contractor, other, base, "worker");
    await assign(group, 1300, "Private task", other);
    const workerProjects = (await worker.agent.get(prefix + "/projects").expect(200)).body;
    assert.equal(workerProjects[0].tasks.length, 1);
    assert.equal(workerProjects[0].tasks[0].title, "Build stage");
    assert.equal(workerProjects[0].compensation, undefined);
    assert.equal(workerProjects[0].funding, undefined);
    await other.agent.post(task + "/submission").send({ notes: "Unauthorized" }).expect(404);
    await contractor.agent.post(task + "/payout").send({}).expect(409);
    await worker.agent.post(task + "/submission").send({ notes: "First try" }).expect(200);
    await worker.agent.post(task + "/submission").send({ notes: "Duplicate" }).expect(409);
    await contractor.agent.post(task + "/review").send({ decision: "rejected" }).expect(200);
    await contractor.agent.post(task + "/payout").send({}).expect(409);
    await approve(group, task);
    await contractor.agent.post(task + "/payout").send({}).expect(409);
    await contractor.agent.post(task + "/confirm").send({}).expect(403);
    await client.agent.post(task + "/confirm").send({}).expect(200);
    await client.agent.post(task + "/confirm").send({}).expect(409);
    await contractor.agent.post(base + "/ai-summary").send({}).expect(503);
    await worker.agent.post(base + "/ai-summary").send({}).expect(403);
    const outcomes = await Promise.all([
      contractor.agent.post(task + "/payout").send({}),
      contractor.agent.post(task + "/payout").send({}),
    ]);
    assert.deepEqual(outcomes.map(res => res.status).sort(), [200, 409]);
    const payout = (await worker.agent.get(prefix + "/projects")).body[0].tasks[0].payout;
    assert.equal(payout.status, "simulated");
    assert.equal(payout.transaction, undefined);
    assert.equal(payout.explorerUrl, undefined);
    await worker.agent.post("/api/logout").expect(200);
    await worker.agent.get("/api/session").expect(401);
    const login = await worker.agent.post("/api/login").send({ email: worker.email, password }).expect(200);
    const cookie = login.headers["set-cookie"][0].split(";")[0];
    await request(fixture.createApp()).get("/api/session").set("Cookie", cookie).expect(200);
    const recovery = await request(app).post("/api/forgot").send({ email: worker.email }).expect(200);
    assert.equal(recovery.body.deliveryAvailable, false);
    assert.equal(recovery.body.code, undefined);
    const verification = await request(app).post("/api/verify").send({ code: "123456" }).expect(200);
    assert.equal(verification.body.verified, false);
    assert.equal(verification.headers["set-cookie"], undefined);

    const raw = await readFile(fixture.workspace, "utf8");
    const damaged = JSON.parse(raw);
    delete damaged.projects[0].tasks[0].payout;
    await writeFile(fixture.workspace, JSON.stringify(damaged));
    await contractor.agent.post(task + "/payout").send({}).expect(503);
    await rm(fixture.workspace);
    await contractor.agent.post(task + "/payout").send({}).expect(503);
    await writeFile(fixture.workspace, raw);
  });

  await t.test("testnet uses the facilitator and only records a matching independently confirmed transfer", async t => {
    process.env.PAYSHARE_ENABLE_TESTNET_PAYOUTS = "true";
    t.after(() => { delete process.env.PAYSHARE_ENABLE_TESTNET_PAYOUTS; });
    const { createSettlement } = await import("../src/workspace-settlement.mjs");
    const { TESTNET_PASSPHRASE, TESTNET_USDC_CONTRACT, TESTNET_USDC_ISSUER, verifyFundingTransfer } = await import("../src/funding.mjs");
    const signer = Keypair.random();
    const payer = signer.publicKey();
    const recipient = Keypair.random().publicKey();
    const clientWallet = Keypair.random().publicKey();
    const calls = [];
    const facilitator = express();
    facilitator.use(express.json());
    let support = false;
    let successful = true;
    let amount = "0";
    let ledgerMatches = false;
    const hash = "3".repeat(64);
    facilitator.get("/supported", (_req, res) => {
      calls.push("supported");
      if (!support) return res.sendStatus(401);
      res.json({ kinds: [{ x402Version: 2, scheme: "exact", network: "stellar:testnet" }] });
    });
    facilitator.post("/verify", (req, res) => {
      calls.push("verify");
      amount = req.body.paymentRequirements.amount;
      assert.equal(req.body.paymentRequirements.payTo, recipient);
      assert.equal(req.body.paymentRequirements.asset, TESTNET_USDC_CONTRACT);
      res.json({ isValid: true, payer });
    });
    facilitator.post("/settle", (_req, res) => {
      calls.push("settle");
      res.json({ success: successful, network: "stellar:testnet", transaction: successful ? hash : "" });
    });
    const server = facilitator.listen(0, "127.0.0.1");
    t.after(() => new Promise(resolve => server.close(resolve)));
    await once(server, "listening");
    const ledger = {
      getNetwork: async () => ({ passphrase: TESTNET_PASSPHRASE }),
      getTransaction: async tx => ({
        txHash: tx, status: "SUCCESS", createdAt: Math.floor(Date.now() / 1000),
        events: { contractEventsXdr: [[new xdr.ContractEvent({
          ext: new xdr.ExtensionPoint(0), contractId: StrKey.decodeContract(TESTNET_USDC_CONTRACT), type: xdr.ContractEventType.contract(),
          body: new xdr.ContractEventBody(0, new xdr.ContractEventV0({
            topics: [nativeToScVal("transfer", { type: "symbol" }), ...[payer, recipient].map(address => nativeToScVal(address, { type: "address" }))],
            data: nativeToScVal(ledgerMatches ? BigInt(amount) : 1n, { type: "i128" }),
          })),
        })]] },
      }),
    };
    const settlement = createSettlement({
      network: "stellar:testnet", networkPassphrase: TESTNET_PASSPHRASE, agentSecret: signer.secret(),
      usdc: { contractId: TESTNET_USDC_CONTRACT }, facilitator: { url: "http://127.0.0.1:" + server.address().port },
    }, {
      ledger, checkBalance: async () => 10_000_000_000n,
      createPayload: async quote => ({ x402Version: 2, accepted: quote.accepts[0], resource: quote.resource, payload: { transaction: "test-only" } }),
    });
    const depositHash = "2".repeat(64);
    let memo = "wrong memo";
    const fund = (tx, request, wallet) => verifyFundingTransfer(tx, request, wallet, async url => {
      const path = new URL(url).pathname;
      if (path === "/") return Response.json({ network_passphrase: TESTNET_PASSPHRASE });
      if (!path.endsWith("/operations")) return Response.json({
        hash: depositHash, successful: true, created_at: new Date().toISOString(), memo_type: "hash", memo,
      });
      return Response.json({ _embedded: { records: [{
        type: "payment", from: clientWallet, to: payer, asset_code: "USDC", asset_issuer: TESTNET_USDC_ISSUER, amount: "80.0000000",
      }] } });
    });
    // Account email addresses are already in this isolated store. Log in to the new app instance.
    const online = fixture.createApp(undefined, { settlement, verifyFunding: fund });
    const login = async who => {
      const agent = request.agent(online);
      const email = who + "@example.test";
      const { body: user } = await agent.post("/api/login").send({ email, password }).expect(200);
      return { agent, user, email };
    };
    const client = await login("client");
    const contractor = await login("contractor");
    const worker = await login("worker");
    await client.agent.put("/api/profile").send({ name: "Client", stellarAddress: clientWallet }).expect(200);
    await worker.agent.put("/api/profile").send({ name: "Worker", stellarAddress: recipient }).expect(200);
    const { body: project } = await client.agent.post(prefix + "/projects").send({ name: "Testnet", budget: 10000, mode: "testnet" }).expect(201);
    const base = prefix + "/projects/" + project.id;
    const group = { client, contractor, worker, base };
    await invitation(client, contractor, base, "contractor");
    await invitation(contractor, worker, base, "worker");
    await client.agent.post(base + "/funding").send({ amount: 8000, transaction: depositHash }).expect(422);
    memo = project.fundingMemo;
    await client.agent.post(base + "/funding").send({ amount: 8000, transaction: depositHash }).expect(200);
    await client.agent.post(base + "/funding").send({ amount: 8000, transaction: depositHash }).expect(409);
    const task = await assign(group, 1200);
    await approve(group, task);
    await contractor.agent.post(task + "/payout").send({}).expect(503);
    await contractor.agent.get(prefix + "/projects").expect(200);
    assert.deepEqual(calls, ["supported"]);
    support = true;
    await contractor.agent.post(task + "/payout").send({}).expect(502);
    const projectData = async () => (await worker.agent.get(prefix + "/projects").expect(200)).body.find(entry => entry.id === project.id);
    assert.equal((await projectData()).tasks[0].payout.status, "failed");
    assert.equal((await projectData()).tasks[0].payout.transaction, undefined);
    await contractor.agent.post(task + "/payout").send({}).expect(409);
    await contractor.agent.post(task + "/reconcile").send({}).expect(502);
    ledgerMatches = true;
    await contractor.agent.post(task + "/reconcile").send({}).expect(200);
    assert.equal((await projectData()).tasks[0].payout.transaction, hash);
    assert.deepEqual(calls, ["supported", "supported", "verify", "settle"]);
    successful = false;
    const second = await assign(group, 1000, "Second testnet task");
    await approve(group, second);
    await contractor.agent.post(second + "/payout").send({}).expect(502);
    await contractor.agent.post(second + "/payout").send({}).expect(409);
    await contractor.agent.post(second + "/reconcile").send({}).expect(409);
    assert.equal((await projectData()).tasks[1].payout.status, "failed");
    assert.equal((await projectData()).tasks[1].payout.transaction, undefined);
  });
});
