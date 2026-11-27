// Task, payout and receipt screens. They keep the Figma frames' structure (page header,
// main column and side rail on desktop; app bar and stacked cards on phones) and show only
// what the server has recorded.
import { api } from "./api.mjs";
import { date, initials, layer, money, payoutStatus, taskStatus } from "./live-elements.mjs";
import { busy, button, el, field, onSubmit, say, status, toggle } from "./ui-kit.mjs";

const workspace = "/workspace";
const cents = value => Math.round(Number(value) * 100);
const day = value => value ? new Date(value + (value.length === 10 ? "T00:00:00Z" : "")).toLocaleDateString("en-GB",
  { day: "numeric", month: "short", year: "numeric", ...(value.length === 10 && { timeZone: "UTC" }) }) : "Not set";
const moment = value => value ? new Date(value).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—";

const card = (title, ...children) => el("section", { class: "ps-card" }, title && el("h2", {}, title), ...children);
const note = text => el("p", { class: "ps-hint" }, text);
const facts = rows => el("dl", {}, rows.filter(Boolean).map(([name, value]) =>
  el("div", { class: "ps-fact" }, el("dt", {}, name), el("dd", {}, value))));
const list = items => el("ul", { class: "ps-list" }, items.map(item => el("li", {}, item)));
const chip = text => el("span", { class: "ps-status-chip", "data-tone": /approved|paid|verified|received|simulat/i.test(text) ? "good"
  : /changes|declined|unconfirmed|failed|blocked/i.test(text) ? "warning" : "info" }, text);
const amountCard = (label, cents_, caption, ...children) => el("section", { class: "ps-card ps-amount" },
  el("p", { class: "ps-eyebrow" }, label), el("p", { class: "ps-figure" }, money(cents_)), caption && note(caption), ...children);

// Replaces the sample content of a desktop or phone frame.
export function mount(screen, { eyebrow, title, badge, intro, actions = [], main = [], rail = [] }) {
  // The shell may add its own menu button before the frame.
  const frame = screen.querySelector(":scope > [data-figma]");
  for (const overlay of frame.querySelectorAll('[data-layer="Modal"], [data-layer="Scrim"]')) overlay.remove();
  for (const inert of frame.querySelectorAll("[inert]")) inert.inert = false;
  // Some frames nest another "Content" layer, so prefer the page's own.
  let content = frame.querySelector(':scope > [data-layer="Main"] > [data-layer="Content"], :scope > [data-layer="Main col"] > [data-layer="Content"]')
    || layer(frame, "Content");
  const phone = screen.classList.contains("phone");
  if (phone) {
    const keep = ["Status bar", "App bar", "Bottom nav"];
    for (const child of [...frame.children]) if (!keep.includes(child.dataset.layer)) child.remove();
    const bar = layer(frame, "App bar");
    const heading = layer(bar, "t");
    if (heading) heading.replaceChildren(el("p", { class: "ps-eyebrow" }, eyebrow || ""), el("p", { class: "ps-bar-title" }, title));
    content = el("div", { "data-layer": "Content" });
    frame.insertBefore(content, layer(frame, "Bottom nav"));
  }
  if (!content) {
    content = el("div", { "data-layer": "Content" });
    (layer(frame, "Main") || frame).append(content);
  }
  const header = el("header", { class: "ps-page-header" },
    el("div", {}, eyebrow && el("p", { class: "ps-breadcrumb" }, eyebrow),
      el("div", { class: "ps-title" }, el("h1", {}, title), badge && chip(badge)), intro && el("p", {}, intro)),
    actions.length > 0 && el("div", { class: "ps-actions" }, actions));
  content.replaceChildren(header, el("div", { class: "ps-columns" + (rail.length ? "" : " ps-single") },
    el("div", { class: "ps-stack" }, main), rail.length > 0 && el("div", { class: "ps-rail" }, rail)));
  content.className = (phone ? "" : content.className + " ") + "ps-page";
  return content;
}

function empty(screen, context, title, text) {
  const { roleHome, open } = context;
  mount(screen, { title, main: [card(null, note(text), el("div", { class: "ps-actions ps-start" },
    button("Back to dashboard", { onclick: () => open(roleHome) })))] });
}

const tasksRoute = { contractor: "c18", worker: "w02", client: "d03" };

// Chooses the right screen for a task according to who is looking and what has happened.
function taskView(screen, context) {
  const { data: { task }, user, open } = context;
  const project = task.project;
  const accepted = task.acceptedAt !== null;
  const summary = card("Task summary", facts([
    ["Project", project.name], user.role !== "worker" && ["Worker", task.workerName], ["Agreed payment", money(task.amount)],
    ["Deadline", day(task.deadline)], ["Client confirmation", !task.clientApprovalRequired ? "Not required" : task.clientApprovedAt ? "Confirmed" : "Required"],
    ["Reassignable", task.reassignable ? "Yes" : "No"], ["Accepted", accepted ? moment(task.acceptedAt) : "Not yet"], ["Payment", payoutStatus(task.payout)],
  ]));
  const details = [card("Instructions", el("p", { class: "ps-text" }, task.description)),
    task.deliverables?.length ? card("Expected deliverables", list(task.deliverables)) : null,
    task.criteria ? card("How it will be checked", el("p", { class: "ps-text" }, task.criteria)) : null,
    task.review?.notes ? card(task.status === "rejected" ? "What needs to change" : "Review note", el("p", { class: "ps-text" }, task.review.notes)) : null,
    task.submissions?.length ? card("Submissions", el("ol", { class: "ps-history" }, [...task.submissions].reverse().map(entry =>
      el("li", {}, el("strong", {}, "Version " + (entry.version || 1)), el("span", {}, moment(entry.submittedAt)),
        el("p", { class: "ps-text" }, entry.notes),
        (entry.links || []).map(url => el("a", { class: "ps-link", href: url, target: "_blank", rel: "noopener noreferrer" }, url)))))) : null,
  ].filter(Boolean);
  const actions = [];
  if (user.role === "worker" && accepted && ["assigned", "rejected"].includes(task.status)) {
    actions.push(button(task.status === "rejected" ? "Submit revised work" : "Submit work", { onclick: () => open("w05", project, task) }));
  }
  if (user.role === "contractor" && task.status === "submitted") actions.push(button("Review submission", { onclick: () => open("c21", project, task) }));
  if (user.role === "contractor" && task.status === "approved" && task.payout.status === "pending" && (!task.clientApprovalRequired || task.clientApprovedAt)) {
    actions.push(button("Authorize payout", { onclick: () => open("c24", project, task) }));
  }
  if (user.role === "contractor" && task.payout.status !== "pending") actions.push(button("View payment", { variant: "secondary", onclick: () => open("c30", project, task) }));
  if (user.role === "client" && task.status === "approved" && task.clientApprovalRequired && !task.clientApprovedAt) {
    actions.push(button("Review & confirm", { onclick: () => open("d06", project, task) }));
  }
  actions.push(button("All tasks", { variant: "secondary", onclick: () => open(tasksRoute[user.role], project) }));
  mount(screen, { eyebrow: project.name, title: task.title, badge: task.declinedAt ? "Declined" : !accepted ? "Awaiting acceptance" : taskStatus(task),
    intro: user.role === "worker" ? money(task.amount) + " agreed" : task.workerName + " · " + money(task.amount),
    actions, main: details, rail: [summary] });
}

function accept(screen, context) {
  const { data: { task }, open, home } = context;
  if (task.acceptedAt !== null || task.status !== "assigned") return taskView(screen, context);
  const project = task.project;
  const agree = el("input", { type: "checkbox", id: "ps-understand" });
  const feedback = status();
  const yes = button("Accept task & payment", { type: "submit" });
  const no = button("Decline", { variant: "text" });
  const reason = field({ label: "Reason for declining (optional)", name: "reason", maxlength: 500, placeholder: "Tell your contractor why" });
  const path = workspace + "/projects/" + project.id + "/tasks/" + task.id + "/accept";
  const form = el("form", {}, amountCard("Your payment", task.amount, "No one can lower this amount without your agreement.",
    facts([["Deadline", day(task.deadline)], ["Paid when", task.clientApprovalRequired ? "Approved and confirmed by the client" : "Approved by the contractor"]]),
    el("div", { class: "ps-check" }, agree, el("label", { for: "ps-understand" }, "I understand the task and agree to " + money(task.amount))),
    yes, reason.root, no, feedback));
  form.addEventListener("submit", event => {
    event.preventDefault();
    if (!agree.checked) return say(feedback, "Tick the box to confirm you agree to the task and payment.", "error");
    void busy(yes, "Accepting…", feedback, async () => {
      await api(path, "POST", { decision: "accept" });
      open("w04", project, task);
    });
  });
  no.addEventListener("click", () => busy(no, "Declining…", feedback, async () => {
    await api(path, "POST", { decision: "decline", reason: reason.value() || undefined });
    home();
  }));
  mount(screen, { eyebrow: "New task · " + project.name, title: "Review & accept", badge: "Awaiting your acceptance",
    intro: "Read everything before you accept.",
    main: [card(task.title, el("p", { class: "ps-text" }, task.description)),
      task.deliverables?.length ? card("Expected deliverables", list(task.deliverables)) : null,
      task.criteria ? card("How it will be checked", el("p", { class: "ps-text" }, task.criteria)) : null],
    rail: [form] });
}

function submitWork(screen, context) {
  const { data: { task }, open } = context;
  if (task.acceptedAt === null || !["assigned", "rejected"].includes(task.status)) return taskView(screen, context);
  const project = task.project;
  const notes = field({ label: "Submission notes or work link", name: "notes", required: true, maxlength: 2000, placeholder: "Describe what you finished" });
  const area = el("textarea", { id: notes.control.id, name: "notes", class: "ps-input ps-textarea", required: true, maxlength: 2000, placeholder: "Describe what you finished" });
  notes.control.replaceWith(area);
  const area_ = { control: area, validate() { const ok = Boolean(area.value.trim()); area.setAttribute("aria-invalid", String(!ok));
    notes.root.lastChild.textContent = ok ? "" : "Add a note about your work."; notes.root.lastChild.classList.toggle("ps-error", !ok); return ok; } };
  const links = field({ label: "Work links (optional)", name: "links", placeholder: "https://… separate several with spaces",
    check: value => value.trim() && value.trim().split(/\s+/).some(url => !/^https?:\/\/\S+$/.test(url)) ? "Links must start with http:// or https://" : "" });
  const send = button("Submit for review", { type: "submit" });
  const feedback = status();
  const form = el("form", {}, card("Add your work", notes.root, links.root, note("File and voice uploads aren’t available yet. Share a link instead."),
    el("div", { class: "ps-actions" }, button("Cancel", { variant: "secondary", onclick: () => open("w04", project, task) }), send), feedback));
  onSubmit(form, send, "Submitting…", feedback, () => [area_, links], async () => {
    await api(workspace + "/projects/" + project.id + "/tasks/" + task.id + "/submission", "POST",
      { notes: area.value.trim(), links: links.value() ? links.value().split(/\s+/) : [] });
    open("w06", project, task);
  });
  mount(screen, { eyebrow: task.title, title: "Submit your work", intro: "Your contractor checks it against the agreed task.", main: [
    task.review?.notes && task.status === "rejected" ? card("What needs to change", el("p", { class: "ps-text" }, task.review.notes)) : null, form],
  rail: [card("Task", facts([["Task", task.title], ["Payment", money(task.amount)], ["Deadline", day(task.deadline)]]),
    task.criteria ? note(task.criteria) : null)] });
}

function received(screen, context) {
  const { data: { task }, open } = context;
  if (task.status !== "submitted") return taskView(screen, context);
  mount(screen, { eyebrow: task.title, title: "Work submitted", badge: "Awaiting review", intro: "Your work was received.",
    actions: [button("Back to task", { onclick: () => open("w04", task.project, task) })],
    main: [card("What happens next", el("ol", { class: "ps-history" },
      el("li", {}, el("strong", {}, "Submitted"), el("span", {}, moment(task.submission?.submittedAt))),
      el("li", {}, el("strong", {}, "Your contractor reviews your work")),
      task.clientApprovalRequired ? el("li", {}, el("strong", {}, "The client confirms the deliverable")) : null,
      el("li", {}, el("strong", {}, "Payment of " + money(task.amount)), el("span", {}, "After the contractor authorizes it"))))],
    rail: [card("Your submission", el("p", { class: "ps-text" }, task.submission?.notes || ""))] });
}

function review(screen, context) {
  const { data: { task }, user, open, home } = context;
  const client = user.role === "client";
  const allowed = client ? task.status === "approved" && task.clientApprovalRequired && !task.clientApprovedAt : task.status === "submitted";
  if (!allowed) return taskView(screen, context);
  const project = task.project;
  const path = workspace + "/projects/" + project.id + "/tasks/" + task.id;
  const feedback = status();
  const submitted = card("Submitted work", el("p", { class: "ps-text" }, task.submission?.notes || "No notes submitted."),
    (task.submission?.links || []).map(url => el("a", { class: "ps-link", href: url, target: "_blank", rel: "noopener noreferrer" }, url)),
    note("Version " + (task.submission?.version || 1) + " · " + moment(task.submission?.submittedAt)));
  let decision;
  if (client) {
    const checked = el("input", { type: "checkbox", id: "ps-checked" });
    const confirm = button("Confirm deliverable");
    confirm.addEventListener("click", () => {
      if (!checked.checked) return say(feedback, "Tick the box once you have checked the work.", "error");
      void busy(confirm, "Confirming…", feedback, async () => {
        await api(path + "/confirm", "POST", {});
        home();
      });
    });
    decision = card("Is this deliverable complete?", note("The contractor still authorizes the payment after you confirm."),
      el("div", { class: "ps-check" }, checked, el("label", { for: "ps-checked" }, "I’ve checked the work and it matches what we agreed")), confirm, feedback);
  } else {
    const area = el("textarea", { id: "ps-review", class: "ps-input ps-textarea", maxlength: 1000, placeholder: "Required when you request changes" });
    const approve = button("Approve work");
    const changes = button("Request changes", { variant: "secondary" });
    const decide = (control, value) => {
      if (value === "rejected" && !area.value.trim()) { area.focus(); return say(feedback, "Explain what needs to change.", "error"); }
      approve.disabled = changes.disabled = true;
      void busy(control, "Saving…", feedback, async () => {
        await api(path + "/review", "POST", { decision: value, notes: area.value.trim() || undefined });
        open("c23", project, task);
      }).then(() => { approve.disabled = changes.disabled = false; });
    };
    approve.addEventListener("click", () => decide(approve, "approved"));
    changes.addEventListener("click", () => decide(changes, "rejected"));
    decision = card("Your decision", el("div", { class: "ps-field" }, el("label", { for: "ps-review" }, "Review notes"), area), approve, changes, feedback);
  }
  mount(screen, { eyebrow: project.name + " · " + task.title, title: client ? "Check the deliverable" : "Review submission",
    badge: client ? "Needs your confirmation" : "Submitted", intro: task.workerName + " · " + money(task.amount),
    main: [submitted, task.criteria ? card("Acceptance criteria", el("p", { class: "ps-text" }, task.criteria)) : null,
      client && task.review?.notes ? card("Contractor’s note", el("p", { class: "ps-text" }, task.review.notes)) : null], rail: [decision] });
}

function createTask(screen, context) {
  const { data: { project }, open } = context;
  if (!project) return empty(screen, context, "Create a task", "Create a project first, then assign tasks to its workers.");
  const workers = project.members.filter(member => member.role === "worker");
  const title = field({ label: "Task title", name: "title", required: true, maxlength: 160, placeholder: "e.g. Set up the stage" });
  const textarea = (label, name, placeholder, options = {}) => {
    const item = field({ label, name, placeholder, ...options });
    const area = el("textarea", { id: item.control.id, name, class: "ps-input ps-textarea", placeholder, maxlength: options.maxlength, required: options.required });
    item.control.replaceWith(area);
    return { root: item.root, control: area, value: () => area.value.trim(), validate() {
      const ok = !options.required || Boolean(area.value.trim());
      area.setAttribute("aria-invalid", String(!ok));
      item.root.lastChild.textContent = ok ? options.hint || "" : "Enter " + label.toLowerCase() + ".";
      item.root.lastChild.classList.toggle("ps-error", !ok);
      return ok;
    } };
  };
  const description = textarea("Task description", "description", "What needs to be done", { required: true, maxlength: 1000 });
  const deliverables = textarea("Expected deliverables (optional)", "deliverables", "One per line", { maxlength: 2000 });
  const criteria = textarea("Acceptance criteria (optional)", "criteria", "How the work will be checked", { maxlength: 1000 });
  const select = el("select", { id: "ps-worker", class: "ps-input", required: true },
    el("option", { value: "" }, "Select a worker"), workers.map(worker => el("option", { value: worker.id }, worker.name)));
  const assignNote = el("p", { class: "ps-hint" });
  const assign = { control: select, validate() { const ok = Boolean(select.value); select.setAttribute("aria-invalid", String(!ok));
    assignNote.textContent = ok ? "" : "Select a worker."; assignNote.classList.toggle("ps-error", !ok); return ok; } };
  const payment = field({ label: "Agreed payment (USDC)", name: "payment", type: "number", required: true, min: "0.01", step: "0.01", max: "10000000", inputmode: "decimal", placeholder: "0.00",
    check: value => /^\d+(\.\d{1,2})?$/.test(value) && Number(value) > 0 ? "" : "Enter an amount with up to two decimal places." });
  const pool = el("p", { class: "ps-callout" });
  const showPool = () => {
    const left = Math.round((project.totals?.unallocated || 0)) - (cents(payment.value()) || 0);
    pool.textContent = left >= 0 ? "Unallocated after this task: " + money(left) : "This is " + money(-left) + " more than the unallocated budget.";
  };
  payment.control.addEventListener("input", showPool);
  showPool();
  const deadline = field({ label: "Deadline (optional)", name: "deadline", type: "date" });
  const confirm = toggle({ label: "Require client confirmation", description: "The client confirms the work before payment." });
  const reassign = toggle({ label: "Can be reassigned", description: "Turn off for work only this worker can finish." });
  const send = button("Assign task", { type: "submit", disabled: !workers.length });
  const feedback = status();
  const form = el("form", { class: "ps-columns" },
    el("div", { class: "ps-stack" }, card("What needs to be done", title.root, description.root, deliverables.root, criteria.root,
      note("File and voice instructions aren’t available yet."))),
    el("div", { class: "ps-rail" },
      card("Worker & payment", el("div", { class: "ps-field" }, el("label", { for: "ps-worker" }, "Assign to"), select, assignNote), payment.root, pool, deadline.root),
      card("Task rules", confirm.root, reassign.root, note("Reminders aren’t sent yet.")), send, feedback,
      workers.length ? note("The worker accepts the task and payment before work starts.")
        : el("p", { class: "ps-callout" }, "Invite a worker and have them accept before assigning a task.")));
  onSubmit(form, send, "Assigning…", feedback, () => [title, description, assign, payment], async () => {
    const { id } = await api(workspace + "/projects/" + project.id + "/tasks", "POST", {
      workerId: select.value, title: title.value(), description: description.value(), allocation: cents(payment.value()),
      clientApprovalRequired: confirm.input.checked, reassignable: reassign.input.checked,
      criteria: criteria.value() || undefined, deadline: deadline.value() || undefined,
      deliverables: deliverables.value().split("\n").map(line => line.trim()).filter(Boolean),
    });
    open("c20", project, { id });
  });
  const content = mount(screen, { eyebrow: project.name + " · New task", title: "Create a task",
    intro: "The worker sees all of this before accepting.", actions: [button("Cancel", { variant: "secondary", onclick: () => open("c18", project) })] });
  content.lastElementChild.replaceWith(form);
}

const checks = (project, task) => [
  ["Task accepted by the worker", task.acceptedAt !== null],
  ["Work approved by the contractor", task.status === "approved"],
  [task.clientApprovalRequired ? "Client confirmation received" : "Client confirmation not required", !task.clientApprovalRequired || Boolean(task.clientApprovedAt)],
  ["Project funds recorded", (project.funded || 0) >= task.amount],
  ["No earlier payout for this task", task.payout.status === "pending"],
];
const checklist = items => el("ul", { class: "ps-checks" }, items.map(([label, ok]) =>
  el("li", { class: ok ? "ok" : "no" }, el("span", { "aria-hidden": "true" }, ok ? "✓" : "✗"), label, el("span", { class: "ps-visually-hidden" }, ok ? " (met)" : " (not met)"))));

function authorize(screen, context) {
  const { data: { task, ready }, capabilities, open } = context;
  const payout = task || ready[0];
  if (!payout || !ready.some(entry => entry.id === payout.id)) {
    return mount(screen, { title: "Authorize payment", badge: payout ? taskStatus(payout) : undefined,
      main: [card(null, note(payout ? "This payout isn’t eligible right now." : "No payout is eligible."),
        payout ? checklist(checks(payout.project, payout)) : null,
        el("div", { class: "ps-actions ps-start" }, button("View approvals", { onclick: () => open("c23", payout?.project) })))] });
  }
  const project = payout.project;
  const preview = project.mode === "preview";
  const base = workspace + "/projects/" + project.id;
  const label = capabilities.payoutPinSet ? "Payout PIN" : "Create a 6-digit payout PIN";
  const pin = field({ label, name: "pin", type: "password", required: true, maxlength: 6, inputmode: "numeric", pattern: "\\d{6}", autocomplete: "off",
    title: "Enter your 6-digit payout PIN.", placeholder: "6 digits",
    hint: capabilities.payoutPinSet ? "Enter your PIN to release this payment." : "You’ll use this PIN to authorize every payment." });
  const send = button(preview ? "Run payout simulation" : "Authorize Stellar testnet payout", { type: "submit" });
  const feedback = status();
  const form = el("form", {}, card("Confirm this payment", note(preview ? "Simulation only. No funds move." : "Payments on Stellar can’t be reversed."),
    pin.root, send, button("Cancel", { variant: "text", onclick: () => open("c23", project) }), feedback));
  onSubmit(form, send, "Authorizing…", feedback, () => [pin], async () => {
    if (!capabilities.payoutPinSet) {
      await api(workspace + "/pin", "PUT", { pin: pin.value() });
      capabilities.payoutPinSet = true;
    }
    try { await api(base + "/tasks/" + payout.id + "/payout", "POST", { pin: pin.value() }); }
    catch (error) {
      if (error.status === 502) return open("c27", project, payout);
      throw error;
    }
    open("c29", project, payout);
  });
  mount(screen, { eyebrow: "Approvals · Payout to " + payout.workerName, title: "Authorize payment", badge: "Eligible",
    main: [amountCard("Amount", payout.amount, "Exactly the agreed amount.", facts([["Worker", payout.workerName], ["Project", project.name], ["Task", payout.title],
      ["Network", preview ? "Simulation" : "Stellar testnet · USDC"]])), card("Conditions checked before payment", checklist(checks(project, payout)))],
    rail: [form] });
}

const paymentTitle = payout => ({ pending: "Payment not started", simulated: "Simulated payment", processing: "Payout processing",
  paid: "Payment successful", failed: "Payment not confirmed" })[payout.status] || "Payment";

// Payout progress, failures and receipts.
function payment(screen, context) {
  const { data: { task, agentLog }, user, open } = context;
  const project = task.project;
  const payout = task.payout;
  const done = ["paid", "simulated"].includes(payout.status);
  const feedback = status();
  const actions = [];
  if (payout.explorerUrl) actions.push(el("a", { class: "ps-button ps-button-primary", href: payout.explorerUrl, target: "_blank", rel: "noopener noreferrer" }, "View verified transaction"));
  if (done) actions.push(button("Print receipt", { variant: "secondary", onclick: () => window.print() }));
  if (payout.canReconcile && ["failed", "processing"].includes(payout.status)) {
    const check = button("Check Stellar confirmation");
    check.addEventListener("click", () => busy(check, "Checking…", feedback, async () => {
      await api(workspace + "/projects/" + project.id + "/tasks/" + task.id + "/reconcile", "POST", {});
      open("c29", project, task);
    }));
    actions.push(check);
  }
  actions.push(button(user.role === "worker" ? "Payment history" : "All transactions", { variant: "secondary",
    onclick: () => open({ worker: "w12", client: "d08", contractor: "c29" }[user.role], project, task) }));
  const log = (agentLog || []).filter(entry => entry.taskId === task.id);
  mount(screen, { eyebrow: project.name, title: paymentTitle(payout), badge: payoutStatus(payout), actions,
    main: [amountCard(done ? "Receipt" : "Amount", task.amount,
      payout.status === "simulated" ? "Demo mode. No funds moved." : payout.status === "paid" ? "Verified on Stellar testnet." : payout.error || "",
      facts([["Task", task.title], ["Worker", task.workerName], ["Project", project.name], ["Date", moment(payout.paidAt)],
        payout.transaction ? ["Transaction", payout.transaction] : null]), feedback),
    log.length ? card("Payout agent log", el("ol", { class: "ps-history" }, log.map(entry => el("li", {},
      el("strong", {}, entry.message), el("span", {}, moment(entry.at)), checklist(entry.checks.map(check => [check.label, check.ok])))))) : null] });
}

function workerProfile(screen, context) {
  const { data: { task, tasks, projects }, open } = context;
  const worker = task && { id: task.workerId, name: task.workerName };
  if (!worker) return empty(screen, context, "Worker", "Choose a worker from the Workers list.");
  const own = tasks.filter(entry => entry.workerId === worker.id);
  const email = projects.flatMap(project => project.members || []).find(member => member.id === worker.id)?.email;
  const row = entry => el("li", {}, el("button", { type: "button", onclick: () => open("c20", entry.project, entry) },
    el("span", {}, el("strong", {}, entry.title), el("span", {}, entry.project.name + " · " + money(entry.amount))),
    chip(taskStatus(entry))));
  mount(screen, { eyebrow: "Workers", title: worker.name, intro: email,
    actions: [button("Assign task", { onclick: () => open("c19", task.project) })],
    main: [card("Tasks", el("ul", { class: "ps-rows" }, own.map(row)))],
    rail: [card("Summary", el("div", { class: "ps-profile-head" }, el("span", { class: "ps-avatar" }, initials(worker.name)), el("p", {}, el("strong", {}, worker.name), el("span", {}, "Worker"))),
      facts([["Tasks", String(own.length)], ["Agreed", money(own.reduce((sum, entry) => sum + entry.amount, 0))]]))] });
}

function activity(screen, context) {
  const { data: { project, selectedTasks, feed }, open } = context;
  if (!project) return empty(screen, context, "Project activity", "Create or join a project to see its history.");
  const events = (feed?.items || []).filter(item => item.projectId === project.id);
  mount(screen, { eyebrow: project.name, title: "Project activity", intro: "Agreements, approvals and payments recorded for this project.",
    actions: [button("Back to project", { variant: "secondary", onclick: () => open("c06", project) })],
    main: [card("History", events.length ? el("ol", { class: "ps-history" }, events.map(item => el("li", {}, el("strong", {}, item.title), el("span", {}, moment(item.at)), el("p", { class: "ps-text" }, item.detail))))
      : selectedTasks.length ? el("ul", { class: "ps-list" }, selectedTasks.map(task => el("li", {}, task.title + " · " + taskStatus(task) + " · " + date(task.createdAt))))
        : note("No project activity yet."))] });
}

// Figma draws these flows, but PayShare does not support them yet. They say so.
const unavailable = {
  allocation: ["Allocation changes aren’t available yet", "An agreed payment can’t be changed after the task is assigned. The current agreement stays in force."],
  report: ["Reporting a problem isn’t available yet", "Contact your contractor or team directly. Nothing about your task or pay changes automatically."],
  voice: ["Voice notes aren’t available yet", "Task instructions are shown as text on the task screen."],
  incomplete: ["Incomplete-task resolution isn’t available yet", "Review the submission or contact the worker directly. No payment moves without every approval."],
  budget: ["Budget change approval isn’t available yet", "The contractor manages the budget. It can’t drop below the funding already recorded."],
};
const unsupportedRoutes = { c12: "allocation", c13: "allocation", mc05: "allocation", w09: "allocation", mw08: "allocation",
  w10: "report", mw09: "report", mw04: "voice", c22: "incomplete", d07: "budget", md06: "budget" };

const views = {
  c19: createTask, mc07: createTask,
  c20: taskView, c11: taskView, w04: taskView, mw03: taskView, w07: taskView,
  w03: accept, mw05: accept, w05: submitWork, mw06: submitWork, w06: received,
  c21: review, mc08: review, d06: review, md05: review,
  c24: authorize, c25: payment, c26: payment, c27: payment, c28: payment, c30: payment, w11: payment,
  c17: workerProfile, c08: activity,
};
const needsTask = new Set(["c20", "c11", "w04", "mw03", "w07", "w03", "mw05", "w05", "mw06", "w06", "c21", "mc08", "d06", "md05", "c25", "c26", "c27", "c28", "c30", "w11"]);
export const rendersTask = route => Object.hasOwn(views, route) || Object.hasOwn(unsupportedRoutes, route);

export function renderTask(screen, route, context) {
  if (context.problem) return empty(screen, context, "Not available", context.problem);
  if (unsupportedRoutes[route]) {
    const [title, text] = unavailable[unsupportedRoutes[route]];
    return empty(screen, context, title, text);
  }
  if (needsTask.has(route) && !context.data.task) {
    return empty(screen, context, "No task selected", context.user.role === "client"
      ? "Deliverables appear here once a task on your project is submitted." : "Tasks appear here once one is assigned.");
  }
  views[route](screen, context);
}
