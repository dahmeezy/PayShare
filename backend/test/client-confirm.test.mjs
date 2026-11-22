import test from "node:test";
import assert from "node:assert/strict";
import { canConfirm, confirmTask } from "../src/client-confirm.mjs";

test("requires a client and an explicit true confirmation", () => {
  assert.throws(() => canConfirm("worker", true), /client/);
  assert.throws(() => canConfirm("client", false), /true/);
  assert.doesNotThrow(() => canConfirm("client", true));
});

test("only designated, approved deliverables can be confirmed, with a single history record", () => {
  const task = { status: "accepted", requires_client: true, history: [] };
  assert.throws(() => confirmTask(task, "client", true), /approved/);
  task.status = "approved";
  task.requires_client = false;
  assert.throws(() => confirmTask(task, "client", true), /designated/);
  task.overall_completion = true;
  assert.equal(confirmTask(task, "client", true).client_confirmed, true);
  confirmTask(task, "client", true);
  assert.equal(task.history.length, 1);
});
