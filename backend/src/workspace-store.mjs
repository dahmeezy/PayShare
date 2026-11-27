import fs from "node:fs/promises";
import path from "node:path";
import { StrKey } from "@stellar/stellar-sdk";
import { budgetBreakdown } from "./budget.mjs";
import { updateJsonFile } from "./json-file.mjs";
import { projectError } from "./project-store.mjs";

const file = path.resolve(process.env.PAYSHARE_WORKSPACE_FILE || "payshare-workspace.json");
const hash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const money = value => Number.isSafeInteger(value) && value > 0 && value <= 1_000_000_000;
const unavailable = () => projectError("Workspace history is missing or damaged. Restore it before continuing.", 503);

export const funded = project => project.funding.reduce((sum, entry) => sum + entry.amount, 0);
export function reservedFunding(project) {
  const attempt = project.walletFunding;
  return attempt?.status === "pending" || (attempt?.status === "prepared" && attempt.expiresAt > Date.now())
    ? attempt.amount : 0;
}
export function projectBudget(project) {
  const { tasks } = project;
  return budgetBreakdown({
    budget: project.budget / 100,
    contractorPay: project.compensation / 100,
    expenses: project.expenses.map(expense => ({ ...expense, amount: expense.amount / 100 })),
    workers: tasks.map(task => ({ id: task.id, allocation: task.amount / 100 })),
  }, Object.fromEntries(tasks.map(task => [task.id, task.payout])));
}

function validate(state) {
  if (state?.version !== 1 || !Array.isArray(state.projects)) throw unavailable();
  const hashes = new Set();
  const ids = new Set();
  for (const project of state.projects) {
    const { mode, tasks, funding } = project;
    if (ids.has(project.id) || !["preview", "testnet"].includes(mode) || !money(project.budget) ||
        !Number.isSafeInteger(project.compensation) || project.compensation < 0 ||
        !Array.isArray(tasks) || !Array.isArray(funding) || !Array.isArray(project.expenses) ||
        !Array.isArray(project.members) || !Array.isArray(project.invitations) ||
        (mode === "testnet" && !StrKey.isValidEd25519PublicKey(project.payer || ""))) throw unavailable();
    ids.add(project.id);
    for (const entry of funding) {
      if (!money(entry.amount) || (mode === "testnet" ? !hash(entry.transaction) : entry.transaction !== null) ||
          (entry.transaction && hashes.has(entry.transaction))) throw unavailable();
      if (entry.transaction) hashes.add(entry.transaction);
    }
    if (project.walletFunding !== undefined) {
      const attempt = project.walletFunding;
      if (mode !== "testnet" || !attempt || !hash(attempt.hash) || !money(attempt.amount) ||
          typeof attempt.source !== "string" || !StrKey.isValidEd25519PublicKey(attempt.source) || attempt.source === project.payer ||
          !Number.isSafeInteger(attempt.expiresAt) || attempt.expiresAt <= 0 ||
          !["prepared", "pending", "confirmed", "failed"].includes(attempt.status) ||
          (attempt.status === "confirmed" && !funding.some(entry => entry.transaction === attempt.hash && entry.amount === attempt.amount))) {
        throw unavailable();
      }
    }
    for (const task of tasks) {
      const payout = task.payout;
      if (ids.has(task.id) || !money(task.amount) || !["assigned", "submitted", "approved", "rejected", "declined", "cancelled"].includes(task.status) ||
          typeof task.clientApprovalRequired !== "boolean" ||
          (task.clientApprovedAt && (!task.clientApprovalRequired || task.status !== "approved")) ||
          !payout || !["pending", "simulated", "processing", "failed", "paid"].includes(payout.status) ||
          (payout.status === "pending" && Object.keys(payout).length !== 1) ||
          (mode === "preview" && !["pending", "simulated"].includes(payout.status)) ||
          (mode === "testnet" && payout.status === "simulated") ||
          (payout.status !== "pending" && (task.status !== "approved" || payout.amount !== task.amount || (task.clientApprovalRequired && !task.clientApprovedAt))) ||
          (["processing", "failed", "paid"].includes(payout.status) &&
            (!payout.attempt || payout.payer !== project.payer || payout.recipient !== task.recipient || !payout.startedAt)) ||
          (payout.status === "paid" && !hash(payout.tx)) ||
          (payout.candidateTx !== undefined && (!hash(payout.candidateTx) || hashes.has(payout.candidateTx))) ||
          (payout.tx !== undefined && (payout.status !== "paid" || payout.tx !== payout.candidateTx))) throw unavailable();
      ids.add(task.id);
      if (payout.candidateTx) hashes.add(payout.candidateTx);
    }
    try {
      const totals = projectBudget(project);
      if (funded(project) + reservedFunding(project) > project.budget ||
          (tasks.length > 0 && totals.allocated + totals.expenses + totals.contractor_comp > funded(project))) {
        throw unavailable();
      }
    } catch { throw unavailable(); }
  }
}

export async function readWorkspace() {
  let state;
  try {
    state = JSON.parse(await fs.readFile(file, "utf8"));
    validate(state);
  } catch { throw unavailable(); }
  return state;
}

export function updateWorkspace(update) {
  return updateJsonFile(file, readWorkspace, update, validate);
}

export async function initializeWorkspace() {
  await fs.writeFile(file, JSON.stringify({ version: 1, projects: [] }) + "\n", { flag: "wx", mode: 0o600 });
}
