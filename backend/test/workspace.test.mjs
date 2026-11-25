import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Keypair, StrKey, nativeToScVal, xdr } from "@stellar/stellar-sdk";
import express from "express";
import request from "supertest";
import { testMailer } from "./helpers.mjs";

const password = "isolated-test-password";
const prefix = "/api/workspace";
const PIN = "246810";
const mailer = testMailer();

async function setup(t) {
  const dir = await mkdtemp(join(tmpdir(), "payshare-workspace-"));
  const files = { workspace: join(dir, "workspace.json"), users: join(dir, "users.json") };
  process.env.PAYSHARE_WORKSPACE_FILE = files.workspace;
  process.env.PAYSHARE_USERS_FILE = files.users;
  process.env.PAYSHARE_SECURE_COOKIES = "false";
  process.env.PAYSHARE_RATE_LIMIT_MULTIPLIER = "10";
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = await import("../src/workspace-store.mjs");
  await store.initializeWorkspace();
  const { createApp } = await import("../src/server.mjs");
  return { ...files, createApp: (settings, payment) => createApp(settings, payment, mailer) };
}

async function account(app, who, role, stellarAddress) {
  const agent = request.agent(app);
  const email = who + "@example.test";
  const { headers } = await agent.post("/api/register")
    .send({ firstName: who, lastName: "Tester", email, role, password, stellarAddress, acceptTerms: true }).expect(201);
  assert.match(headers["set-cookie"][0], /HttpOnly.*SameSite=Strict/i);
  await agent.get(prefix + "/projects").expect(403);
  const { body } = await agent.post("/api/verify").send({ code: mailer.code(email.toLowerCase()) }).expect(200);
  return { agent, email, user: body };
}

async function invitation(author, guest, base, role, decision = "accept") {
  const invite = await author.agent.post(base + "/invitations").send({ role, email: guest.email }).expect(200);
  const { token } = invite.body;
  await request(author.agent.app).post(prefix + "/invitations/lookup").send({ token }).expect(200);
  await guest.agent.post(prefix + "/invitations/respond").send({ token, decision }).expect(200);
  await guest.agent.post(prefix + "/invitations/respond").send({ token, decision }).expect(404);
}

async function team(app, mode, addresses = {}, tag = "") {
  const client = await account(app, "Client" + tag, "client", addresses.client);
  const contractor = await account(app, "Contractor" + tag, "contractor");
  const worker = await account(app, "Worker" + tag, "worker", addresses.worker);
  const { body: project } = await client.agent.post(prefix + "/projects").send({ name: "Launch", budget: 10000, mode }).expect(201);
  const base = prefix + "/projects/" + project.id;
  await contractor.agent.put(prefix + "/pin").send({ pin: PIN }).expect(200);
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
  const response = await team.worker.agent.post(task + "/accept").send({});
  assert.ok([200, 409].includes(response.status));
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
    await contractor.agent.post(task + "/payout").send({ pin: PIN }).expect(409);
    await worker.agent.post(task + "/submission").send({ notes: "Too early" }).expect(409);
    await other.agent.post(task + "/accept").send({}).expect(404);
    await worker.agent.post(task + "/accept").send({}).expect(200);
    await worker.agent.post(task + "/accept").send({}).expect(409);
    await worker.agent.post(task + "/submission").send({ notes: "First try", links: ["javascript:alert(1)"] }).expect(400);
    await worker.agent.post(task + "/submission").send({ notes: "First try", links: ["https://example.test/a"] }).expect(200);
    await worker.agent.post(task + "/submission").send({ notes: "Duplicate" }).expect(409);
    await contractor.agent.post(task + "/review").send({ decision: "rejected" }).expect(400);
    await contractor.agent.post(task + "/review").send({ decision: "rejected", notes: "Add the side panels" }).expect(200);
    await contractor.agent.post(task + "/payout").send({ pin: PIN }).expect(409);
    await approve(group, task);
    await contractor.agent.post(task + "/payout").send({ pin: PIN }).expect(409);
    await contractor.agent.post(task + "/confirm").send({}).expect(403);
    await client.agent.post(task + "/confirm").send({}).expect(200);
    await client.agent.post(task + "/confirm").send({}).expect(409);
    await contractor.agent.post(base + "/ai-summary").send({}).expect(503);
    await worker.agent.post(base + "/ai-summary").send({}).expect(403);
    const outcomes = await Promise.all([
      contractor.agent.post(task + "/payout").send({ pin: PIN }),
      contractor.agent.post(task + "/payout").send({ pin: PIN }),
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
    await request(app).post("/api/verify").send({ code: "123456" }).expect(401);

    const raw = await readFile(fixture.workspace, "utf8");
    const damaged = JSON.parse(raw);
    delete damaged.projects[0].tasks[0].payout;
    await writeFile(fixture.workspace, JSON.stringify(damaged));
    await contractor.agent.post(task + "/payout").send({ pin: PIN }).expect(503);
    await rm(fixture.workspace);
    await contractor.agent.post(task + "/payout").send({ pin: PIN }).expect(503);
    await writeFile(fixture.workspace, raw);
  });

  await t.test("invitation registration derives the role server-side and rejects a mismatched email", async () => {
    const client = await account(app, "InvitationOwner", "client");
    const { body: project } = await client.agent.post(prefix + "/projects").send({
      name: "Invited team", budget: 5000, mode: "preview",
    }).expect(201);
    const email = "invited@example.test";
    const { body: { token } } = await client.agent.post(prefix + "/projects/" + project.id + "/invitations").send({
      role: "contractor", email,
    }).expect(200);
    const invited = request.agent(app);
    const registration = { firstName: "Invited", lastName: "Contractor", password, role: "worker", invitationToken: token, acceptTerms: true };
    await invited.post("/api/register").send({ ...registration, email: "wrong@example.test" }).expect(403);
    const { body } = await invited.post("/api/register").send({ ...registration, email }).expect(201);
    assert.equal(body.role, "contractor");
    assert.equal(body.invited, true);
    await invited.put("/api/onboarding/role").send({ role: "worker" }).expect(403);
    await invited.post(prefix + "/invitations/respond").send({ token, decision: "accept" }).expect(403);
    await invited.post("/api/verify").send({ code: mailer.code(email) }).expect(200);
    await invited.put("/api/onboarding/role").send({ role: "worker" }).expect(409);
    await invited.get("/api/session").expect(200).expect(response => assert.equal(response.body.role, "contractor"));
    await invited.post(prefix + "/invitations/respond").send({ token, decision: "accept" }).expect(200);
    await request(app).post("/api/register").send({ ...registration, email }).expect(404);
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
    await client.agent.put("/api/profile").send({ firstName: "Client", lastName: "Tester", stellarAddress: clientWallet }).expect(200);
    await worker.agent.put("/api/profile").send({ firstName: "Worker", lastName: "Tester", stellarAddress: recipient }).expect(200);
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
    await contractor.agent.post(task + "/payout").send({ pin: PIN }).expect(503);
    await contractor.agent.get(prefix + "/projects").expect(200);
    assert.deepEqual(calls, ["supported"]);
    support = true;
    const attempts = await Promise.all([
      contractor.agent.post(task + "/payout").send({ pin: PIN }),
      contractor.agent.post(task + "/payout").send({ pin: PIN }),
    ]);
    assert.deepEqual(attempts.map(result => result.status).sort(), [409, 502]);
    const projectData = async () => (await worker.agent.get(prefix + "/projects").expect(200)).body.find(entry => entry.id === project.id);
    assert.equal((await projectData()).tasks[0].payout.status, "failed");
    assert.equal((await projectData()).tasks[0].payout.transaction, undefined);
    await contractor.agent.post(task + "/payout").send({ pin: PIN }).expect(409);
    await contractor.agent.post(task + "/reconcile").send({}).expect(502);
    ledgerMatches = true;
    await contractor.agent.post(task + "/reconcile").send({}).expect(200);
    assert.equal((await projectData()).tasks[0].payout.transaction, hash);
    assert.equal(calls.filter(call => call === "verify").length, 1);
    assert.equal(calls.filter(call => call === "settle").length, 1);
    successful = false;
    const second = await assign(group, 1000, "Second testnet task");
    await approve(group, second);
    await contractor.agent.post(second + "/payout").send({ pin: PIN }).expect(502);
    await contractor.agent.post(second + "/payout").send({ pin: PIN }).expect(409);
    await contractor.agent.post(second + "/reconcile").send({}).expect(409);
    assert.equal((await projectData()).tasks[1].payout.status, "failed");
    assert.equal((await projectData()).tasks[1].payout.transaction, undefined);
  });
  await t.test("tasks carry agreed terms, the worker accepts or declines them, and submissions keep versions", async () => {
    const group = await team(app, "preview", {}, "Terms");
    const { client, contractor, worker, base } = group;
    await client.agent.post(base + "/funding").send({ amount: 10000 }).expect(200);
    const terms = { title: "Backdrop", description: "Build it", workerId: worker.user.id, allocation: 1200,
      criteria: "Matches the mood board", deadline: "2030-01-31", deliverables: ["Photos", "Invoice"], reassignable: true };
    await contractor.agent.post(base + "/tasks").send({ ...terms, deadline: "soon" }).expect(400);
    await contractor.agent.post(base + "/tasks").send({ ...terms, deliverables: "Photos" }).expect(400);
    const { body } = await contractor.agent.post(base + "/tasks").send(terms).expect(200);
    const task = base + "/tasks/" + body.id;
    const seen = (await worker.agent.get(prefix + "/projects").expect(200)).body[0].tasks[0];
    assert.deepEqual([seen.criteria, seen.deadline, seen.deliverables, seen.reassignable, seen.acceptedAt], ["Matches the mood board", "2030-01-31", ["Photos", "Invoice"], true, null]);
    await contractor.agent.post(task + "/accept").send({}).expect(403);
    await worker.agent.post(task + "/accept").send({ decision: "maybe" }).expect(400);
    await worker.agent.post(task + "/accept").send({}).expect(200);
    await worker.agent.post(task + "/submission").send({ notes: "v1" }).expect(200);
    await contractor.agent.post(task + "/review").send({ decision: "rejected", notes: "Needs edges" }).expect(200);
    await worker.agent.post(task + "/submission").send({ notes: "v2", links: ["https://example.test/v2"] }).expect(200);
    const versions = (await worker.agent.get(prefix + "/projects").expect(200)).body[0].tasks[0].submissions;
    assert.deepEqual(versions.map(v => v.version), [1, 2]);

    const { body: second } = await contractor.agent.post(base + "/tasks").send({ ...terms, title: "Flowers" }).expect(200);
    await worker.agent.post(base + "/tasks/" + second.id + "/accept").send({ decision: "decline", reason: "Busy" }).expect(200);
    const declined = (await worker.agent.get(prefix + "/projects").expect(200)).body[0].tasks.find(entry => entry.title === "Flowers");
    assert.equal(declined.status, "declined");
    await worker.agent.post(base + "/tasks/" + second.id + "/submission").send({ notes: "x" }).expect(409);
  });
  await t.test("payouts need the contractor PIN, the agent explains every decision, and receipts respect roles", async () => {
    const group = await team(app, "preview", {}, "Pin");
    const { client, contractor, worker, base } = group;
    await client.agent.post(base + "/funding").send({ amount: 10000 }).expect(200);
    const task = await assign(group, 1500, "Paint wall");
    await contractor.agent.put(prefix + "/pin").send({ pin: "12ab56" }).expect(400);
    await worker.agent.put(prefix + "/pin").send({ pin: "135790" }).expect(403);
    assert.equal((await contractor.agent.get(prefix + "/capabilities")).body.payoutPinSet, true);
    // Blocked before approval: the agent logs why, in plain language.
    await contractor.agent.post(task + "/payout").send({ pin: PIN }).expect(409);
    await approve(group, task);
    await contractor.agent.post(task + "/payout").send({}).expect(400);
    await contractor.agent.post(task + "/payout").send({ pin: "000000" }).expect(403);
    await worker.agent.post(task + "/payout").send({ pin: PIN }).expect(403);
    const paid = await contractor.agent.post(task + "/payout").send({ pin: PIN }).expect(200);
    assert.equal(paid.body.status, "simulated");
    assert.match(paid.body.key, /^[a-f0-9]{64}$/);
    await contractor.agent.post(task + "/payout").send({ pin: PIN }).expect(409);

    const log = (await contractor.agent.get(base + "/agent-log").expect(200)).body;
    assert.deepEqual(log.map(entry => entry.outcome), ["blocked", "simulated", "blocked"]);
    assert.match(log[0].message, /not been paid before/i);
    assert.match(log.find(entry => entry.outcome === "simulated").message, /Demo mode.*No funds moved/);
    assert.match(log[2].message, /contractor approved the work/i);
    await worker.agent.get(base + "/agent-log").expect(403);
    await client.agent.get(base + "/agent-log").expect(200);

    const receipt = (await worker.agent.get(prefix + "/receipts").expect(200)).body;
    assert.equal(receipt.length, 1);
    assert.equal(receipt[0].demo, true);
    assert.equal(receipt[0].explorerUrl, null);
    assert.equal(receipt[0].id, paid.body.key);
    assert.equal((await contractor.agent.get(prefix + "/receipts").expect(200)).body.length, 1);
    const stranger = await account(app, "StrangerPin", "worker");
    assert.deepEqual((await stranger.agent.get(prefix + "/receipts").expect(200)).body, []);
    const next = await assign(group, 1000, "Hang lights");
    await approve(group, next);
    for (let i = 0; i < 5; i++) await contractor.agent.post(next + "/payout").send({ pin: "111111" }).expect(403);
    await contractor.agent.post(next + "/payout").send({ pin: PIN }).expect(429);
  });
  await t.test("notifications follow each role and can be marked as read", async () => {
    const group = await team(app, "preview", {}, "Notice");
    const { client, contractor, worker, base } = group;
    await client.agent.post(base + "/funding").send({ amount: 8000 }).expect(200);
    const task = await assign(group, 1200, "Paint the arch", worker, true);
    await approve(group, task);
    const feed = async who => (await who.agent.get(prefix + "/notifications").expect(200)).body;
    const titles = async who => (await feed(who)).items.map(item => item.title);
    assert.ok((await titles(worker)).includes("New task assigned to you"));
    assert.ok((await titles(contractor)).some(title => title.includes("submitted work")));
    assert.ok((await titles(client)).includes("A deliverable needs your confirmation"));
    assert.ok(!(await titles(worker)).some(title => /funding/i.test(title)));
    assert.ok((await feed(worker)).unread > 0);
    await worker.agent.post(prefix + "/notifications/read").expect(200);
    assert.equal((await feed(worker)).unread, 0);
    await worker.agent.put("/api/profile").send({ firstName: "Renamed", lastName: "Worker" }).expect(200);
    const { body: projects } = await contractor.agent.get(prefix + "/projects").expect(200);
    const saved = projects.find(project => base.endsWith(project.id));
    assert.equal(saved.tasks[0].workerName, "Renamed Worker");
    await contractor.agent.put("/api/onboarding/role").send({ role: "worker" }).expect(409);
  });
});
