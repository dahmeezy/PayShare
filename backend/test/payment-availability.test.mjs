import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import test from "node:test";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { decodePaymentRequiredHeader, encodePaymentSignatureHeader } from "@x402/core/http";
import express from "express";
import request from "supertest";
import { createApp } from "../src/server.mjs";

const network = "stellar:testnet";
const usdc = { code: "USDC", contractId: StrKey.encodeContract(Buffer.alloc(32)), decimals: 7 };
const recipient = Keypair.random().publicKey();
const path = "/paid/sun-forecast";

test("free endpoints start with no payment configuration and paid endpoints stay closed", async () => {
  const app = createApp({ facilitator: { url: "" }, usdc: {}, recipient: "" });
  await request(app).get("/catalog").expect(200);
  await request(app).get("/search").expect(200);
  await request(app).get("/api/session").expect(401, { error: "No active session" });
  await request(app).get(path).expect(503, { error: "Payments are temporarily unavailable." });
});

test("facilitator rejection leaves ordinary routes available and a later paid request can recover", async (t) => {
  const apiKey = randomUUID();
  const unauthorized = { error: "Unauthorized" };
  const acceptedKind = { x402Version: 2, scheme: "exact", network };
  let ready = false;
  let verify = false;
  let settle = false;
  const headersSeen = [];
  const facilitator = express();
  facilitator.use((req, _res, next) => {
    headersSeen.push([req.path, req.get("authorization") === `Bearer ${apiKey}`]);
    next();
  });
  facilitator.get("/supported", (_req, res) => {
    if (!ready) return res.status(401).json(unauthorized);
    res.json({ kinds: [acceptedKind] });
  });
  facilitator.post("/verify", (_req, res) => {
    if (!verify) return res.status(401).json(unauthorized);
    res.json({ isValid: true, payer: recipient });
  });
  facilitator.post("/settle", (_req, res) => {
    if (!settle) return res.status(401).json(unauthorized);
    res.json({ success: true, network, transaction: "a".repeat(64) });
  });
  const stub = facilitator.listen(0, "127.0.0.1");
  t.after(() => new Promise((resolve, reject) => stub.close(error => error ? reject(error) : resolve())));
  await once(stub, "listening");

  const url = `http://127.0.0.1:${stub.address().port}`;
  const app = createApp({ network, usdc, recipient, facilitator: { url, apiKey } });

  await request(app).get("/catalog").expect(200);
  assert.deepEqual(headersSeen, []);
  await request(app).get(path).expect(503, { error: "Payments are temporarily unavailable." });
  await request(app).get("/search").expect(200);
  await request(app).get("/api/session").expect(401, { error: "No active session" });
  assert.deepEqual(headersSeen, [["/supported", true]]);

  ready = true;
  const quote = await request(app).get(path).expect(402);
  assert.equal(quote.body.sunHours, undefined);
  const challenge = decodePaymentRequiredHeader(quote.headers["payment-required"]);
  assert.equal(challenge.accepts.length, 1);
  assert.equal(challenge.x402Version, 2);
  assert.deepEqual(challenge.accepts[0], {
    scheme: "exact", network, amount: "10000", asset: usdc.contractId, payTo: recipient,
    maxTimeoutSeconds: 300, extra: {},
  });
  await request(app).head(path).expect(402);
  await request(app).get("/paid/not-a-resource").expect(404);
  assert.deepEqual(headersSeen, [["/supported", true], ["/supported", true]]);

  const signature = encodePaymentSignatureHeader({
    x402Version: 2,
    resource: challenge.resource,
    accepted: challenge.accepts[0],
    payload: { transaction: "local-test-transaction" },
  });
  const verifyFailure = await request(app).get(path).set("PAYMENT-SIGNATURE", signature).expect(402);
  assert.equal(verifyFailure.body.sunHours, undefined);
  assert.deepEqual(headersSeen.at(-1), ["/verify", true]);

  verify = true;
  const settlementFailure = await request(app).get(path).set("PAYMENT-SIGNATURE", signature).expect(402);
  assert.equal(settlementFailure.body.sunHours, undefined);
  assert.deepEqual(headersSeen.slice(-2), [["/verify", true], ["/settle", true]]);

  settle = true;
  const paid = await request(app).get(path).set("PAYMENT-SIGNATURE", signature).expect(200);
  assert.equal(paid.body.sunHours, 6.5);
  assert.ok(paid.headers["payment-response"]);
  assert.deepEqual(headersSeen.slice(-2), [["/verify", true], ["/settle", true]]);
});
