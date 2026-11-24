import { Keypair, rpc, StrKey } from "@stellar/stellar-sdk";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { x402Client } from "@x402/fetch";
import { createEd25519Signer } from "@x402/stellar";
import { ExactStellarScheme } from "@x402/stellar/exact/client";
import { TESTNET_PASSPHRASE, TESTNET_USDC_CONTRACT, validHash } from "./funding.mjs";
import { payoutUnits, quoteMatches, TESTNET_RPC, verifiedSettlement, walletUsdc } from "./stellar-settlement.mjs";
import { projectError } from "./project-store.mjs";

const network = "stellar:testnet";
export function createSettlement(settings, { checkBalance = walletUsdc, createPayload, ledger } = {}) {
  const { facilitator } = settings;
  const url = URL.canParse(facilitator.url) ? new URL(facilitator.url) : null;
  const local = url && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const enabled = process.env.PAYSHARE_ENABLE_TESTNET_PAYOUTS === "true" &&
    settings.network === network && settings.networkPassphrase === TESTNET_PASSPHRASE &&
    settings.usdc.contractId === TESTNET_USDC_CONTRACT &&
    StrKey.isValidEd25519SecretSeed(settings.agentSecret || "") &&
    url && !url.username && !url.password && !url.search && !url.hash &&
    (url.protocol === "https:" || (local && url.protocol === "http:")) &&
    (!facilitator.keyUrl || facilitator.apiKey);
  const payer = enabled ? Keypair.fromSecret(settings.agentSecret).publicKey() : null;
  const service = enabled ? new HTTPFacilitatorClient({
    url: facilitator.url,
    ...(facilitator.apiKey && {
      createAuthHeaders: async () => {
        const headers = { Authorization: `Bearer ${facilitator.apiKey}` };
        return { supported: headers, verify: headers, settle: headers };
      },
    }),
  }) : null;

  async function receipt(payment, hash) {
    if (!validHash(hash)) throw projectError("Enter a valid testnet transaction hash");
    const server = ledger || new rpc.Server(TESTNET_RPC, { timeout: 12_000 });
    if ((await server.getNetwork()).passphrase !== TESTNET_PASSPHRASE) throw new Error("Unexpected Stellar network");
    return verifiedSettlement(hash, await server.getTransaction(hash), payment);
  }

  async function prepare(payment) {
    if (!service || payer !== payment.payer) throw projectError("Testnet settlement is unavailable for this project", 503);
    const [supported, balance] = await Promise.all([service.getSupported(), checkBalance(payer)]);
    const kind = supported.kinds.find(entry => entry.x402Version === 2 && entry.scheme === "exact" && entry.network === network);
    if (!kind || balance < BigInt(payoutUnits(payment.amount))) {
      throw projectError("The facilitator or funding wallet cannot settle this payout", 503);
    }
    const terms = {
      scheme: "exact", network, asset: TESTNET_USDC_CONTRACT, amount: payoutUnits(payment.amount),
      payTo: payment.recipient, maxTimeoutSeconds: 300, extra: { ...(kind.extra?.areFeesSponsored === true && { areFeesSponsored: true }) },
    };
    const client = new x402Client().register(network, new ExactStellarScheme(
      createEd25519Signer(settings.agentSecret, network), { url: TESTNET_RPC },
    ));
    client.setSpendControls({ maxAmountPerPayment: `$${(payment.amount / 100).toFixed(2)}` });
    client.registerPolicy((version, options) => options.filter(option => quoteMatches(version, option, payment)));
    const quote = {
      x402Version: 2, resource: { url: "https://payshare.invalid/payout", description: "PayShare approved task", mimeType: "application/json" },
      accepts: [terms],
    };
    const payload = await (createPayload ? createPayload(quote) : client.createPaymentPayload(quote));
    const verification = await service.verify(payload, terms);
    if (!verification.isValid || (verification.payer && verification.payer !== payer)) {
      throw projectError("The facilitator could not verify the payout", 502);
    }
    return async () => {
      const result = await service.settle(payload, terms);
      if (!result.success || result.network !== network || !validHash(result.transaction)) {
        throw projectError("The facilitator did not confirm settlement", 502);
      }
      return result.transaction.toLowerCase();
    };
  }

  return { payer, prepare, receipt };
}
