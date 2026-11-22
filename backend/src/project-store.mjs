// One local testnet project. All writers use the same lock, including the payout CLI.
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PROJECT } from "./project.mjs";

const file = path.resolve(process.env.PAYSHARE_STATE_FILE || "payshare-state.json");
const initialState = () => ({
  clientConfirmed: false,
  payouts: Object.fromEntries(PROJECT.workers.map((worker) => [worker.id, { status: "pending" }])),
  allocations: {},
  expenses: [],
  funding: [],
  tasks: {},
  changes: [],
  reports: [],
  notifications: [],
});

export function projectError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

export async function readProjectState() {
  try {
    const saved = JSON.parse(await fs.readFile(file, "utf8"));
    if (!saved?.payouts || Array.isArray(saved.payouts) || typeof saved.payouts !== "object" ||
        typeof saved.clientConfirmed !== "boolean") {
      throw new Error("Invalid payment history");
    }
    // In the old demo an absent entry meant unpaid. Never replace an existing entry.
    const initial = initialState();
    return { ...initial, ...saved, payouts: { ...initial.payouts, ...saved.payouts } };
  } catch (error) {
    if (error.code === "ENOENT") return initialState();
    throw error;
  }
}

export async function updateProjectState(update) {
  const lock = file + ".lock";
  try {
    await fs.mkdir(lock, { mode: 0o700 });
  } catch (error) {
    if (error.code === "EEXIST") throw projectError("Project is busy. Try again shortly.", 409);
    throw error;
  }
  const temporary = file + "." + randomUUID() + ".tmp";
  try {
    const state = await readProjectState();
    const result = await update(state);
    const handle = await fs.open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(JSON.stringify(state, null, 2) + "\n");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(temporary, file);
    const directory = await fs.open(path.dirname(file), "r");
    try { await directory.sync(); } finally { await directory.close(); }
    return result;
  } finally {
    await fs.rm(temporary, { force: true });
    await fs.rmdir(lock);
  }
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
