import { Account, Asset, BASE_FEE, Keypair, Memo, Operation, StrKey, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { horizon, TESTNET_PASSPHRASE, TESTNET_USDC_ISSUER, usdcUnits } from "./funding.mjs";
import { endpoint } from "./money-api.mjs";
import { projectError } from "./project-store.mjs";
import { funded, readWorkspace, reservedFunding, updateWorkspace } from "./workspace-store.mjs";

const usdc = new Asset("USDC", TESTNET_USDC_ISSUER);
const maxFee = 100_000; // 0.01 test XLM
const summary = project => ({ attempt: project.walletFunding ?? null, funded: funded(project), budget: project.budget });

function allowNewFunding(project) {
  if (reservedFunding(project)) throw projectError("Check the existing wallet funding request before starting another.", 409);
}

function walletAddress(project, address) {
  if (typeof address !== "string" || !StrKey.isValidEd25519PublicKey(address) || address === project.payer) {
    throw projectError("Connect a valid Stellar testnet wallet distinct from the project funding account.");
  }
  return address;
}

function balanceUnits(account) {
  const line = account.balances.find(entry => entry.asset_code === "USDC" && entry.asset_issuer === TESTNET_USDC_ISSUER);
  if (!line || line.is_authorized !== true) return null;
  const available = usdcUnits(line.balance) - usdcUnits(line.selling_liabilities ?? "0");
  return available > 0n ? available : 0n;
}

function decimal(units) {
  const fraction = String(units % 10_000_000n).padStart(7, "0").replace(/0+$/, "");
  return String(units / 10_000_000n) + (fraction ? "." + fraction : "");
}

function signedHash(envelope, source) {
  try {
    const transaction = TransactionBuilder.fromXDR(envelope, TESTNET_PASSPHRASE);
    if (!(transaction instanceof Transaction) || transaction.source !== source) throw new Error();
    const hash = transaction.hash();
    const key = Keypair.fromPublicKey(source);
    if (!transaction.signatures.some(signature => key.verify(hash, signature.signature()))) throw new Error();
    return hash.toString("hex");
  } catch {
    throw projectError("Freighter did not return a valid signature from the connected wallet.");
  }
}

export function registerWalletFunding(router, path, { projectFor, amount, fundingMemo, recordFunding, verifyFunding, get }) {
  const lookup = (path, options) => horizon(path, get, options);
  const account = async address => {
    try { return await lookup("/accounts/" + address); }
    catch (error) {
      if (error.status === 422) throw projectError("This wallet does not exist on Stellar testnet. Activate it with test XLM first.", 422);
      throw projectError("Stellar testnet is unavailable. Try connecting again.", 503);
    }
  };
  const projectForClient = (state, req) => {
    const project = projectFor(state, req.params.projectId, req.user.id, ["client"]);
    if (project.mode !== "testnet") throw projectError("This project uses simulated funding.", 409);
    return project;
  };
  const readProject = async req => projectForClient(await readWorkspace(), req);
  const transaction = async hash => {
    try { return await lookup("/transactions/" + hash); }
    catch (error) { if (error.status === 422) return null; throw error; }
  };
  const matches = (current, saved) => current?.hash === saved.hash && current.status === saved.status;

  async function check(req) {
    const project = await readProject(req);
    const attempt = project.walletFunding;
    if (!attempt || ["confirmed", "failed"].includes(attempt.status)) return summary(project);
    let deposit;
    if (attempt.status === "prepared") {
      if (attempt.expiresAt > Date.now()) return summary(project);
    } else {
      try {
        let result = await transaction(attempt.hash);
        if (result === null) {
          if (attempt.expiresAt > Date.now()) return summary(project);
          // After expiry, require an ingested ledger beyond the deadline, then check the hash again.
          const ledgers = await lookup("/ledgers?order=desc&limit=1");
          const closedAt = Date.parse(ledgers._embedded?.records?.[0]?.closed_at);
          if (!(closedAt > attempt.expiresAt)) return summary(project);
          result = await transaction(attempt.hash);
        }
        if (result !== null) {
          if (result.hash !== attempt.hash || typeof result.successful !== "boolean") return summary(project);
          if (result.successful) {
            deposit = { amount: attempt.amount, ...await verifyFunding(attempt.hash, {
              funding_address: attempt.source, amount: attempt.amount, memo: fundingMemo(project.id),
            }, project.payer) };
          }
        }
      } catch {
        return summary(project); // A failed lookup or verification cannot unlock funding.
      }
    }
    return updateWorkspace(state => {
      const current = projectForClient(state, req);
      if (matches(current.walletFunding, attempt)) {
        if (deposit) recordFunding(state, current, deposit);
        current.walletFunding.status = deposit ? "confirmed" : "failed";
      }
      return summary(current);
    });
  }

  router.post(path + "/balance", endpoint(async (req, res) => {
    const address = walletAddress(await readProject(req), req.body?.address);
    const available = balanceUnits(await account(address));
    res.json({ address, balance: decimal(available ?? 0n), trustline: available !== null });
  }));

  router.post(path + "/prepare", endpoint(async (req, res) => {
    const project = await readProject(req);
    const source = walletAddress(project, req.body?.address);
    const cents = amount(req.body?.amount);
    allowNewFunding(project);
    if (funded(project) + cents > project.budget) throw projectError("Funding exceeds the project budget", 409);
    const [sender, fees] = await Promise.all([account(source), lookup("/fee_stats").catch(() => null)]);
    const available = balanceUnits(sender);
    if (available === null) throw projectError("Add the Circle USDC trustline on Stellar testnet first.", 422);
    if (available < BigInt(cents) * 100_000n) throw projectError("The wallet has insufficient testnet USDC.", 422);
    const fee = Math.max(Number(BASE_FEE), Number(fees?.last_ledger_base_fee || BASE_FEE), Number(fees?.fee_charged?.p70 || BASE_FEE));
    if (!Number.isSafeInteger(fee) || fee > maxFee) throw projectError("Stellar fees are unusually high. Try again shortly.", 503);
    const transaction = new TransactionBuilder(new Account(source, sender.sequence), { fee: String(fee), networkPassphrase: TESTNET_PASSPHRASE })
      .addMemo(Memo.hash(Buffer.from(fundingMemo(project.id), "base64")))
      .addOperation(Operation.payment({ destination: project.payer, asset: usdc, amount: decimal(BigInt(cents) * 100_000n) }))
      .setTimeout(120)
      .build();
    const attempt = {
      hash: transaction.hash().toString("hex"), amount: cents, source,
      expiresAt: Number(transaction.timeBounds.maxTime) * 1000, status: "prepared",
    };
    await updateWorkspace(state => {
      const current = projectForClient(state, req);
      allowNewFunding(current);
      if (funded(current) + cents > current.budget) throw projectError("Funding exceeds the project budget", 409);
      current.walletFunding = attempt;
    });
    res.json({ attempt, xdr: transaction.toXDR() });
  }));

  router.post(path + "/cancel", endpoint(async (req, res) => {
    const result = await updateWorkspace(state => {
      const project = projectForClient(state, req);
      if (project.walletFunding?.status === "prepared" && project.walletFunding.hash === req.body?.hash) {
        project.walletFunding.status = "failed";
      }
      return summary(project);
    });
    res.json(result);
  }));

  router.post(path + "/submit", endpoint(async (req, res) => {
    const signed = req.body?.xdr;
    const attempt = (await readProject(req)).walletFunding;
    if (!attempt || typeof signed !== "string" || signedHash(signed, attempt.source) !== attempt.hash) {
      throw projectError("The signed payment does not match the prepared funding request.", 409);
    }
    if (attempt.status !== "prepared") return res.json(await check(req));
    await updateWorkspace(state => {
      const current = projectForClient(state, req);
      if (!matches(current.walletFunding, attempt) || attempt.expiresAt <= Date.now()) {
        throw projectError("This funding request expired or changed. Check its status.", 409);
      }
      current.walletFunding.status = "pending";
    });
    // An interrupted request may have reached Stellar. Never broadcast a replacement here.
    await lookup("/transactions", { method: "POST", body: new URLSearchParams({ tx: signed }) }).catch(() => {});
    res.json(await check(req));
  }));

  router.post(path + "/status", endpoint(async (req, res) => res.json(await check(req))));
}
