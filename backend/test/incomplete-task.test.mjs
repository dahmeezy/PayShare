import test from "node:test";
import assert from "node:assert/strict";
import { validateIncompleteReport, canPayForTask } from "../src/incomplete-task.mjs";

const workers = [{ id: "amara" }];

test("valid report does not authorize payout", () => {
  const report = validateIncompleteReport({ worker_id: "amara", reason: "Unfinished work" }, workers);
  assert.equal(report.status, "open");
  assert.equal(report.payout_eligible, false);
});

test("rejects missing worker or reason", () => {
  assert.throws(() => validateIncompleteReport({ worker_id: "unknown", reason: "late" }, workers));
  assert.throws(() => validateIncompleteReport({ worker_id: "amara", reason: "  " }, workers));
});

test("only approved and client-confirmed work without open reports can be paid", () => {
  assert.equal(canPayForTask({ status: "approved", client_confirmed: true }), true);
  assert.equal(canPayForTask({ status: "submitted", client_confirmed: true }), false);
  assert.equal(canPayForTask({ status: "approved", requires_client: true, client_confirmed: false }), false);
  assert.equal(canPayForTask({ status: "approved", client_confirmed: true, incomplete_report_open: true }), false);
});
