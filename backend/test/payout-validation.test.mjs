import { Asset, Keypair } from "@stellar/stellar-sdk";
import test from "node:test";
import assert from "node:assert/strict";
import { validateSettlement, canStartPayout, canResetPayouts, validatePayoutHistory, verifyTransactionOnHorizon, verifyHorizonNetwork, requireTestnet, validateWorkerRecipients, validateUsdcConfig, summarizePayouts, summarizePayoutCents } from "../src/payout-validation.mjs";

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

test("rejects unexpected payout states", () => {
  for (const status of ["unknown", null, ""]) {
    assert.throws(() => canStartPayout({ clientConfirmed: true, payouts: { amara: { status } } }, "amara"));
    assert.throws(() => canResetPayouts({ payouts: { amara: { status } } }));
  }
  assert.throws(() => canResetPayouts({ payouts: [] }), /Invalid payout history/);
});

test("payout history must match all workers", () => {
  const valid = { clientConfirmed: true, payouts: { amara: { status: "pending" }, bisi: { status: "paid", tx: "a".repeat(64) } } };
  assert.equal(validatePayoutHistory(valid, ["amara", "bisi"]), true);
  assert.throws(() => validatePayoutHistory(valid, ["amara"]), /do not match/);
  assert.throws(() => validatePayoutHistory({ ...valid, payouts: { amara: { status: "pending" } } }, ["amara", "bisi"]), /do not match/);
  assert.throws(() => validatePayoutHistory({ ...valid, payouts: { amara: { status: "pending" }, bisi: { status: "paid" } } }, ["amara", "bisi"]), /transaction hash/);
  assert.throws(() => validatePayoutHistory({ ...valid, clientConfirmed: "true" }, ["amara", "bisi"]), /Invalid payout history/);
});

test("Horizon independently confirms a matching successful transaction", async () => {
  const hash = "a".repeat(64);
  const fakeFetch = async (url) => {
    assert.equal(url, `https://horizon-testnet.stellar.org/transactions/${hash}`);
    return { ok: true, json: async () => ({ hash, successful: true }) };
  };
  assert.equal(await verifyTransactionOnHorizon(hash, "https://horizon-testnet.stellar.org/", fakeFetch), hash);
  await assert.rejects(() => verifyTransactionOnHorizon(hash, "https://horizon-testnet.stellar.org", async () => ({
    ok: true, json: async () => ({ hash, successful: false }),
  })), /did not confirm/);
  await assert.rejects(() => verifyTransactionOnHorizon(hash, "https://horizon-testnet.stellar.org", async () => ({
    ok: false, status: 404,
  })), /HTTP 404/);
  await assert.rejects(() => verifyTransactionOnHorizon("invalid", "https://horizon-testnet.stellar.org", fakeFetch), /Invalid Stellar transaction hash/);
  await assert.rejects(() => verifyTransactionOnHorizon(hash, "http://example.com", fakeFetch), /HTTPS/);
});

test("Horizon network must match the configured Stellar passphrase", async () => {
  const passphrase = "Test SDF Network ; September 2015";
  const fakeFetch = async () => ({ ok: true, json: async () => ({ network_passphrase: passphrase }) });
  assert.equal(await verifyHorizonNetwork("https://horizon-testnet.stellar.org", passphrase, fakeFetch), true);
  await assert.rejects(() => verifyHorizonNetwork("https://horizon-testnet.stellar.org", "Public Global Stellar Network ; September 2015", fakeFetch), /does not match/);
  await assert.rejects(() => verifyHorizonNetwork("http://untrusted.example", passphrase, fakeFetch), /HTTPS/);
});

test("demo payout refuses public Stellar network", () => {
  assert.equal(requireTestnet("stellar:testnet", "Test SDF Network ; September 2015"), true);
  assert.throws(() => requireTestnet("stellar:pubnet", "Public Global Stellar Network ; September 2015"), /restricted to Stellar testnet/);
  assert.throws(() => requireTestnet("stellar:testnet", "Public Global Stellar Network ; September 2015"), /restricted to Stellar testnet/);
});

test("worker recipients must be unique with valid allocations", () => {
  const walletA = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 1)).publicKey();
  const walletB = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 2)).publicKey();
  const a = { id: "amara", wallet: walletA, allocation: 1.5 };
  const b = { id: "bisi", wallet: walletB, allocation: 2.5 };
  assert.equal(validateWorkerRecipients([a, b]), true);
  assert.throws(() => validateWorkerRecipients([a, { ...b, wallet: walletA }]), /Duplicate worker wallet/);
  assert.throws(() => validateWorkerRecipients([a, { ...b, id: "amara" }]), /Duplicate worker ID/);
  assert.throws(() => validateWorkerRecipients([a, { ...b, allocation: -1 }]), /Invalid allocation/);
  assert.throws(() => validateWorkerRecipients([a, { ...b, allocation: 1.234 }]), /Invalid allocation/);
  assert.throws(() => validateWorkerRecipients([a, { ...b, wallet: "not-a-wallet" }]), /Invalid Stellar wallet/);
  const badChecksum = walletB.slice(0, -1) + (walletB.endsWith("A") ? "B" : "A");
  assert.throws(() => validateWorkerRecipients([a, { ...b, wallet: badChecksum }]), /Invalid Stellar wallet/);
});

test("USDC configuration requires valid Stellar identifiers", () => {
  const valid = {
    code: "USDC",
    issuer: Keypair.fromRawEd25519Seed(Buffer.alloc(32, 3)).publicKey(),
    contractId: new Asset("USDC", Keypair.fromRawEd25519Seed(Buffer.alloc(32, 3)).publicKey()).contractId("Test SDF Network ; September 2015"),
    decimals: 7,
  };
  const passphrase = "Test SDF Network ; September 2015";
  assert.equal(validateUsdcConfig(valid, passphrase), true);
  assert.throws(() => validateUsdcConfig({ ...valid, code: "XLM" }, passphrase), /USDC asset code/);
  assert.throws(() => validateUsdcConfig({ ...valid, issuer: "bad" }, passphrase), /issuer/);
  assert.throws(() => validateUsdcConfig({ ...valid, contractId: "bad" }, passphrase), /contract ID/);
  assert.throws(() => validateUsdcConfig({ ...valid, decimals: 6 }, passphrase), /7 decimals/);
  assert.throws(() => validateUsdcConfig(valid, "Public Global Stellar Network ; September 2015"), /does not match/);
});

test("payout summary does not count processing transfers as paid", () => {
  const workers = [
    { id: "amara", allocation: 1.5 },
    { id: "bisi", allocation: 2.5 },
    { id: "chidi", allocation: 3 },
  ];
  const state = { clientConfirmed: true, payouts: {
    amara: { status: "paid", tx: "a".repeat(64) },
    bisi: { status: "processing" },
    chidi: { status: "pending" },
  } };
  assert.deepEqual(summarizePayouts(workers, state), { paid: 1.5, verifying: 2.5, pending: 3 });
});

test("money API totals count processing separately in integer cents", () => {
  const workers = [
    { id: "amara", allocation: 1.5 },
    { id: "bisi", allocation: 2.5 },
    { id: "chidi", allocation: 3 },
  ];
  const payouts = {
    amara: { status: "paid", tx: "a".repeat(64) },
    bisi: { status: "processing" },
    chidi: { status: "pending" },
  };
  assert.deepEqual(summarizePayoutCents(workers, payouts), {
    paid: 150, verifying: 250, pending: 300,
  });
  assert.throws(() => summarizePayoutCents(workers, { ...payouts, bisi: { status: "unknown" } }), /Unknown payout status/);
});
