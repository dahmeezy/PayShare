import { randomUUID } from "node:crypto";
import { canApplyAllocationChange, proposeAllocationChange } from "./allocation-change.mjs";
import { budgetBreakdown, toCents } from "./budget.mjs";
import { requireRole } from "./project-auth.mjs";
import { currentProject, projectError, readProjectState, updateProjectState } from "./project-store.mjs";

function canSee(req, entry) {
  return req.auth.role === "contractor" ||
    (req.auth.role === "client" && (entry.requires_client || entry.proposed_by === "client")) ||
    (req.auth.role === "worker" && entry.worker_id === req.auth.workerId);
}

function record(entry, role, action) {
  entry.history.push({ role, action, amount: entry.proposed_amount, at: new Date().toISOString() });
}

export function addAllocationChangeRoutes(router, endpoint) {
  router.get("/projects/:id/allocation-changes", endpoint(async (req, res) => {
    res.json((await readProjectState()).changes.filter((entry) => canSee(req, entry)));
  }));

  router.get("/allocation-changes/:change", endpoint(async (req, res) => {
    const entry = (await readProjectState()).changes.find(({ id }) => id === req.params.change);
    if (!entry || !canSee(req, entry)) throw projectError("Allocation change not found", 404);
    res.json(entry);
  }));

  router.post("/allocation-changes", endpoint(async (req, res) => {
    requireRole(req, "contractor", "client");
    const entry = await updateProjectState((state) => {
      let proposal;
      try { proposal = proposeAllocationChange(req.body, currentProject(state).workers); }
      catch (error) { throw projectError(error.message); }
      const workerId = proposal.worker_id;
      if (proposal.proposed_amount === proposal.current_amount) throw projectError("Choose a different amount");
      if (state.tasks[workerId]?.incomplete_report_open || state.payouts[workerId].status !== "pending" ||
          state.changes.some((change) => change.worker_id === workerId && change.status === "pending")) {
        throw projectError("A payout or another proposal is already active", 409);
      }
      const entry = { id: randomUUID(), ...proposal, proposed_by: req.auth.role, awaiting: "worker", history: [] };
      record(entry, req.auth.role, "proposed");
      state.changes.push(entry);
      return entry;
    });
    res.status(201).json(entry);
  }));

  router.post("/allocation-changes/:change/respond", endpoint(async (req, res) => {
    const { action, amount } = req.body ?? {};
    const entry = await updateProjectState((state) => {
      const entry = state.changes.find(({ id }) => id === req.params.change);
      const role = req.auth.role;
      if (!entry || !canSee(req, entry)) throw projectError("Allocation change not found", 404);
      if (entry.status !== "pending" || entry.awaiting !== role) throw projectError("This proposal is waiting on another decision", 409);
      if (action === "reject") {
        entry.status = "rejected";
      } else if (role === "worker" && action === "counter") {
        if (!Number.isSafeInteger(amount) || amount < 0 || amount === entry.current_amount ||
            amount === entry.proposed_amount) throw projectError("Provide a different amount in cents");
        entry.proposed_amount = amount;
        entry.worker_accepted = true;
        entry.requires_client = amount > entry.current_amount;
        entry.awaiting = "contractor";
      } else if (action === "accept") {
        if (role === "worker") entry.worker_accepted = true;
        if (role === "client") entry.client_approved = true;
        if (canApplyAllocationChange(entry)) {
          const worker = currentProject(state).workers.find(({ id }) => id === entry.worker_id);
          if (state.payouts[worker.id].status !== "pending" || toCents(worker.allocation) !== entry.current_amount || state.tasks[worker.id]?.incomplete_report_open ||
              ["cancelled", "reassigned"].includes(state.tasks[worker.id]?.status)) {
            throw projectError("The original allocation can no longer be changed", 409);
          }
          state.allocations[worker.id] = entry.proposed_amount;
          try { budgetBreakdown(currentProject(state)); }
          catch (error) { throw projectError(error.message, 409); }
          const task = state.tasks[worker.id];
          if (task) {
            task.terms_amount = entry.proposed_amount;
            if (task.status === "approved") task.status = "accepted";
            task.client_confirmed = false;
            delete task.partial_amount;
            task.history.push({ action: "allocation_changed", amount: entry.proposed_amount, at: new Date().toISOString() });
          }
          entry.status = "applied";
        } else {
          entry.awaiting = "client";
        }
      } else {
        throw projectError("Choose accept, reject or an allowed counteroffer");
      }
      record(entry, role, action);
      return entry;
    });
    res.json(entry);
  }));
}
