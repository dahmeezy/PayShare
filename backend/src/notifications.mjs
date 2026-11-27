// The in-app feed is derived from the workspace record, so it can never disagree with it.
// Each person only sees events their role is already allowed to see.
const usdc = cents => `${(cents / 100).toLocaleString("en")} USDC`;

export function notificationsFor(state, userId) {
  const items = [];
  for (const project of state.projects) {
    const role = project.members.find(member => member.id === userId)?.role;
    if (!role) continue;
    const add = (kind, at, title, detail, task) => {
      if (at) items.push({ id: `${kind}:${task?.id || project.id}:${at}`, kind, at, title, detail, projectId: project.id, taskId: task?.id ?? null });
    };
    if (role !== "worker") {
      for (const entry of project.funding) {
        add("funding", entry.confirmed_at, entry.transaction ? "Funding verified" : "Simulated funding recorded", `${usdc(entry.amount)} · ${project.name}`);
      }
    }
    for (const task of project.tasks) {
      if (role === "worker" && task.workerId !== userId) continue;
      const about = `${task.title} · ${usdc(task.amount)}`;
      const needsClient = task.clientApprovalRequired && !task.clientApprovedAt;
      if (role === "worker") {
        add("assigned", task.createdAt, "New task assigned to you", about, task);
        if (task.review?.reviewedAt) {
          add("review", task.review.reviewedAt, task.status === "rejected" ? "Changes requested" : "Your work was approved", about, task);
        }
      }
      if (role === "contractor") {
        add("accepted", task.acceptedAt, `${task.workerName} accepted a task`, about, task);
        add("declined", task.declinedAt, `${task.workerName} declined a task`, about, task);
        if (task.submission) add("submitted", task.submission.submittedAt, `${task.workerName} submitted work`, about, task);
        add("confirmed", task.clientApprovedAt, "Client confirmed a deliverable", about, task);
      }
      if (role === "client" && task.status === "approved" && needsClient) {
        add("confirm", task.review?.reviewedAt, "A deliverable needs your confirmation", about, task);
      }
      const { status, paidAt } = task.payout;
      if (["paid", "simulated"].includes(status)) {
        add("payout", paidAt, status === "paid" ? "Payment verified on Stellar" : "Simulated payout recorded · No funds moved", about, task);
      }
    }
  }
  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 50);
}
