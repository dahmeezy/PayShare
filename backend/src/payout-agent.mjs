import { randomUUID } from "node:crypto";
import { StrKey } from "@stellar/stellar-sdk";
import { projectError } from "./project-store.mjs";
import { funded, projectBudget } from "./workspace-store.mjs";

export function checkBudget(project) {
  const totals = projectBudget(project);
  if (project.tasks.length && totals.allocated + totals.expenses + totals.contractor_comp > funded(project)) {
    throw projectError("Project funds must cover expenses, compensation and all allocations", 409);
  }
}

// Both modes use the same decision. AI summaries never authorize or submit payouts.
export function payoutTerms(project, task) {
  if (task.status !== "approved") throw projectError("Contractor approval is required", 409);
  if (task.clientApprovalRequired && !task.clientApprovedAt) throw projectError("Client confirmation is required", 409);
  if (task.payout.status !== "pending") throw projectError("A payout already exists for this task", 409);
  if (project.mode === "testnet" && (!StrKey.isValidEd25519PublicKey(task.recipient || "") || task.recipient === project.payer)) {
    throw projectError("Assign the task with a valid worker Stellar wallet", 409);
  }
  checkBudget(project);
  return { amount: task.amount, recipient: task.recipient, payer: project.payer };
}

// The same rules as payoutTerms, reported as plain-language checks for the agent log.
// The agent only reads agreed terms. It cannot change allocations or override an approval.
export function payoutChecks(project, task) {
  const totals = projectBudget(project);
  const covered = totals.allocated + totals.expenses + totals.contractor_comp <= funded(project);
  const wallet = project.mode !== "testnet" || (StrKey.isValidEd25519PublicKey(task.recipient || "") && task.recipient !== project.payer);
  return [
    { key: "accepted", ok: task.acceptedAt !== null, label: "The worker accepted the task and agreed payment" },
    { key: "approved", ok: task.status === "approved", label: "The contractor approved the work" },
    { key: "client", ok: !task.clientApprovalRequired || Boolean(task.clientApprovedAt),
      label: task.clientApprovalRequired ? "The client confirmed the deliverable" : "Client confirmation is not required for this task" },
    { key: "funds", ok: covered, label: "Project funds cover expenses, compensation and every allocation" },
    { key: "wallet", ok: wallet, label: project.mode === "testnet" ? "The worker has a valid payout wallet" : "No wallet is needed in demo mode" },
    { key: "unique", ok: task.payout.status === "pending", label: "This approved work has not been paid before" },
  ];
}

export function agentEntry(project, task, outcome, checks, extra = "") {
  const failed = checks.filter(check => !check.ok);
  const sentence = {
    simulated: `Demo mode: I recorded a simulated payment of ${task.amount / 100} USDC to ${task.workerName} for "${task.title}". No funds moved.`,
    paid: `I paid ${task.workerName} ${task.amount / 100} USDC for "${task.title}" on Stellar testnet.`,
    blocked: `I did not pay ${task.workerName} for "${task.title}": ${failed.map(check => check.label.toLowerCase()).join("; ") || "a check failed"}.`,
    failed: `Settlement for ${task.workerName}'s "${task.title}" could not be confirmed, so the payment is locked to prevent a double payment.`,
  }[outcome];
  return { id: randomUUID(), at: new Date().toISOString(), taskId: task.id, workerId: task.workerId, outcome, message: sentence + extra, checks };
}
