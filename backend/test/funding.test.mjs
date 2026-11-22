import test from "node:test";
import assert from "node:assert/strict";
import { validateFundingRequest } from "../src/funding.mjs";

const address = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

test("accepts a valid funding request as a request only", () => {
  assert.deepEqual(validateFundingRequest({ amount: 1000, funding_address: address }), {
    amount: 1000, funding_address: address,
  });
});

test("rejects invalid amounts", () => {
  for (const amount of [0, -1, 1.5, "100", null]) {
    assert.throws(() => validateFundingRequest({ amount, funding_address: address }));
  }
});

test("rejects malformed addresses", () => {
  for (const funding_address of ["", "not-a-wallet", "S" + "A".repeat(55)]) {
    assert.throws(() => validateFundingRequest({ amount: 100, funding_address }));
  }
});
