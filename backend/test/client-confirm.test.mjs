import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { canConfirm, confirmDemoWork } from "../src/client-confirm.mjs";

test("requires a client and an explicit true confirmation", () => {
  assert.throws(() => canConfirm("worker", true), /client/);
  assert.throws(() => canConfirm("client", false), /true/);
  assert.doesNotThrow(() => canConfirm("client", true));
});

test("records confirmation and is safe to repeat", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "payshare-confirm-"));
  const file = path.join(dir, "state.json");
  try {
    assert.equal((await confirmDemoWork(file, "client", true)).already_confirmed, false);
    assert.equal((await confirmDemoWork(file, "client", true)).already_confirmed, true);
    assert.equal(JSON.parse(await fs.readFile(file, "utf8")).clientConfirmed, true);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test("rejects confirmation when payment has already started", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "payshare-confirm-"));
  const file = path.join(dir, "state.json");
  try {
    await fs.writeFile(file, JSON.stringify({ payouts: { amara: { status: "processing" } } }));
    await assert.rejects(() => confirmDemoWork(file, "client", true), /payment has started/);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
