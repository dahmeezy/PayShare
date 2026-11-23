import { addIncompleteTaskRoutes } from "./incomplete-task-api.mjs";
import { addAllocationChangeRoutes } from "./allocation-change-api.mjs";
import { addTaskApprovalRoutes } from "./task-approvals.mjs";
import { addFundingRoutes } from "./funding-api.mjs";
// Worker privacy is applied to responses on the server.
import express from "express";
import { randomUUID } from "node:crypto";
import { budgetBreakdown, toCents } from "./budget.mjs";
import { authenticateProject, requireRole } from "./project-auth.mjs";
import { currentProject, projectError, readProjectState, updateProjectState } from "./project-store.mjs";

export const moneyRouter = express.Router();
moneyRouter.use(express.json({ limit: "16kb" }));
moneyRouter.use(authenticateProject);
moneyRouter.param("id", (req, res, next, id) =>
  id === req.auth.projectId ? next() : res.status(404).json({ error: "Project not found" }));

export const endpoint = (fn) => (req, res, next) => Promise.resolve().then(() => fn(req, res)).catch(next);
const isWorker = (req) => req.auth.role === "worker";
const own = (req, worker) => !isWorker(req) || worker.id === req.auth.workerId;
export const validCents = (amount) => Number.isSafeInteger(amount) && amount >= 0;

moneyRouter.get("/projects/:id/money-summary", endpoint(async (req, res) => {
  const state = await readProjectState();
  const budget = budgetBreakdown(currentProject(state), state.payouts);
  const funded = state.funding.filter((record) => record.status === "confirmed")
    .reduce((sum, record) => sum + record.amount, 0);
  if (isWorker(req)) {
    for (const key of ["contractor_comp", "allocated", "paid", "pending", "unallocated", "remaining"]) delete budget[key];
  } else {
    budget.remaining = Math.max(0, funded - budget.expenses - budget.contractor_comp - budget.allocated);
  }
  res.json({ ...budget, funded });
}));

moneyRouter.get("/projects/:id/expenses", endpoint(async (req, res) => {
  const project = currentProject(await readProjectState());
  res.json(isWorker(req) ? { total: budgetBreakdown(project).expenses } : project.expenses.map((e) => ({
    ...e, amount: toCents(e.amount),
  })));
}));

moneyRouter.post("/expenses", endpoint(async (req, res) => {
  requireRole(req, "contractor");
  const { amount, description, approved } = req.body ?? {};
  if (!validCents(amount) || amount === 0 || typeof description !== "string" || !description.trim() ||
      typeof approved !== "boolean") throw projectError("Provide expense cents, a description and approval status");
  const entry = { id: randomUUID(), amount, description: description.trim(), approved };
  await updateProjectState((state) => {
    state.expenses.push(entry);
    budgetBreakdown(currentProject(state));
  });
  res.status(201).json(entry);
}));

moneyRouter.get("/projects/:id/contractor-compensation", endpoint(async (req, res) => {
  res.json(isWorker(req) ? null : { amount: toCents(currentProject(await readProjectState()).contractorPay), paid: false });
}));

moneyRouter.put("/projects/:id/contractor-compensation", endpoint(async (req, res) => {
  requireRole(req, "contractor");
  const amount = req.body?.amount;
  if (!validCents(amount)) throw projectError("Provide compensation in cents");
  await updateProjectState((state) => {
    state.contractorCompensation = amount;
    budgetBreakdown(currentProject(state));
  });
  res.json({ amount, paid: false });
}));

moneyRouter.get("/projects/:id/allocations", endpoint(async (req, res) => {
  const state = await readProjectState();
  res.json(currentProject(state).workers.filter((worker) => own(req, worker)).map((worker) => ({
    allocation_id: `alloc_${worker.id}`, worker_id: worker.id, worker_name: worker.name, task: worker.task,
    amount: toCents(worker.allocation), status: state.payouts[worker.id].status,
  })));
}));

moneyRouter.post("/allocations", endpoint(async (req, res) => {
  requireRole(req, "contractor");
  const { worker_id: workerId, amount } = req.body ?? {};
  if (!validCents(amount) || amount === 0) throw projectError("Allocation must be positive cents");
  const entry = await updateProjectState((state) => {
    const worker = currentProject(state).workers.find(({ id }) => id === workerId);
    if (!worker) throw projectError("Worker not found", 404);
    if (worker.allocation || state.tasks[workerId] || state.payouts[workerId].status !== "pending") {
      throw projectError("Use an allocation change proposal for an existing agreement", 409);
    }
    state.allocations[workerId] = amount;
    budgetBreakdown(currentProject(state));
    return { allocation_id: `alloc_${workerId}`, worker_id: workerId, amount };
  });
  res.status(201).json(entry);
}));

const paymentList = endpoint(async (req, res) => {
  const state = await readProjectState();
  const all = currentProject(state).workers;
  res.json({
    payments: all.filter((worker) => own(req, worker)).map((worker) => {
      const p = state.payouts[worker.id];
      return {
        payment_id: `pay_${worker.id}`, worker_id: worker.id, worker_name: worker.name,
        amount: p.amount ?? toCents(worker.allocation), status: p.status,
        transaction: p.tx ?? null,
        explorer_url: p.tx && /^[a-f0-9]{64}$/i.test(p.tx) ? `https://stellar.expert/explorer/testnet/tx/${p.tx}` : null,
        paid_at: p.paidAt ?? null,
      };
    }).filter((payment) => (!req.query.worker_id || payment.worker_id === req.query.worker_id) &&
      (!req.query.status || payment.status === req.query.status) &&
      (!req.query.task_id || req.query.task_id === payment.worker_id)),
    progress: { paid: all.filter((worker) => state.payouts[worker.id].status === "paid").length, total: all.length },
  });
});
moneyRouter.get("/projects/:id/payments", paymentList);
moneyRouter.get("/payments", paymentList);
addFundingRoutes(moneyRouter, endpoint);
addTaskApprovalRoutes(moneyRouter, endpoint);
addAllocationChangeRoutes(moneyRouter, endpoint);
addIncompleteTaskRoutes(moneyRouter, endpoint);

export function moneyErrors(error, req, res, next) {
  if (res.headersSent) return next(error);
  const status = error.status || 503;
  res.status(status).json({ error: status < 500 || error.code === "PAYMENT_HISTORY_UNAVAILABLE" ? error.message : "Project data is temporarily unavailable" });
}
