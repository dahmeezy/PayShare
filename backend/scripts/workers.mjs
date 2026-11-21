// Creates testnet wallets for PayShare's sample workers.
// Safe to re-run: never overwrites a key already in .env, and never prints secret keys.
import fs from "node:fs/promises";
import { parse } from "dotenv";
import { Keypair, Horizon, rpc, TransactionBuilder, Operation, Asset, BASE_FEE } from "@stellar/stellar-sdk";

const WORKERS = ["AMARA", "BISI", "CHIDI"]; // sample workers for the demo
const short = (g) => `${g.slice(0, 6)}…${g.slice(-4)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let text = await fs.readFile(".env", "utf8");
const env = parse(text);

// 1. Create any missing keys and save BEFORE touching the network,
//    so a network hiccup can never lose a freshly generated key.
for (const name of WORKERS) {
  if (env[`WORKER_${name}`]) continue;
  const kp = Keypair.random();
  env[`WORKER_${name}`] = kp.publicKey();
  env[`WORKER_${name}_SECRET`] = kp.secret();
  text = `${text.trimEnd()}\nWORKER_${name}=${kp.publicKey()}\nWORKER_${name}_SECRET=${kp.secret()}\n`;
}
await fs.writeFile(".env", text, { mode: 0o600 });

// 2. Same helpers the kit's setup script uses
const horizon = new Horizon.Server(env.STELLAR_HORIZON_URL);
const rpcServer = new rpc.Server(env.STELLAR_RPC_URL);
const USDC = new Asset(env.USDC_ASSET_CODE, env.USDC_ISSUER);

async function loadAccount(pub) {
  try { return await horizon.loadAccount(pub); }
  catch (e) { if (e?.response?.status === 404) return null; throw e; }
}
async function ensureFunded(pub) {
  if (await loadAccount(pub)) return "already funded";
  await rpcServer.fundAddress(pub); // Friendbot gives free test XLM
  for (let i = 0; i < 10; i++) {
    if (await loadAccount(pub)) return "funded by Friendbot";
    await sleep(1000);
  }
  throw new Error(`Friendbot funded ${short(pub)} but Horizon can't see it yet. Run this script again.`);
}
const hasUsdc = (acc) => acc.balances.some((b) => b.asset_code === USDC.code && b.asset_issuer === USDC.issuer);
async function ensureTrustline(kp) {
  const acc = await loadAccount(kp.publicKey());
  if (hasUsdc(acc)) return `${USDC.code} trustline already there`;
  const tx = new TransactionBuilder(acc, { fee: BASE_FEE, networkPassphrase: env.STELLAR_NETWORK_PASSPHRASE })
    .addOperation(Operation.changeTrust({ asset: USDC }))
    .setTimeout(60)
    .build();
  tx.sign(kp);
  await horizon.submitTransaction(tx);
  return `${USDC.code} trustline added`;
}

// 3. Fund each worker wallet and let it hold USDC
console.log("\nSetting up PayShare worker wallets…\n");
for (const name of WORKERS) {
  const kp = Keypair.fromSecret(env[`WORKER_${name}_SECRET`]);
  console.log(`${name}  ${short(kp.publicKey())}`);
  console.log(`  ✓ ${await ensureFunded(kp.publicKey())}`);
  console.log(`  ✓ ${await ensureTrustline(kp)}`);
}
console.log("\nDone. Worker addresses are saved in .env as WORKER_<NAME>.\n");