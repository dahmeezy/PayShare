import { createHash, randomBytes, randomUUID } from "node:crypto";
import express from "express";
import { StrKey } from "@stellar/stellar-sdk";
import { validEmail } from "./auth-router.mjs";
import { verifyFundingTransfer, validHash } from "./funding.mjs";
import { endpoint } from "./money-api.mjs";
import { checkBudget, payoutTerms } from "./payout-agent.mjs";
import { projectError } from "./project-store.mjs";
import { requireSession } from "./session.mjs";
import { getUserById } from "./users-store.mjs";
import { funded, projectBudget, readWorkspace, updateWorkspace } from "./workspace-store.mjs";

const tokenHash = token => createHash("sha256").update(token).digest("hex");
const now = () => new Date().toISOString();
const fundingMemo = id => createHash("sha256").update("PayShare:" + id).digest("base64");

function text(value, label, max = 160) {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw projectError(`Enter a valid ${label}`);
  return value.trim();
}
function amount(value, minimum = 1) {
  if (!Number.isSafeInteger(value) || value < minimum || value > 1_000_000_000) {
    throw projectError("Enter a valid USDC amount with up to two decimal places");
  }
  return value;
}

function membership(project, userId) {
  return project.members.find(member => member.id === userId)?.role;
}
function projectFor(state, id, userId, roles) {
  const project = state.projects.find(entry => entry.id === id);
  const role = project && membership(project, userId);
  if (!role) throw projectError("Project not found", 404);
  if (roles && !roles.includes(role)) throw projectError("Your role cannot perform this action", 403);
  return project;
}
function taskFor(project, id) {
  const task = project.tasks.find(entry => entry.id === id);
  if (!task) throw projectError("Task not found", 404);
  return task;
}
function publicProject(project, user) {
  const role = membership(project, user.id);
  const tasks = project.tasks.filter(task => role !== "worker" || task.workerId === user.id).map(task => {
    const { status, tx, paidAt, error, candidateTx } = task.payout;
    return {
      id: task.id, title: task.title, description: task.description, workerId: task.workerId,
      workerName: task.workerName, amount: task.amount, status: task.status, submission: task.submission,
      clientApprovalRequired: task.clientApprovalRequired, clientApprovedAt: task.clientApprovedAt,
      review: task.review, payout: {
        status, paidAt, error, ...(role === "contractor" && { canReconcile: !!candidateTx }),
        ...(status === "paid" && { transaction: tx, explorerUrl: `https://stellar.expert/explorer/testnet/tx/${tx}` }),
      },
    };
  });
  const summary = { id: project.id, name: project.name, mode: project.mode, role, tasks };
  if (role === "worker") return summary;
  return {
    ...summary, budget: project.budget, compensation: project.compensation, expenses: project.expenses,
    payer: project.payer, fundingMemo: project.payer ? fundingMemo(project.id) : null, funded: funded(project), funding: project.funding,
    totals: projectBudget(project), members: project.members,
    invitations: project.invitations.map(({ email, role, status, expiresAt }) => ({ email, role, status, expiresAt })),
  };
}

function findInvitation(state, token) {
  if (typeof token !== "string" || !/^[\w-]{43}$/.test(token)) throw projectError("Invalid invitation", 404);
  const hash = tokenHash(token);
  for (const project of state.projects) {
    const invitation = project.invitations.find(entry => entry.hash === hash);
    if (invitation?.status === "pending" && invitation.expiresAt > Date.now()) return { project, invitation };
  }
  throw projectError("Invitation has expired or has already been used", 404);
}

export function createWorkspaceRouter(settlement, verifyFunding = verifyFundingTransfer, aiStatus = null) {
  const router = express.Router();
  router.use(express.json({ limit: "16kb" }));
  router.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });

  router.post("/invitations/lookup", endpoint(async (req, res) => {
    const { project, invitation } = findInvitation(await readWorkspace(), req.body?.token);
    res.json({ name: project.name, role: invitation.role });
  }));
  router.use(requireSession);

  router.get("/capabilities", (_req, res) => res.json({ aiSummary: Boolean(aiStatus), testnet: Boolean(settlement.payer) }));

  router.get("/projects", endpoint(async (req, res) => {
    const state = await readWorkspace();
    res.json(state.projects.filter(project => membership(project, req.user.id)).map(project => publicProject(project, req.user)));
  }));
  router.post("/projects", endpoint(async (req, res) => {
    if (!["client", "contractor"].includes(req.user.role)) throw projectError("Your role cannot create projects", 403);
    const { name, budget, mode = "preview" } = req.body ?? {};
    if (!["preview", "testnet"].includes(mode)) throw projectError("Choose preview or Stellar testnet");
    if (mode === "testnet" && !settlement.payer) throw projectError("Testnet payouts are disabled or missing configuration", 503);
    const project = {
      id: randomUUID(), name: text(name, "project name"), budget: amount(budget), mode, createdAt: now(),
      payer: mode === "testnet" ? settlement.payer : null, compensation: 0, expenses: [], funding: [],
      members: [{ id: req.user.id, role: req.user.role, name: req.user.name, email: req.user.email }],
      invitations: [], tasks: [],
    };
    await updateWorkspace(state => state.projects.push(project));
    res.status(201).json(publicProject(project, req.user));
  }));

  const projectPath = "/projects/:projectId";
  const mutate = (roles, action) => endpoint(async (req, res) => {
    const result = await updateWorkspace(state => {
      const project = projectFor(state, req.params.projectId, req.user.id, roles);
      return action(project, req, state);
    });
    res.json(result);
  });

  router.put(projectPath + "/budget", mutate(["contractor"], (project, req) => {
    project.budget = amount(req.body?.budget);
    project.compensation = amount(req.body?.compensation, 0);
    if (project.budget < funded(project)) throw projectError("The budget cannot be lower than existing funding");
    checkBudget(project);
    return projectBudget(project);
  }));
  router.post(projectPath + "/expenses", mutate(["contractor"], (project, req) => {
    project.expenses.push({ description: text(req.body?.description, "expense description"), amount: amount(req.body?.amount), approved: true });
    checkBudget(project);
    return projectBudget(project);
  }));
  router.post(projectPath + "/funding", endpoint(async (req, res) => {
    const snapshot = projectFor(await readWorkspace(), req.params.projectId, req.user.id, ["client"]);
    const cents = amount(req.body?.amount);
    let deposit = { amount: cents, transaction: null, confirmed_at: now() };
    if (snapshot.mode === "testnet") {
      const address = req.user.stellar_address;
      const transaction = req.body?.transaction;
      if (!StrKey.isValidEd25519PublicKey(address || "") || !validHash(transaction)) {
        throw projectError("Set your public Stellar wallet and enter the testnet deposit transaction hash");
      }
      deposit = { amount: cents, ...await verifyFunding(transaction.toLowerCase(), { funding_address: address, amount: cents, memo: fundingMemo(snapshot.id) }, snapshot.payer) };
      if (Date.parse(deposit.confirmed_at) < Math.floor(Date.parse(snapshot.createdAt) / 1000) * 1000) {
        throw projectError("This deposit predates the project", 422);
      }
    } else if (req.body?.transaction) {
      throw projectError("Preview funding does not accept blockchain receipts");
    }
    const project = await updateWorkspace(state => {
      const project = projectFor(state, snapshot.id, req.user.id, ["client"]);
      if (deposit.transaction && state.projects.some(entry =>
        entry.funding.some(receipt => receipt.transaction === deposit.transaction) ||
        entry.tasks.some(task => [task.payout.tx, task.payout.candidateTx].includes(deposit.transaction)))) {
        throw projectError("That transaction has already been recorded", 409);
      }
      if (funded(project) + cents > project.budget) throw projectError("Funding exceeds the project budget", 409);
      project.funding.push(deposit);
      return project;
    });
    res.json(publicProject(project, req.user));
  }));

  router.post(projectPath + "/invitations", mutate(["client", "contractor"], (project, req) => {
    const role = req.body?.role;
    const allowed = membership(project, req.user.id) === "client" ? ["contractor"] : ["worker", "client"];
    if (!allowed.includes(role) || !validEmail(req.body?.email)) throw projectError("Enter an email and an allowed invitation role");
    const email = req.body.email.trim().toLowerCase();
    if (project.members.some(member => member.email === email) ||
        (role !== "worker" && project.members.some(member => member.role === role))) throw projectError("That role or member already exists", 409);
    for (const entry of project.invitations) {
      if (entry.email === email && entry.role === role && entry.status === "pending") entry.status = "superseded";
    }
    const token = randomBytes(32).toString("base64url");
    project.invitations.push({ email, role, hash: tokenHash(token), status: "pending", expiresAt: Date.now() + 7 * 86400_000 });
    return { token };
  }));
  router.post("/invitations/respond", endpoint(async (req, res) => {
    const { token, decision } = req.body ?? {};
    if (!["accept", "decline"].includes(decision)) throw projectError("Choose whether to accept or decline");
    const result = await updateWorkspace(state => {
      const { project, invitation } = findInvitation(state, token);
      if (invitation.email !== req.user.email || invitation.role !== req.user.role) {
        throw projectError("Sign in with the email and role specified by the invitation", 403);
      }
      if (decision === "accept") {
        if (membership(project, req.user.id) || (invitation.role !== "worker" && project.members.some(member => member.role === invitation.role))) {
          throw projectError("That project role is already filled", 409);
        }
        project.members.push({ id: req.user.id, role: invitation.role, name: req.user.name, email: req.user.email });
      }
      invitation.status = decision === "accept" ? "accepted" : "declined";
      return { decision, projectId: project.id };
    });
    res.json(result);
  }));

  router.post(projectPath + "/tasks", mutate(["contractor"], (project, req) => {
    const { workerId, title, description, allocation, clientApprovalRequired = false } = req.body ?? {};
    if (typeof clientApprovalRequired !== "boolean") throw projectError("Choose whether client confirmation is required");
    const member = project.members.find(entry => entry.id === workerId && entry.role === "worker");
    if (!member) throw projectError("Choose a worker who accepted the invitation");
    const recipient = getUserById(member.id)?.stellar_address || null;
    if (project.mode === "testnet" && (!StrKey.isValidEd25519PublicKey(recipient || "") || recipient === project.payer)) {
      throw projectError("The worker must set their own public Stellar wallet first");
    }
    const task = {
      id: randomUUID(), title: text(title, "task title"), description: text(description, "task description", 1000),
      workerId, workerName: member.name, recipient, amount: amount(allocation),
      status: "assigned", clientApprovalRequired, payout: { status: "pending" },
    };
    project.tasks.push(task);
    checkBudget(project);
    return { id: task.id };
  }));

  const taskPath = projectPath + "/tasks/:taskId";
  router.post(taskPath + "/submission", mutate(["worker"], (project, req) => {
    const task = taskFor(project, req.params.taskId);
    if (task.workerId !== req.user.id) throw projectError("Task not found", 404);
    if (!["assigned", "rejected"].includes(task.status)) throw projectError("This task is already submitted or approved", 409);
    task.submission = { notes: text(req.body?.notes, "submission notes", 2000), submittedAt: now() };
    task.status = "submitted";
    return { status: task.status };
  }));
  router.post(taskPath + "/review", mutate(["contractor"], (project, req) => {
    const task = taskFor(project, req.params.taskId);
    if (task.status !== "submitted") throw projectError("Only submitted work can be reviewed", 409);
    const { decision, notes } = req.body ?? {};
    if (!["approved", "rejected"].includes(decision)) throw projectError("Choose approve or reject");
    task.review = { notes: notes ? text(notes, "review notes", 1000) : "", reviewedAt: now() };
    task.status = decision;
    return { status: task.status };
  }));

  router.post(taskPath + "/confirm", mutate(["client"], (project, req) => {
    const task = taskFor(project, req.params.taskId);
    if (task.status !== "approved" || !task.clientApprovalRequired || task.clientApprovedAt) {
      throw projectError("This task is not awaiting client confirmation", 409);
    }
    task.clientApprovedAt = now();
    return { status: "confirmed" };
  }));

  router.post(projectPath + "/ai-summary", endpoint(async (req, res) => {
    const project = projectFor(await readWorkspace(), req.params.projectId, req.user.id, ["contractor", "client"]);
    if (!aiStatus) throw projectError("AI summaries are disabled. Project actions still work.", 503);
    res.json({ summary: await aiStatus(project) });
  }));

  const applyReceipt = (projectId, taskId, attempt, receipt) => updateWorkspace(state => {
    const task = taskFor(state.projects.find(entry => entry.id === projectId), taskId);
    if (task.payout.attempt !== attempt || task.payout.candidateTx !== receipt.tx) throw projectError("Payout changed", 409);
    Object.assign(task.payout, receipt, { status: "paid" });
    delete task.payout.error;
    return { status: "paid" };
  });

  router.post(taskPath + "/payout", endpoint(async (req, res) => {
    const { projectId, taskId } = req.params;
    const snapshot = projectFor(await readWorkspace(), projectId, req.user.id, ["contractor"]);
    const terms = payoutTerms(snapshot, taskFor(snapshot, taskId));
    if (snapshot.mode === "preview") {
      const payout = await updateWorkspace(state => {
        const project = projectFor(state, projectId, req.user.id, ["contractor"]);
        const task = taskFor(project, taskId);
        const terms = payoutTerms(project, task);
        task.payout = { status: "simulated", amount: terms.amount, paidAt: now() };
        return task.payout;
      });
      return res.json(payout);
    }

    // Discovery and verification cannot settle a transaction. Persist a single reservation before submitting.
    let submit;
    try { submit = await settlement.prepare(terms); }
    catch { throw projectError("Testnet verification is unavailable. Check the facilitator and funding wallet before retrying.", 503); }
    const payment = await updateWorkspace(state => {
      const project = projectFor(state, projectId, req.user.id, ["contractor"]);
      const task = taskFor(project, taskId);
      const current = payoutTerms(project, task);
      if (current.amount !== terms.amount || current.recipient !== terms.recipient || current.payer !== terms.payer) {
        throw projectError("Payment terms changed", 409);
      }
      task.payout = { ...terms, status: "processing", attempt: randomUUID(), startedAt: now() };
      return task.payout;
    });
    try {
      const hash = await submit();
      await updateWorkspace(state => {
        const task = taskFor(state.projects.find(entry => entry.id === projectId), taskId);
        if (task.payout.attempt !== payment.attempt) throw projectError("Payout changed", 409);
        task.payout.candidateTx = hash;
      });
      res.json(await applyReceipt(projectId, taskId, payment.attempt, await settlement.receipt(payment, hash)));
    } catch {
      await updateWorkspace(state => {
        const payout = taskFor(state.projects.find(entry => entry.id === projectId), taskId).payout;
        if (payout.attempt === payment.attempt && payout.status === "processing") {
          payout.status = "failed";
          payout.error = "Settlement could not be confirmed. Check the Stellar ledger before taking further action.";
        }
      });
      throw projectError("Settlement could not be confirmed. The payout is locked to prevent a duplicate.", 502);
    }
  }));
  router.post(taskPath + "/reconcile", endpoint(async (req, res) => {
    const { projectId, taskId } = req.params;
    const project = projectFor(await readWorkspace(), projectId, req.user.id, ["contractor"]);
    const payout = taskFor(project, taskId).payout;
    if (project.mode !== "testnet" || !["failed", "processing"].includes(payout.status) || !payout.candidateTx) {
      throw projectError("No recorded testnet settlement to check", 409);
    }
    let receipt;
    try { receipt = await settlement.receipt(payout, payout.candidateTx); }
    catch { throw projectError("Stellar has not confirmed this payout", 502); }
    res.json(await applyReceipt(projectId, taskId, payout.attempt, receipt));
  }));
  return router;
}
