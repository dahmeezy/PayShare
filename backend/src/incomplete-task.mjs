// Incomplete work is never automatically eligible for payout.
// Reports describe an issue; they do not change the worker's agreed allocation.
export function validateIncompleteReport(input, workers) {
  if (!input || typeof input.worker_id !== "string" ||
      !workers.some((worker) => worker.id === input.worker_id)) {
    throw new Error("worker_id must identify a project worker");
  }
  if (typeof input.reason !== "string" || !input.reason.trim()) {
    throw new Error("reason is required");
  }
  return {
    worker_id: input.worker_id,
    reason: input.reason.trim(),
    status: "open",
    payout_eligible: false,
  };
}

export function canPayForTask(task) {
  return task?.status === "approved" &&
    ((!task.requires_client && !task.overall_completion) || task.client_confirmed === true) &&
    task.incomplete_report_open !== true;
}
