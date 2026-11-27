import { api } from "./api.mjs";
import { labelAction, layer, money, number } from "./live-elements.mjs";

const testnet = "Test SDF Network ; September 2015";
let library;

async function freighter() {
  if (window.freighterApi) return window.freighterApi;
  library ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/frontend/prototype/freighter.js";
    script.onload = () => window.freighterApi ? resolve(window.freighterApi) : reject(new Error());
    script.onerror = reject;
    document.head.append(script);
  });
  try { return await library; }
  catch {
    library = undefined;
    throw new Error("Could not load Freighter. Try again or open manual funding.");
  }
}

const element = (tag, text, className) => {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
};
function secondary(text) {
  const button = element("button", text, "btn btn-sm live-outline");
  button.type = "button";
  return button;
}

export function bindWalletFunding(pay, project, original, amount, input) {
  const path = "/workspace/projects/" + project.id + "/funding";
  const request = (action, body = {}) => api(path + "/wallet/" + action, "POST", body, AbortSignal.timeout(30_000));
  const wallet = layer(pay, "Wallet");
  wallet.classList.add("funding-wallet");
  const walletInfo = element("div", "", "funding-wallet-info");
  const addressText = element("p", "Stellar testnet wallet", "live-note");
  const balanceText = element("p", "", "live-note");
  const connect = secondary("Connect Freighter");
  walletInfo.append(addressText, balanceText, connect);
  wallet.replaceChildren(layer(wallet, "box"), walletInfo);

  const fund = original.cloneNode(true);
  delete fund.dataset.submit;
  labelAction(fund, "Fund project");
  original.replaceWith(fund);
  const progress = element("p", "", "live-note");
  const status = element("p", "", "live-note live-status");
  status.setAttribute("role", "status");
  const controls = element("div", "", "funding-controls");
  const checkButton = secondary("Check transaction status");
  const cancel = secondary("Cancel wallet request");
  controls.append(checkButton, cancel);
  const manual = element("details", "", "funding-manual");
  const verify = secondary("Verify testnet deposit");
  manual.append(element("summary", "Advanced manual funding"),
    element("p", "Use the public wallet saved in your PayShare profile. Send one Stellar testnet USDC transfer to " +
      project.payer + " with hash memo " + project.fundingMemo + " (Base64).", "live-note"), verify);
  const hashInput = input(manual, "Stellar transaction hash", { required: true, before: verify });
  pay.append(progress, status, controls, manual);

  let attempt = project.walletFunding;
  let funded = project.funded;
  let budget = project.budget;
  let balance;
  let busy = false;
  let timer;
  const held = () => ["prepared", "pending"].includes(attempt?.status);
  const message = (text, tone = "") => {
    status.textContent = text;
    status.dataset.liveTone = tone;
  };
  function sync() {
    const remaining = Math.max(0, budget - funded);
    progress.textContent = "Project funded: " + money(funded) + " of " + money(budget) + ".";
    const amountLabel = layer(pay, "v")?.querySelector("p");
    if (amountLabel) amountLabel.textContent = number(remaining);
    amount.max = String(remaining / 100);
    amount.disabled = busy || held() || remaining === 0;
    connect.disabled = busy;
    fund.disabled = busy || held() || remaining === 0 || !balance?.trustline;
    checkButton.hidden = !held();
    cancel.hidden = attempt?.status !== "prepared";
    checkButton.disabled = cancel.disabled = busy;
    controls.hidden = !held();
    hashInput.disabled = verify.disabled = busy || held() || remaining === 0;
  }
  function showAttempt() {
    if (attempt?.status === "prepared") message("Awaiting wallet approval. You can cancel this request if you closed Freighter.");
    if (attempt?.status === "pending") message("Payment pending. PayShare is checking Stellar before allowing another payment.");
    if (attempt?.status === "confirmed") message("Funding successful. Stellar verified the USDC payment.", "good");
    if (attempt?.status === "failed") message("Funding failed, expired or was cancelled. You can start a new payment.", "warning");
  }
  function update(result) {
    attempt = result.attempt;
    if (funded !== result.funded) amount.value = String((result.budget - result.funded) / 100);
    funded = result.funded;
    budget = result.budget;
    showAttempt();
  }
  async function readBalance(address) {
    balance = await request("balance", { address });
    addressText.textContent = balance.address;
    balanceText.textContent = balance.trustline ? "Available: " + balance.balance + " testnet USDC" : "Add the Circle USDC trustline on Stellar testnet first.";
    connect.textContent = "Refresh wallet";
  }
  async function applyStatus(result) {
    const previous = attempt?.status;
    update(result);
    if (previous === "pending" && attempt?.status === "confirmed" && balance) {
      await readBalance(balance.address).catch(() => { balanceText.textContent = "Balance unavailable. Refresh your wallet."; });
    }
  }
  async function check() { await applyStatus(await request("status")); }
  function schedule() {
    clearTimeout(timer);
    if (held()) timer = setTimeout(() => { if (pay.isConnected && !pay.closest("[inert]")) void run(check); }, 5000);
  }
  async function run(operation) {
    if (busy || !pay.isConnected || pay.closest("[inert]")) return;
    clearTimeout(timer);
    busy = true;
    sync();
    try { await operation(); }
    catch (error) {
      message(held() ? error.message + " Check the transaction status before starting another payment." : error.message, "warning");
    } finally {
      busy = false;
      sync();
      schedule();
    }
  }
  async function connectedWallet() {
    const wallet = await freighter();
    if (!(await wallet.isConnected()).isConnected) throw new Error("Open this page in a browser with Freighter, or use advanced manual funding.");
    return wallet;
  }
  async function requireTestnet(wallet) {
    if ((await wallet.getNetwork()).networkPassphrase !== testnet) throw new Error("Switch Freighter to Stellar Testnet and try again.");
  }
  const enteredAmount = () => {
    if (!amount.reportValidity()) return null;
    return Math.round(Number(amount.value) * 100);
  };

  connect.addEventListener("click", () => void run(async () => {
    balance = undefined;
    addressText.textContent = "Stellar testnet wallet";
    balanceText.textContent = "";
    const wallet = await connectedWallet();
    const access = await wallet.requestAccess();
    if (access.error || !access.address) throw new Error("Freighter connection was declined or the wallet is locked.");
    await requireTestnet(wallet);
    await readBalance(access.address);
    if (held()) showAttempt();
    else if (attempt?.status !== "confirmed") message("");
  }));
  fund.addEventListener("click", () => {
    const cents = enteredAmount();
    if (!cents || !balance) return;
    void run(async () => {
      const wallet = await connectedWallet();
      await requireTestnet(wallet);
      const address = balance.address;
      if ((await wallet.getAddress()).address !== address) throw new Error("The wallet account changed. Refresh your wallet first.");
      let quote;
      try { quote = await request("prepare", { address, amount: cents }); }
      catch (error) {
        await check().catch(() => {});
        if (held()) return;
        throw error;
      }
      attempt = quote.attempt;
      showAttempt();
      let signed;
      try {
        const result = await wallet.signTransaction(quote.xdr, { address, networkPassphrase: testnet });
        if (result.error || result.signerAddress !== address || !result.signedTxXdr || !pay.isConnected) {
          throw new Error("Wallet approval was cancelled or the wallet account changed.");
        }
        signed = result.signedTxXdr;
      } catch (error) {
        update(await request("cancel", { hash: attempt.hash }));
        throw error;
      }
      attempt = { ...attempt, status: "pending" };
      showAttempt();
      try { await applyStatus(await request("submit", { xdr: signed })); }
      catch { await check(); }
    });
  });
  checkButton.addEventListener("click", () => void run(check));
  cancel.addEventListener("click", () => void run(async () => update(await request("cancel", { hash: attempt.hash }))));
  hashInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      verify.click();
    }
  });
  verify.addEventListener("click", () => {
    const cents = enteredAmount();
    if (!cents || !hashInput.reportValidity()) return;
    void run(async () => {
      const result = await api(path, "POST", { amount: cents, transaction: hashInput.value.trim() }, AbortSignal.timeout(30_000));
      update({ attempt: null, funded: result.funded, budget: result.budget });
      hashInput.value = "";
      message("Funding successful. Stellar verified the USDC payment.", "good");
    });
  });
  showAttempt();
  sync();
  schedule();
}
