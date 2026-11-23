import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Keypair } from "@stellar/stellar-sdk";

test("history is required before a project change can create or reserve a payout", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "payshare-history-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, "payshare-state.json");
  process.env.PAYSHARE_STATE_FILE = file;
  const { createProjectState, readProjectState, updateProjectState, assertPayoutHistory } =
    await import("../src/project-store.mjs");
  const unavailable = { code: "PAYMENT_HISTORY_UNAVAILABLE", status: 503 };
  const update = () => updateProjectState(() => assert.fail("An update must never run without valid history"));

  await assert.rejects(readProjectState, unavailable);
  await assert.rejects(update, unavailable);
  await assert.rejects(fs.stat(file), { code: "ENOENT" });

  await createProjectState("preview");
  assert.throws(() => assertPayoutHistory({ mode: "preview" }), /cannot submit/);
  const initial = await readProjectState();
  await assert.rejects(() => createProjectState("preview"), { code: "EEXIST" });

  const paid = structuredClone(initial);
  paid.payouts.amara = { status: "paid", tx: "a".repeat(64) };
  await fs.writeFile(file, JSON.stringify(paid));
  assert.equal((await readProjectState()).payouts.amara.status, "paid");

  const missingWorker = structuredClone(paid);
  delete missingWorker.payouts.amara;
  const wrongWorker = { ...missingWorker, payouts: { ...missingWorker.payouts, wrongId: { status: "pending" } } };
  const paidAsPending = { ...paid, payouts: { ...paid.payouts, amara: { ...paid.payouts.amara, status: "pending" } } };
  const duplicateReceipt = { ...paid, payouts: { ...paid.payouts, bisi: paid.payouts.amara } };
  for (const contents of ["{", ...[missingWorker, wrongWorker, paidAsPending, duplicateReceipt].map((state) => JSON.stringify(state))]) {
    await fs.writeFile(file, contents);
    await assert.rejects(readProjectState, unavailable);
    await assert.rejects(update, unavailable);
    assert.equal(await fs.readFile(file, "utf8"), contents);
  }

  await fs.rm(file);
  await assert.rejects(update, unavailable);
  await assert.rejects(fs.stat(file), { code: "ENOENT" });
  const payer = Keypair.random().publicKey();
  await createProjectState("testnet", payer);
  assert.throws(() => assertPayoutHistory({ mode: "testnet", payer }, Keypair.random().publicKey()), /different payout wallet/);
  assert.doesNotThrow(() => assertPayoutHistory({ mode: "testnet", payer }, payer));
});
