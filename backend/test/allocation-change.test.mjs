import test from "node:test";
import assert from "node:assert/strict";
import { proposeAllocationChange, canApplyAllocationChange } from "../src/allocation-change.mjs";
const workers = [{ id: "amara", allocation: 1.5 }];

test("proposal does not change the worker allocation", () => {
  const change = proposeAllocationChange({ allocation_id: "alloc_amara", proposed_amount: 120, reason: "Updated scope" }, workers);
  assert.equal(change.current_amount, 150);
  assert.equal(change.proposed_amount, 120);
  assert.equal(change.status, "pending");
  assert.equal(workers[0].allocation, 1.5);
});

test("rejects invalid proposals", () => {
  for (const input of [
    { allocation_id: "alloc_missing", proposed_amount: 100, reason: "Change" },
    { allocation_id: "alloc_amara", proposed_amount: -1, reason: "Change" },
    { allocation_id: "alloc_amara", proposed_amount: 100, reason: "" },
  ]) assert.throws(() => proposeAllocationChange(input, workers));
});

test("requires both approvals before applying", () => {
  const change = proposeAllocationChange({ allocation_id: "alloc_amara", proposed_amount: 175, reason: "Updated scope" }, workers);
  assert.equal(canApplyAllocationChange(change), false);
  change.worker_accepted = true;
  assert.equal(canApplyAllocationChange(change), false);
  change.client_approved = true;
  assert.equal(canApplyAllocationChange(change), true);
});
