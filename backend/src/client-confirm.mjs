// The client approves completed work only when client review applies.

export function canConfirm(role, confirmed) {
  if (role !== "client") throw new Error("Only the client can confirm work");
  if (confirmed !== true) throw new Error("confirmed must be true");
}

export function confirmTask(task, role, confirmed) {
  canConfirm(role, confirmed);
  if (!task || task.status !== "approved" || (!task.requires_client && !task.overall_completion)) {
    throw new Error("Only approved deliverables designated for client review can be confirmed");
  }
  if (task.client_confirmed) return task;
  task.client_confirmed = true;
  task.history.push({ action: "client_confirmed", at: new Date().toISOString() });
  return task;
}
