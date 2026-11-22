import { toCents } from "./budget.mjs";
import { confirmTask } from "./client-confirm.mjs";
import { requireRole } from "./project-auth.mjs";
import { currentProject, projectError, readProjectState, updateProjectState } from "./project-store.mjs";

export function projectTask(state, id, auth) {
  const worker = currentProject(state).workers.find((entry) => entry.id === id);
  if (!worker || (auth?.role === "worker" && auth.workerId !== id)) {
    throw projectError("Task not found", 404);
  }
  return { worker, task: state.tasks[id] };
}

function record(task, action, detail = {}) {
  task.history.push({ action, ...detail, at: new Date().toISOString() });
}

export function addTaskApprovalRoutes(router, endpoint) {
  router.get("/projects/:id/deliverables", endpoint(async (req, res) => {
    const state = await readProjectState();
    const workers = currentProject(state).workers;
    res.json(workers.filter(({ id }) => req.auth.role !== "worker" || req.auth.workerId === id).map((worker) => ({
      id: worker.id, title: worker.task, worker: worker.name, amount: toCents(worker.allocation),
      ...state.tasks[worker.id],
    })));
  }));

  // Local project workflow for the H1 handoff. Real task sessions can mount this router after authentication.
  router.post("/tasks/:task/terms", endpoint(async (req, res) => {
    requireRole(req, "contractor");
    const { requires_client: requiresClient, overall_completion: overallCompletion = false, criteria } = req.body ?? {};
    if (typeof requiresClient !== "boolean" || typeof overallCompletion !== "boolean" ||
        typeof criteria !== "string" || !criteria.trim()) throw projectError("Provide acceptance criteria and review rules");
    const task = await updateProjectState((state) => {
      const { worker, task } = projectTask(state, req.params.task, req.auth);
      if (task || state.payouts[worker.id].status !== "pending") throw projectError("Terms already exist for this task", 409);
      const entry = {
        status: "assigned", terms_amount: toCents(worker.allocation), criteria: criteria.trim(),
        requires_client: requiresClient, overall_completion: overallCompletion, client_confirmed: false, history: [],
      };
      if (!entry.terms_amount) throw projectError("Set a worker allocation before assigning terms");
      record(entry, "terms_set");
      state.tasks[worker.id] = entry;
      return entry;
    });
    res.status(201).json(task);
  }));

  router.post("/tasks/:task/accept", endpoint(async (req, res) => {
    requireRole(req, "worker");
    const result = await updateProjectState((state) => {
      const { worker, task } = projectTask(state, req.params.task, req.auth);
      if (task?.status !== "assigned" || req.body?.amount !== task.terms_amount ||
          task.terms_amount !== toCents(worker.allocation)) throw projectError("Review and accept the current terms", 409);
      task.status = "accepted";
      record(task, "worker_accepted");
      return task;
    });
    res.json(result);
  }));

  router.post("/tasks/:task/contractor-approve", endpoint(async (req, res) => {
    requireRole(req, "contractor");
    const evidence = req.body?.evidence;
    if (typeof evidence !== "string" || !evidence.trim()) throw projectError("Provide a submission reference or review note");
    const result = await updateProjectState((state) => {
      const { worker, task } = projectTask(state, req.params.task, req.auth);
      if (task?.status !== "accepted" || task.incomplete_report_open ||
          task.terms_amount !== toCents(worker.allocation)) throw projectError("Task is not ready for approval", 409);
      task.status = "approved";
      record(task, "contractor_approved", { evidence: evidence.trim() });
      return task;
    });
    res.json(result);
  }));

  router.post("/tasks/:task/client-confirm", endpoint(async (req, res) => {
    requireRole(req, "client");
    if (req.body?.confirmed !== true) throw projectError("Explicit confirmation is required");
    const result = await updateProjectState((state) => {
      const { task } = projectTask(state, req.params.task, req.auth);
      if (task?.incomplete_report_open) throw projectError("Resolve the incomplete task before approval", 409);
      try { return confirmTask(task, req.auth.role, req.body.confirmed); }
      catch (error) { throw projectError(error.message, 409); }
    });
    res.json(result);
  }));
}
