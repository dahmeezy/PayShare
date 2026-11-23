import { randomUUID } from "node:crypto";
import { toCents } from "./budget.mjs";
import { validateIncompleteReport } from "./incomplete-task.mjs";
import { requireRole } from "./project-auth.mjs";
import { currentProject, projectError, readProjectState, updateProjectState } from "./project-store.mjs";
import { projectTask } from "./task-approvals.mjs";

function notify(state, report, action) {
  state.notifications.push({
    id: randomUUID(), task: report.task_id, worker_id: report.worker_id,
    action, at: new Date().toISOString(),
  });
}

export function addIncompleteTaskRoutes(router, endpoint) {
  router.get("/projects/:id/incomplete-reports", endpoint(async (req, res) => {
    const { reports } = await readProjectState();
    res.json(reports.filter((report) => req.auth.role !== "worker" || report.worker_id === req.auth.workerId));
  }));

  router.get("/projects/:id/incomplete-notifications", endpoint(async (req, res) => {
    const { notifications } = await readProjectState();
    res.json(notifications.filter((entry) => req.auth.role !== "worker" || entry.worker_id === req.auth.workerId));
  }));

  router.post("/tasks/:task/incomplete-reports", endpoint(async (req, res) => {
    requireRole(req, "worker");
    const result = await updateProjectState((state) => {
      const { worker, task } = projectTask(state, req.params.task, req.auth);
      if (!task || !["accepted", "approved"].includes(task.status) || task.incomplete_report_open ||
          state.payouts[worker.id].status !== "pending") throw projectError("Task cannot be reported at this stage", 409);
      let report;
      try { report = validateIncompleteReport({ ...req.body, worker_id: worker.id }, [worker]); }
      catch (error) { throw projectError(error.message); }
      const entry = { ...report, id: randomUUID(), task_id: req.params.task, created_at: new Date().toISOString(), history: [] };
      task.incomplete_report_open = true;
      state.reports.push(entry);
      notify(state, entry, "incomplete_reported");
      return entry;
    });
    res.status(201).json(result);
  }));

  router.post("/incomplete-reports/:report/resolve", endpoint(async (req, res) => {
    requireRole(req, "contractor");
    const { action, date, worker_id: newWorker, amount, reason } = req.body ?? {};
    if (typeof reason !== "string" || !reason.trim()) throw projectError("Record the reason for this resolution");
    const result = await updateProjectState((state) => {
      const report = state.reports.find(({ id }) => id === req.params.report);
      if (!report || report.status !== "open") throw projectError("Open report not found", 404);
      const { worker, task } = projectTask(state, report.task_id, req.auth);
      const resolution = { action, reason: reason.trim(), at: new Date().toISOString() };
      if (action === "extend") {
        if (typeof date !== "string" || !Number.isFinite(Date.parse(date)) || Date.parse(date) <= Date.now()) {
          throw projectError("Set a future due date");
        }
        task.deadline = new Date(date).toISOString();
        resolution.deadline = task.deadline;
        task.status = "accepted";
        delete task.partial_amount;
      } else if (action === "reassign") {
        if (!task.transferable || newWorker === worker.id || !currentProject(state).workers.some(({ id }) => id === newWorker)) {
          throw projectError("Only transferable work can be reassigned to another project worker");
        }
        resolution.worker_id = newWorker;
      } else if (action === "partial_payment") {
        if (!Number.isSafeInteger(amount) || amount <= 0 || amount >= toCents(worker.allocation)) {
          throw projectError("Partial pay must be positive and below the agreed allocation");
        }
        resolution.amount = amount;
      } else if (action !== "cancel") {
        throw projectError("Choose extension, reassignment, cancellation or agreed partial pay");
      }
      const requiresWorker = ["partial_payment", "cancel", "reassign"].includes(action);
      report.resolution = resolution;
      report.history.push(resolution);
      report.status = requiresWorker ? "awaiting_worker" : "resolved";
      if (!requiresWorker) {
        task.client_confirmed = false;
        task.incomplete_report_open = false;
      }
      notify(state, report, report.status === "resolved" ? "incomplete_resolved" : "resolution_proposed");
      return report;
    });
    res.json(result);
  }));

  router.post("/incomplete-reports/:report/respond", endpoint(async (req, res) => {
    requireRole(req, "worker");
    const accepted = req.body?.accepted;
    if (typeof accepted !== "boolean") throw projectError("Choose accept or decline");
    const result = await updateProjectState((state) => {
      const report = state.reports.find(({ id, worker_id }) => id === req.params.report && worker_id === req.auth.workerId);
      if (!report || report.status !== "awaiting_worker") throw projectError("Pending resolution not found", 404);
      const { worker, task } = projectTask(state, report.task_id, req.auth);
      const resolution = report.resolution;
      if (accepted && resolution.action === "partial_payment" && resolution.amount >= toCents(worker.allocation)) {
        throw projectError("The allocation changed. Decline this offer and request a new resolution.", 409);
      }
      report.history.push({ action: accepted ? "worker_accepted" : "worker_declined", at: new Date().toISOString() });
      report.status = accepted ? "resolved" : "open";
      if (accepted) {
        task.client_confirmed = false;
        task.incomplete_report_open = false;
        if (resolution.action === "partial_payment") {
          task.partial_amount = resolution.amount;
          task.status = "accepted";
        } else if (resolution.action === "reassign") {
          task.reassigned_to = resolution.worker_id;
          task.status = "reassigned";
          notify(state, { ...report, worker_id: resolution.worker_id }, "transfer_assigned");
        } else {
          task.status = "cancelled";
        }
      }
      notify(state, report, accepted ? "incomplete_resolved" : "resolution_declined");
      return report;
    });
    res.json(result);
  }));
}
