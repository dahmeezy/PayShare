import test from "node:test";
import assert from "node:assert/strict";
import { validateSettlement, canStartPayout, canResetPayouts } from "../src/payout-validation.mjs";

test("requires a successful settlement and a transaction hash", () => {
  const hash = "a".repeat(64);
  assert.equal(validateSettlement({ success: true, transaction: hash }), hash);
  assert.throws(() => validateSettlement({ success: false, transaction: hash }));
  assert.throws(() => validateSettlement({ success: true, transaction: "bad" }));
});

test("requires client confirmation and a pending payout", () => {
  assert.throws(() => canStartPayout({ clientConfirmed: false }, "amara"));
  assert.equal(canStartPayout({ clientConfirmed: true, payouts: { amara: { status: "pending" } } }, "amara"), true);
  assert.throws(() => canStartPayout({ clientConfirmed: true, payouts: {} }, "amara"), /Missing payout record/);
  for (const status of ["paid", "processing", "failed"]) {
    assert.throws(() => canStartPayout({ clientConfirmed: true, payouts: { amara: { status } } }, "amara"));
  }
});

test("reset is blocked after any payout attempt", () => {
  assert.equal(canResetPayouts({ payouts: { amara: { status: "pending" } } }), true);
  assert.throws(() => canResetPayouts({ payouts: null }), /Invalid payout history/);
  for (const status of ["processing", "paid", "failed"]) {
    assert.throws(() => canResetPayouts({ payouts: { amara: { status } } }), /Cannot reset/);
  }
});
