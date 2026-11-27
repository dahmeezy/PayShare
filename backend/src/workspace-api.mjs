import { createHash, randomBytes, randomUUID } from "node:crypto";
import express from "express";
import { StrKey } from "@stellar/stellar-sdk";
import { validEmail } from "./auth-router.mjs";
import { findInvitation, tokenHash } from "./invitations.mjs";
import { verifyFundingTransfer, validHash } from "./funding.mjs";
import { endpoint } from "./money-api.mjs";
import { agentEntry, checkBudget, payoutChecks, payoutTerms } from "./payout-agent.mjs";
import { checkPin, hasPin, setPin } from "./payout-pin.mjs";
import { projectError } from "./project-store.mjs";
import { notificationsFor } from "./notifications.mjs";
import { requireSession } from "./session.mjs";
import { getUserById, readUsers, writeUsers } from "./users-store.mjs";
import { funded, projectBudget, readWorkspace, reservedFunding, updateWorkspace } from "./workspace-store.mjs";
import { registerWalletFunding } from "./wallet-funding.mjs";

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

function recordFunding(state, project, deposit) {
  if (deposit.transaction) {
    if (Date.parse(deposit.confirmed_at) < Math.floor(Date.parse(project.createdAt) / 1000) * 1000) {
      throw projectError("This deposit predates the project", 422);
    }
    if (state.projects.some(entry => entry.funding.some(receipt => receipt.transaction === deposit.transaction) ||
        entry.tasks.some(task => [task.payout.tx, task.payout.candidateTx].includes(deposit.transaction)))) {
      throw projectError("That transaction has already been recorded", 409);
    }
  }
  if (funded(project) + deposit.amount > project.budget) throw projectError("Funding exceeds the project budget", 409);
  project.funding.push(deposit);
}

function date(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value) || Number.isNaN(Date.parse(value))) throw projectError("Enter a valid deadline date");
  return value.slice(0, 10);
}
// One or many deliverables; none is allowed. Tasks never have mandatory stages.
function deliverableList(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 20) throw projectError("Enter up to 20 deliverables");
  return value.map(item => text(item, "deliverable", 200));
}
// Tasks created before acceptance existed (no acceptedAt key) count as accepted.
const accepted = task => task.acceptedAt !== null;

// One unique key per approved piece of work: a second payout for it can never be created.
const paymentKey = (project, task) => createHash("sha256").update(`${project.id}:${task.id}:${task.workerId}:${task.amount}`).digest("hex");

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
const currentState = state => ({ ...state, projects: state.projects.map(currentNames) });
// Projects keep the name a person joined with; show the one on their account now.
function currentNames(project) {
  const names = new Map(Object.values(readUsers()).map(user => [user.id, user.name]));
  return {
    ...project,
    members: project.members.map(member => ({ ...member, name: names.get(member.id) ?? member.name })),
    tasks: project.tasks.map(task => ({ ...task, workerName: names.get(task.workerId) ?? task.workerName })),
  };
}
function publicProject(saved, user) {
  const project = currentNames(saved);
  const role = membership(project, user.id);
  const tasks = project.tasks.filter(task => role !== "worker" || task.workerId === user.id).map(task => {
    const { status, tx, paidAt, error, candidateTx } = task.payout;
    return {
      id: task.id, title: task.title, description: task.description, workerId: task.workerId,
      workerName: task.workerName, amount: task.amount, status: task.status, submission: task.submission,
      criteria: task.criteria, deadline: task.deadline, deliverables: task.deliverables, reassignable: task.reassignable,
      acceptedAt: task.acceptedAt ?? null, declinedAt: task.declinedAt, createdAt: task.createdAt, submissions: task.submissions ?? (task.submission ? [task.submission] : []),
      clientApprovalRequired: task.clientApprovalRequired, clientApprovedAt: task.clientApprovedAt,
      review: task.review, payout: {
        status, paidAt, error, ...(role === "contractor" && { canReconcile: !!candidateTx }),
        ...(status === "paid" && { transaction: tx, explorerUrl: `https://stellar.expert/explorer/testnet/tx/${tx}` }),
      },
    };
  });
  const summary = { id: project.id, name: project.name, mode: project.mode, createdAt: project.createdAt, role, tasks };
  if (role === "worker") return summary;
  return {
    ...summary, budget: project.budget, compensation: project.compensation, expenses: project.expenses,
    payer: project.payer, fundingMemo: project.payer ? fundingMemo(project.id) : null, funded: funded(project), funding: project.funding,
    ...(role === "client" && { walletFunding: project.walletFunding }),
    totals: projectBudget(project), members: project.members,
    invitations: project.invitations.map(({ email, role, status, expiresAt }) => ({ email, role, status, expiresAt })),
  };
}

export function createWorkspaceRouter(settlement, verifyFunding, aiStatus = null, fundingHorizon) {
  verifyFunding ??= (hash, request, payer) => verifyFundingTransfer(hash, request, payer, fundingHorizon);
  const router = express.Router();
  router.use(express.json({ limit: "16kb" }));
  router.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });

  router.post("/invitations/lookup", endpoint(async (req, res) => {
    const { project, invitation } = findInvitation(await readWorkspace(), req.body?.token);
    res.json({ name: project.name, role: invitation.role });
  }));
  router.use(requireSession);
  router.use((req, res, next) => req.user.role ? next() : res.status(403).json({ error: "Choose your role first" }));

  router.get("/notifications", endpoint(async (req, res) => {
    if (!req.user.preferences.notifications.inApp) return res.json({ enabled: false, unread: 0, items: [] });
    const readAt = readUsers()[req.user.email].notifications_read_at || "";
    const items = notificationsFor(currentState(await readWorkspace()), req.user.id)
      .map(item => ({ ...item, unread: item.at > readAt }));
    res.json({ enabled: true, unread: items.filter(item => item.unread).length, items });
  }));
  router.post("/notifications/read", endpoint((req, res) => {
    const users = readUsers();
    users[req.user.email].notifications_read_at = new Date().toISOString();
    writeUsers(users);
    res.json({ unread: 0 });
  }));

  router.get("/capabilities", (req, res) => res.json({
    aiSummary: Boolean(aiStatus), testnet: Boolean(settlement.payer), payoutPinSet: hasPin(req.user.id),
  }));
  router.put("/pin", endpoint(async (req, res) => {
    if (req.user.role !== "contractor") throw projectError("Only contractors authorize payouts", 403);
    setPin(req.user.id, req.body?.pin, req.body?.currentPin);
    res.json({ payoutPinSet: true });
  }));

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
    if (project.budget < funded(project) + reservedFunding(project)) {
      throw projectError("The budget cannot be lower than existing or pending funding");
    }
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
    if (reservedFunding(snapshot)) throw projectError("Check the existing wallet funding request before recording manual funding.", 409);
    const cents = amount(req.body?.amount);
    let deposit = { amount: cents, transaction: null, confirmed_at: now() };
    if (snapshot.mode === "testnet") {
      const address = req.user.stellar_address;
      const transaction = req.body?.transaction;
      if (!StrKey.isValidEd25519PublicKey(address || "") || !validHash(transaction)) {
        throw projectError("Set your public Stellar wallet and enter the testnet deposit transaction hash");
      }
      deposit = { amount: cents, ...await verifyFunding(transaction.toLowerCase(), { funding_address: address, amount: cents, memo: fundingMemo(snapshot.id) }, snapshot.payer) };
    } else if (req.body?.transaction) {
      throw projectError("Preview funding does not accept blockchain receipts");
    }
    const project = await updateWorkspace(state => {
      const project = projectFor(state, snapshot.id, req.user.id, ["client"]);
      if (reservedFunding(project)) throw projectError("Check the existing wallet funding request before recording manual funding.", 409);
      recordFunding(state, project, deposit);
      return project;
    });
    res.json(publicProject(project, req.user));
  }));
  registerWalletFunding(router, projectPath + "/funding/wallet", {
    projectFor, amount, fundingMemo, recordFunding, verifyFunding, get: fundingHorizon,
  });

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
    const { workerId, title, description, allocation, clientApprovalRequired = false, criteria, deadline, deliverables, reassignable = false } = req.body ?? {};
    if (typeof clientApprovalRequired !== "boolean") throw projectError("Choose whether client confirmation is required");
    if (typeof reassignable !== "boolean") throw projectError("Choose whether the task can be reassigned");
    const member = project.members.find(entry => entry.id === workerId && entry.role === "worker");
    if (!member) throw projectError("Choose a worker who accepted the invitation");
    const recipient = getUserById(member.id)?.stellar_address || null;
    if (project.mode === "testnet" && (!StrKey.isValidEd25519PublicKey(recipient || "") || recipient === project.payer)) {
      throw projectError("The worker must set their own public Stellar wallet first");
    }
    const task = {
      id: randomUUID(), title: text(title, "task title"), description: text(description, "task description", 1000),
      workerId, workerName: member.name, recipient, amount: amount(allocation),
      criteria: criteria ? text(criteria, "acceptance criteria", 1000) : "",
      deadline: deadline ? date(deadline) : null,
      deliverables: deliverableList(deliverables),
      reassignable, acceptedAt: null, createdAt: now(),
      status: "assigned", clientApprovalRequired, payout: { status: "pending" },
    };
    project.tasks.push(task);
    checkBudget(project);
    return { id: task.id };
  }));

  const taskPath = projectPath + "/tasks/:taskId";
  // The worker must accept the task and its agreed payment before work starts.
  router.post(taskPath + "/accept", mutate(["worker"], (project, req) => {
    const task = taskFor(project, req.params.taskId);
    if (task.workerId !== req.user.id) throw projectError("Task not found", 404);
    const decision = req.body?.decision ?? "accept";
    if (!["accept", "decline"].includes(decision)) throw projectError("Choose whether to accept or decline");
    if (task.acceptedAt !== null || task.status !== "assigned") throw projectError("This task is no longer awaiting your response", 409);
    if (decision === "decline") {
      task.status = "declined";
      task.declinedAt = now();
      task.declineReason = req.body?.reason ? text(req.body.reason, "reason", 500) : "";
      return { status: task.status };
    }
    task.acceptedAt = now();
    task.acceptedAmount = task.amount;
    return { status: task.status, acceptedAt: task.acceptedAt, amount: task.amount };
  }));
  router.post(taskPath + "/submission", mutate(["worker"], (project, req) => {
    const task = taskFor(project, req.params.taskId);
    if (task.workerId !== req.user.id) throw projectError("Task not found", 404);
    if (!accepted(task)) throw projectError("Accept the task and its agreed payment before submitting work", 409);
    if (!["assigned", "rejected"].includes(task.status)) throw projectError("This task is already submitted or approved", 409);
    const links = req.body?.links === undefined ? [] : req.body.links;
    if (!Array.isArray(links) || links.length > 10 || links.some(link => typeof link !== "string" || !/^https?:\/\/\S{1,500}$/.test(link))) {
      throw projectError("Enter up to 10 web links that start with http:// or https://");
    }
    const entry = { version: (task.submissions?.length ?? 0) + 1, notes: text(req.body?.notes, "submission notes", 2000), links, submittedAt: now() };
    task.submissions = [...(task.submissions ?? []), entry];
    task.submission = entry;
    task.status = "submitted";
    return { status: task.status, version: entry.version };
  }));
  router.post(taskPath + "/review", mutate(["contractor"], (project, req) => {
    const task = taskFor(project, req.params.taskId);
    if (task.status !== "submitted") throw projectError("Only submitted work can be reviewed", 409);
    const { decision, notes } = req.body ?? {};
    if (!["approved", "rejected"].includes(decision)) throw projectError("Choose approve or reject");
    if (decision === "rejected" && !notes) throw projectError("Explain what needs to change");
    task.review = { notes: notes ? text(notes, "review notes", 1000) : "", reviewedAt: now(), version: task.submission?.version ?? 1 };
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

  // Plain-language record of what the payout agent checked and did. Not visible to workers.
  router.get(projectPath + "/agent-log", endpoint(async (req, res) => {
    const project = projectFor(await readWorkspace(), req.params.projectId, req.user.id, ["contractor", "client"]);
    res.json((project.agentLog ?? []).slice().reverse());
  }));
  router.get("/receipts", endpoint(async (req, res) => {
    const state = await readWorkspace();
    const receipts = [];
    for (const project of state.projects) {
      const role = membership(project, req.user.id);
      if (!role) continue;
      for (const task of project.tasks) {
        const { status, tx, paidAt, amount, key } = task.payout;
        if (!["simulated", "paid"].includes(status) || (role === "worker" && task.workerId !== req.user.id)) continue;
        receipts.push({
          id: key, projectId: project.id, projectName: project.name, taskId: task.id, task: task.title, worker: task.workerName,
          amount, status, demo: status === "simulated", paidAt, transaction: tx ?? null,
          explorerUrl: status === "paid" ? `https://stellar.expert/explorer/testnet/tx/${tx}` : null,
          note: status === "simulated" ? "Demo mode. No funds moved." : "Settled on Stellar testnet.",
        });
      }
    }
    res.json(receipts.sort((a, b) => String(b.paidAt).localeCompare(String(a.paidAt))));
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
    const project = state.projects.find(entry => entry.id === projectId);
    (project.agentLog ??= []).push(agentEntry(project, task, "paid", payoutChecks(project, { ...task, payout: { status: "pending" } })));
    return { status: "paid" };
  });

  const logAgent = (projectId, build) => updateWorkspace(state => {
    const project = state.projects.find(entry => entry.id === projectId);
    (project.agentLog ??= []).push(build(project));
  });

  router.post(taskPath + "/payout", endpoint(async (req, res) => {
    const { projectId, taskId } = req.params;
    const snapshot = projectFor(await readWorkspace(), projectId, req.user.id, ["contractor"]);
    const checks = payoutChecks(snapshot, taskFor(snapshot, taskId));
    let terms;
    try { terms = payoutTerms(snapshot, taskFor(snapshot, taskId)); }
    catch (error) {
      await logAgent(projectId, project => agentEntry(project, taskFor(project, taskId), "blocked", checks));
      throw error;
    }
    // Payment authorization: only the contractor's PIN releases money. A session alone is not enough.
    checkPin(req.user.id, req.body?.pin);
    if (snapshot.mode === "preview") {
      const payout = await updateWorkspace(state => {
        const project = projectFor(state, projectId, req.user.id, ["contractor"]);
        const task = taskFor(project, taskId);
        const terms = payoutTerms(project, task);
        task.payout = { status: "simulated", amount: terms.amount, paidAt: now(), key: paymentKey(project, task) };
        (project.agentLog ??= []).push(agentEntry(project, task, "simulated", checks));
        return task.payout;
      });
      return res.json(payout);
    }

    // Prepare the payload locally. Reserve the task before sending the signed payload to the facilitator.
    let submit;
    try { submit = await settlement.prepare(terms); }
    catch { throw projectError("Testnet payment preparation is unavailable. Check the facilitator and funding wallet before retrying.", 503); }
    const payment = await updateWorkspace(state => {
      const project = projectFor(state, projectId, req.user.id, ["contractor"]);
      const task = taskFor(project, taskId);
      const current = payoutTerms(project, task);
      if (current.amount !== terms.amount || current.recipient !== terms.recipient || current.payer !== terms.payer) {
        throw projectError("Payment terms changed", 409);
      }
      task.payout = { ...terms, status: "processing", attempt: randomUUID(), startedAt: now(), key: paymentKey(project, task) };
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
          const project = state.projects.find(entry => entry.id === projectId);
          const task = taskFor(project, taskId);
          (project.agentLog ??= []).push(agentEntry(project, task, "failed", payoutChecks(project, { ...task, payout: { status: "pending" } })));
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
