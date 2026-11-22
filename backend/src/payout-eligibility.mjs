import { randomUUID } from "node:crypto";
import { StrKey } from "@stellar/stellar-sdk";
import { budgetBreakdown, toCents } from "./budget.mjs";
import { canPayForTask } from "./incomplete-task.mjs";
import { currentProject, projectError, updateProjectState } from "./project-store.mjs";

const cents = (worker, payment) => payment.amount ?? toCents(worker.allocation);
const reservedStatuses = ["paid", "processing", "failed"];

export function payoutEligibility(state, id, payer, walletBalance) {
  const project = currentProject(state);
  const worker = project.workers.find((entry) => entry.id === id);
  if (!worker) throw projectError("Task not found", 404);
  const payment = state.payouts[id];
  const task = state.tasks[id];
  const allocation = toCents(worker.allocation);
  const amount = task?.partial_amount ?? allocation;
  const reasons = [];
  if (payment?.status !== "pending") reasons.push("Payout already attempted. Check its status before retrying.");
  if (!task || task.terms_amount !== allocation || !task.history?.some((event) => event.action === "worker_accepted")) {
    reasons.push("The worker must accept the current agreement.");
  }
  if (!canPayForTask(task)) reasons.push("Complete the work, resolve open reports and record required approvals.");
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > allocation) reasons.push("There is no valid agreed payout.");
  if (!StrKey.isValidEd25519PublicKey(worker.wallet ?? "") || worker.wallet === payer) {
    reasons.push("The worker needs their own valid Stellar wallet.");
  }

  const budget = budgetBreakdown(project);
  const funded = state.funding.filter((entry) => entry.status === "confirmed" && entry.recipient === payer)
    .reduce((sum, entry) => sum + entry.amount, 0);
  const reserved = project.workers.filter((entry) => reservedStatuses.includes(state.payouts[entry.id].status))
    .reduce((sum, entry) => sum + cents(entry, state.payouts[entry.id]), 0);
  const unsettled = project.workers.filter((entry) => ["processing", "failed"].includes(state.payouts[entry.id].status))
    .reduce((sum, entry) => sum + cents(entry, state.payouts[entry.id]), 0);
  if (Math.min(funded - budget.expenses - budget.contractor_comp, budget.worker_pool) - reserved < amount) {
    reasons.push("Verified project funds are insufficient for this payout.");
  }
  if (walletBalance !== undefined && walletBalance < BigInt(unsettled + amount) * 100_000n) {
    reasons.push("The testnet wallet has insufficient available USDC.");
  }
  return { eligible: reasons.length === 0, reasons, amount, recipient: worker.wallet };
}

export function reservePayout(id, payer, walletBalance) {
  return updateProjectState((state) => {
    const result = payoutEligibility(state, id, payer, walletBalance);
    if (!result.eligible) throw projectError(result.reasons.join(" "), 409);
    const payment = {
      id: `pay_${id}`, attempt: randomUUID(), status: "processing", payer,
      amount: result.amount, recipient: result.recipient, startedAt: new Date().toISOString(),
    };
    state.payouts[id] = payment;
    return payment;
  });
}
