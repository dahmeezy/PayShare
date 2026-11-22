// PayShare money API (read side): the endpoints the frontend needs first.
// Implements, from docs/API_CONTRACT.md: H2 money-summary, allocations, payments.
// Amounts are in cents, as the contract says. The privacy rules are enforced HERE, not in the screens.
import fs from "node:fs/promises";
import { Router } from "express";
import { explorer } from "./config.mjs";
import { PROJECT } from "./project.mjs";
import { validateFundingRequest, readFundingRequests, saveFundingRequest } from "./funding.mjs";

const PROJECT_ID = "proj_demo"; // TODO: real project ids once the projects feature exists
const STATE_FILE = "payshare-state.json"; // written by the payout agent (run both from the backend folder)
const cents = (usd) => Math.round(usd * 100);

async function readPayouts() {
  try { return JSON.parse(await fs.readFile(STATE_FILE, "utf8")).payouts ?? {}; }
  catch { return {}; }
}

export const moneyRouter = Router();

// Local-dev CORS so the frontend (another port) can call us. Remove or tighten before any real deployment.
moneyRouter.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "content-type, x-demo-role, x-demo-worker");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Stand-in for login until feature/auth exists. The caller says who they are via headers:
//   x-demo-role: contractor | client | worker      x-demo-worker: amara | bisi | chidi (workers only)
// The permission rules below don't change when real auth replaces this.
moneyRouter.use((req, res, next) => {
  const role = req.get("x-demo-role");
  if (!["contractor", "client", "worker"].includes(role)) {
    return res.status(401).json({ error: "unauthenticated: send header x-demo-role (contractor, client or worker)" });
  }
  const workerId = req.get("x-demo-worker");
  if (role === "worker" && !PROJECT.workers.some((w) => w.id === workerId)) {
    return res.status(401).json({ error: "workers must also send header x-demo-worker (amara, bisi or chidi)" });
  }
  req.auth = { role, workerId };
  next();
});

moneyRouter.param("id", (req, res, next, id) => {
  if (id !== PROJECT_ID) return res.status(404).json({ error: "project not found" });
  next();
});

// Workers see only their own line; contractor and client see everyone's.
const visibleWorkers = (auth) =>
  auth.role === "worker" ? PROJECT.workers.filter((w) => w.id === auth.workerId) : PROJECT.workers;

// H2: GET /projects/{id}/money-summary
moneyRouter.get("/projects/:id/money-summary", async (req, res) => {
  const payouts = await readPayouts();
  const totalBudget = cents(PROJECT.budget);
  const expenses = cents(PROJECT.expenses);
  const contractorComp = cents(PROJECT.contractorPay);
  const workerPool = totalBudget - expenses - contractorComp;
  const funded = 0; // Funding requests are not verified payments
  const allocated = PROJECT.workers.reduce((sum, w) => sum + cents(w.allocation), 0);
  const paid = PROJECT.workers.filter((w) => payouts[w.id]?.status === "paid").reduce((sum, w) => sum + cents(w.allocation), 0);
  const pending = allocated - paid;
  const isWorker = req.auth.role === "worker";
  res.json({
    total_budget: totalBudget,
    funded,
    expenses,
    contractor_comp: isWorker ? null : contractorComp, // never shown to workers
    worker_pool: workerPool,
    paid,
    pending,
    remaining: isWorker ? null : Math.max(0, funded - paid - pending), // not listed for workers in the MVP (Privacy Matrix)
  });
});

// GET /projects/{id}/allocations
moneyRouter.get("/projects/:id/allocations", async (req, res) => {
  const payouts = await readPayouts();
  res.json(visibleWorkers(req.auth).map((w) => ({
    allocation_id: `alloc_${w.id}`,
    worker_id: w.id,
    worker_name: w.name,
    task: w.task,
    amount: cents(w.allocation),
    status: payouts[w.id]?.status ?? "pending",
  })));
});

// GET /projects/{id}/payments
moneyRouter.get("/projects/:id/payments", async (req, res) => {
  const payouts = await readPayouts();
  const all = PROJECT.workers.map((w) => {
    const p = payouts[w.id] ?? { status: "pending" };
    return {
      payment_id: `pay_${w.id}`,
      worker_id: w.id,
      worker_name: w.name,
      amount: cents(w.allocation),
      status: p.status,
      transaction: p.tx ?? null,
      explorer_url: p.tx ? explorer.tx(p.tx) : null,
      paid_at: p.paidAt ?? null,
    };
  });
  const mine = req.auth.role === "worker" ? all.filter((p) => p.worker_id === req.auth.workerId) : all;
  res.json({
    payments: mine,
    // Workers get their own payments plus overall progress only (Privacy Matrix)
    progress: { paid: all.filter((p) => p.status === "paid").length, total: all.length },
  });
});
moneyRouter.post("/funding", async (req, res) => {
  if (process.env.ENABLE_DEMO_FUNDING !== "true" || process.env.NODE_ENV === "production") {
    return res.status(403).json({ error: "Demo funding requests are disabled" });
  }
  if (req.auth.role !== "client") return res.status(403).json({ error: "client only" });
  let request;
  try { request = validateFundingRequest(req.body); }
  catch (error) { return res.status(400).json({ error: error.message }); }
  try { res.status(201).json(await saveFundingRequest(request)); }
  catch { res.status(500).json({ error: "could not save funding request" }); }
});

moneyRouter.get("/projects/:id/funding", async (req, res) => {
  try {
    const requests = await readFundingRequests();
    res.json({
      verified_amount: 0,
      requests: req.auth.role === "worker"
        ? requests.map((r) => ({ amount: r.amount, status: r.status }))
        : requests,
    });
  } catch { res.status(500).json({ error: "could not read funding requests" }); }
});
