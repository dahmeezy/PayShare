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
