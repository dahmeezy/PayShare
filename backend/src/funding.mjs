import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { projectError } from "./project-store.mjs";

export const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";
export const TESTNET_USDC_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
export const TESTNET_USDC_CONTRACT = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";
export const validHash = (hash) => typeof hash === "string" && /^[a-f0-9]{64}$/i.test(hash);

export function validateFundingRequest(body) {
  if (!Number.isSafeInteger(body?.amount) || body.amount <= 0) {
    throw projectError("Amount must be a positive integer in cents");
  }
  if (!StrKey.isValidEd25519PublicKey(body.funding_address ?? "")) {
    throw projectError("Funding address must be a valid Stellar public account");
  }
  return { amount: body.amount, funding_address: body.funding_address };
}

export function usdcUnits(amount) {
  if (typeof amount !== "string" || !/^\d+(\.\d{1,7})?$/.test(amount)) {
    throw new Error("Invalid Stellar USDC amount");
  }
  const [whole, fraction = ""] = amount.split(".");
  return BigInt(whole) * 10_000_000n + BigInt(fraction.padEnd(7, "0"));
}

export async function horizon(path = "/", get = fetch) {
  const result = await get(`https://horizon-testnet.stellar.org${path}`, {
    signal: AbortSignal.timeout(12_000), redirect: "error",
  });
  if (result.status === 404) throw projectError("Stellar has not found this record yet", 422);
  if (!result.ok) throw projectError("Stellar testnet lookup failed", 503);
  return result.json();
}

export function fundingWallet() {
  const publicKey = process.env.PAYSHARE_PAYER_WALLET;
  if (StrKey.isValidEd25519PublicKey(publicKey ?? "")) return publicKey;
  if (process.env.STELLAR_SECRET_KEY) return Keypair.fromSecret(process.env.STELLAR_SECRET_KEY).publicKey();
  throw projectError("The testnet funding wallet is not configured", 503);
}

export async function verifyFundingTransfer(hash, request, recipient, get = fetch) {
  if (!validHash(hash)) throw projectError("Provide a Stellar transaction hash");
  if (request.funding_address === recipient) throw projectError("Funding must come from the client wallet");
  const [network, tx, operations] = await Promise.all([
    horizon("/", get), horizon(`/transactions/${hash}`, get),
    horizon(`/transactions/${hash}/operations?limit=2`, get),
  ]);
  if (network.network_passphrase !== TESTNET_PASSPHRASE) throw new Error("Unexpected Stellar network");
  const records = operations._embedded?.records;
  const payment = records?.[0];
  if (tx.hash?.toLowerCase() !== hash.toLowerCase() || tx.successful !== true ||
      records?.length !== 1 || payment?.type !== "payment" ||
      payment.from !== request.funding_address || payment.to !== recipient ||
      payment.asset_code !== "USDC" || payment.asset_issuer !== TESTNET_USDC_ISSUER ||
      usdcUnits(payment.amount) !== BigInt(request.amount) * 100_000n) {
    throw projectError("Transaction must be a successful, single USDC payment for the requested amount from the client wallet", 422);
  }
  if (!Number.isFinite(Date.parse(tx.created_at))) throw new Error("Invalid Stellar transaction date");
  return { transaction: hash.toLowerCase(), confirmed_at: tx.created_at };
}
