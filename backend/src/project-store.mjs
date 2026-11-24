// One local testnet project. All writers use the same lock, including the payout CLI.
import fs from "node:fs/promises";
import path from "node:path";
import { updateJsonFile } from "./json-file.mjs";
import { StrKey } from "@stellar/stellar-sdk";
import { PROJECT } from "./project.mjs";

const file = path.resolve(process.env.PAYSHARE_STATE_FILE || "payshare-state.json");
const emptyProject = () => ({
  allocations: {},
  expenses: [],
  funding: [],
  tasks: {},
  changes: [],
  reports: [],
  notifications: [],
});

export function projectError(message, status = 400) {
  return Object.assign(new Error(message), { status, expose: true });
}

const historyUnavailable = () => Object.assign(projectError(
  "Payment history is unavailable. Restore and reconcile it before continuing.", 503,
), { code: "PAYMENT_HISTORY_UNAVAILABLE" });

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isHash = (value) => typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);

function validateHistory(state) {
  if (!isObject(state) || !isObject(state.payouts) || typeof state.clientConfirmed !== "boolean" ||
      (state.mode !== undefined && !["preview", "testnet"].includes(state.mode)) ||
      (state.mode === "testnet" && !StrKey.isValidEd25519PublicKey(state.payer ?? ""))) {
    throw historyUnavailable();
  }
  const workerIds = PROJECT.workers.map(({ id }) => id);
  if (Object.keys(state.payouts).length !== workerIds.length) throw historyUnavailable();
  const receipts = new Set();
  for (const id of workerIds) {
    const payment = state.payouts[id];
    if (!Object.hasOwn(state.payouts, id) || !isObject(payment) ||
        !["pending", "processing", "failed", "paid"].includes(payment.status) ||
        (payment.id !== undefined && payment.id !== `pay_${id}`) ||
        (payment.amount !== undefined && (!Number.isSafeInteger(payment.amount) || payment.amount <= 0)) ||
        (payment.status === "pending" && ["attempt", "submittedAt", "candidateTx", "tx", "paidAt"]
          .some((key) => Object.hasOwn(payment, key))) ||
        (payment.status === "paid" && !isHash(payment.tx))) {
      throw historyUnavailable();
    }
    if (payment.tx !== undefined) {
      if (!isHash(payment.tx) || receipts.has(payment.tx.toLowerCase())) throw historyUnavailable();
      receipts.add(payment.tx.toLowerCase());
    }
  }
  for (const [key, value] of Object.entries(emptyProject())) {
    if (!state.mode && !Object.hasOwn(state, key)) continue;
    if (Array.isArray(value) ? !Array.isArray(state[key]) : !isObject(state[key])) throw historyUnavailable();
  }
}

export async function readProjectState() {
  let saved;
  try {
    saved = JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    throw historyUnavailable();
  }
  validateHistory(saved);
  // Older saved projects may omit non-payment fields. Payment records are always required.
  return { ...emptyProject(), ...saved };
}

export function assertPayoutHistory(state, payer) {
  if (state.mode === "preview") throw projectError("This preview project cannot submit payouts", 409);
  if (state.mode === "testnet" && state.payer !== payer) throw projectError("Payment history belongs to a different payout wallet", 409);
  // Existing complete histories remain usable with their original configured wallet.
}

export async function createProjectState(mode, payer, target = file) {
  if (mode !== "preview" && mode !== "testnet") throw new Error("Choose preview or testnet");
  const state = {
    ...emptyProject(), mode, ...(mode === "testnet" ? { payer } : {}), clientConfirmed: false,
    payouts: Object.fromEntries(PROJECT.workers.map(({ id }) => [id, { status: "pending" }])),
  };
  validateHistory(state);
  await fs.writeFile(target, JSON.stringify(state, null, 2) + "\n", { flag: "wx", mode: 0o600 });
}

export function updateProjectState(update) {
  return updateJsonFile(file, readProjectState, update, validateHistory);
}

export function currentProject(state) {
  return {
    ...PROJECT,
    contractorPay: (state.contractorCompensation ?? Math.round(PROJECT.contractorPay * 100)) / 100,
    expenses: [
      { description: "Existing approved project expenses", amount: PROJECT.expenses, approved: true },
      ...state.expenses.map((expense) => ({ ...expense, amount: expense.amount / 100 })),
    ],
    workers: PROJECT.workers.map((worker) => ({
      ...worker,
      allocation: Object.hasOwn(state.allocations, worker.id)
        ? state.allocations[worker.id] / 100 : worker.allocation,
    })),
  };
}
