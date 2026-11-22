// Allocation changes are proposals, not automatic changes to a worker's pay.
export function proposeAllocationChange(input, workers) {
  if (!input || typeof input.allocation_id !== "string") throw new Error("allocation_id is required");
  const workerId = input.allocation_id.replace(/^alloc_/, "");
  const worker = workers.find((w) => w.id === workerId);
  if (!worker || input.allocation_id !== `alloc_${workerId}`) throw new Error("allocation not found");
  if (!Number.isSafeInteger(input.proposed_amount) || input.proposed_amount < 0) {
    throw new Error("proposed_amount must be a non-negative integer in cents");
  }
  if (typeof input.reason !== "string" || !input.reason.trim()) throw new Error("reason is required");
  return {
    allocation_id: input.allocation_id,
    worker_id: workerId,
    current_amount: Math.round(worker.allocation * 100),
    proposed_amount: input.proposed_amount,
    reason: input.reason.trim(),
    worker_accepted: false,
    client_approved: false,
    status: "pending",
  };
}

export function canApplyAllocationChange(change) {
  return change.worker_accepted === true && change.client_approved === true && change.status === "pending";
}
