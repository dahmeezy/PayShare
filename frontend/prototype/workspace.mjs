import { api } from "./api.mjs";

const prefix = "/workspace";
function node(tag, content, css) {
  const result = document.createElement(tag);
  if (content !== undefined) result.textContent = content;
  if (css) result.className = css;
  return result;
}
const dollars = cents => (cents / 100).toFixed(2);
const usdc = cents => dollars(cents) + " USDC";
const payoutLabels = {
  pending: "Awaiting payout", simulated: "Simulated payout · No funds moved",
  processing: "Awaiting Stellar confirmation", paid: "Verified Stellar testnet payment", failed: "Settlement unconfirmed · Payout locked",
};

function field(name, label, options = {}) {
  const wrap = node("label", label);
  const input = node(options.choices ? "select" : options.multiline ? "textarea" : "input");
  if (options.choices) {
    for (const [value, text] of options.choices) {
      const option = node("option", text);
      option.value = value;
      input.append(option);
    }
  } else if (input.tagName === "INPUT") {
    input.type = options.type || "text";
    if (input.type === "number") {
      input.min = options.zero ? "0" : "0.01";
      input.max = "10000000";
      input.step = "0.01";
    }
  }
  input.name = name;
  input.setAttribute("aria-label", label);
  input.required = !options.optional;
  if (options.value !== undefined) input.value = options.value;
  wrap.append(input);
  return wrap;
}

const moneyField = (name, label, cents, zero = false) =>
  field(name, label + " (USDC)", { type: "number", value: cents === undefined ? "" : dollars(cents), zero });
const cents = value => Math.round(Number(value) * 100);

function button(label, action) {
  const control = node("button", label, "btn btn-sm");
  control.type = "button";
  if (action) control.addEventListener("click", action);
  return control;
}

export function form(label, fields, action) {
  const result = node("form", undefined, "workspace-form");
  const submit = button(label);
  submit.type = "submit";
  const feedback = node("p", "", "workspace-feedback");
  feedback.setAttribute("role", "status");
  result.append(...fields, submit, feedback);
  result.addEventListener("submit", async event => {
    event.preventDefault();
    if (submit.disabled) return;
    submit.disabled = true;
    feedback.textContent = "Saving…";
    try {
      const message = await action(Object.fromEntries(new FormData(result)));
      feedback.textContent = message || "Saved.";
    } catch (error) {
      feedback.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  });
  return result;
}

function section(title) {
  const result = node("section", undefined, "workspace-card");
  result.append(node("h2", title));
  return result;
}

function details(title, contents) {
  const result = node("details");
  result.append(node("summary", title), contents);
  return result;
}

function taskCard(project, task, update) {
  const card = node("article", undefined, "workspace-task");
  card.append(node("h3", task.title), node("p", task.description),
    node("p", `${task.workerName} · ${usdc(task.amount)} · ${task.status}`),
    node("p", payoutLabels[task.payout.status] || "Payment status unavailable", "workspace-status"));
  const path = `/projects/${project.id}/tasks/${task.id}`;
  if (task.submission) card.append(node("p", "Submission: " + task.submission.notes));
  if (task.clientApprovalRequired) card.append(node("p", task.clientApprovedAt ? "Client confirmed" : "Client confirmation required"));
  if (project.role === "client" && task.status === "approved" && task.clientApprovalRequired && !task.clientApprovedAt) {
    card.append(form("Confirm deliverable", [], () => update(path + "/confirm", "POST", {})));
  }
  if (task.review?.notes) card.append(node("p", "Review: " + task.review.notes));
  if (task.payout.error) card.append(node("p", task.payout.error));
  if (task.payout.explorerUrl) {
    const link = node("a", "View verified transaction");
    link.href = task.payout.explorerUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    card.append(link);
  }
  if (project.role === "worker" && ["assigned", "rejected"].includes(task.status)) {
    card.append(form("Submit work", [field("notes", "Submission notes or work link", { multiline: true })],
      values => update(path + "/submission", "POST", values)));
  }
  if (project.role === "contractor" && task.status === "submitted") {
    card.append(form("Save review", [
      field("decision", "Review decision", { choices: [["approved", "Approve"], ["rejected", "Reject"]] }),
      field("notes", "Review notes", { optional: true }),
    ], values => update(path + "/review", "POST", values)));
  }
  if (project.role === "contractor" && task.status === "approved" && task.payout.status === "pending" && (!task.clientApprovalRequired || task.clientApprovedAt)) {
    const label = project.mode === "preview" ? "Run payout simulation" : "Authorize Stellar testnet payout";
    card.append(form(label, [], () => update(path + "/payout", "POST", {})));
  }
  if (project.role === "contractor" && ["failed", "processing"].includes(task.payout.status) && task.payout.canReconcile) {
    card.append(form("Check Stellar confirmation", [], () => update(path + "/reconcile", "POST", {})));
  }
  return card;
}

function projectCard(project, update, aiSummary) {
  const card = section(project.name);
  card.append(node("p", project.mode === "preview" ? "Simulation only · No blockchain payments" : "Stellar testnet", "workspace-mode"));
  const base = "/projects/" + project.id;
  if (project.role !== "worker") {
    if (aiSummary) card.append(form("Get AI status summary", [], async () =>
      (await api(prefix + base + "/ai-summary", "POST")).summary));
    const totals = node("dl", undefined, "workspace-totals");
    for (const [key, value] of [
      ["Budget", project.budget], ["Funded", project.funded], ["Expenses", project.totals.expenses],
      ["Contractor compensation", project.compensation], ["Allocated", project.totals.allocated], ["Verified paid", project.totals.paid],
    ]) {
      const item = node("div");
      item.append(node("dt", key), node("dd", usdc(value)));
      totals.append(item);
    }
    card.append(totals);
    if (project.funding.length) {
      const receipts = node("ul");
      for (const receipt of project.funding) {
        const item = node("li", usdc(receipt.amount) + (receipt.transaction ? " · Verified testnet deposit" : " · Simulated funding"));
        if (receipt.transaction) {
          const link = node("a", "View deposit");
          link.href = "https://stellar.expert/explorer/testnet/tx/" + receipt.transaction;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          item.append(" ", link);
        }
        receipts.append(item);
      }
      card.append(details("Funding history", receipts));
    }
  }
  if (project.role === "client") {
    if (project.mode === "testnet") {
      card.append(node("p", "Send a single testnet USDC transfer to " + project.payer + " using this hash memo: " + project.fundingMemo));
    }
    const fields = [moneyField("amount", "Funding amount")];
    if (project.mode === "testnet") fields.push(field("transaction", "Stellar transaction hash"));
    card.append(details("Fund project", form(project.mode === "preview" ? "Record simulated funding" : "Verify testnet deposit", fields,
      values => update(base + "/funding", "POST", { ...values, amount: cents(values.amount) }))));
  }
  if (project.role === "contractor") {
    card.append(details("Manage budget", form("Save budget", [
      moneyField("budget", "Project budget", project.budget),
      moneyField("compensation", "Contractor compensation", project.compensation, true),
    ], values => update(base + "/budget", "PUT", { budget: cents(values.budget), compensation: cents(values.compensation) }))));
    card.append(details("Record expense", form("Save expense", [
      field("description", "Expense description"), moneyField("amount", "Expense amount"),
    ], values => update(base + "/expenses", "POST", { ...values, amount: cents(values.amount) }))));
    if (project.expenses.length) {
      const list = node("ul");
      for (const expense of project.expenses) list.append(node("li", expense.description + " · " + usdc(expense.amount)));
      card.append(details("Recorded expenses", list));
    }
    const workers = project.members.filter(member => member.role === "worker");
    if (workers.length) card.append(details("Assign task", form("Assign task and allocation", [
      field("workerId", "Worker", { choices: workers.map(worker => [worker.id, worker.name]) }),
      field("title", "Task title"), field("description", "Task description", { multiline: true }), moneyField("allocation", "Worker allocation"),
      field("clientApprovalRequired", "Client confirmation", { choices: [["no", "Contractor approval only"], ["yes", "Require client confirmation"]] }),
    ], values => update(base + "/tasks", "POST", { ...values, allocation: cents(values.allocation), clientApprovalRequired: values.clientApprovalRequired === "yes" }))));
    else card.append(node("p", "Workers can be assigned tasks after accepting their invitation."));
  }
  const inviteRoles = project.role === "client" ? ["contractor"] : project.role === "contractor" ? ["worker", "client"] : [];
  const available = inviteRoles.filter(role => role === "worker" || !project.members.some(member => member.role === role));
  if (available.length) {
    const invite = form("Create invitation link", [
      field("email", "Invite email", { type: "email" }),
      field("role", "Invitation role", { choices: available.map(role => [role, role]) }),
    ], async values => {
      const { token } = await api(prefix + base + "/invitations", "POST", values);
      invite.querySelector(".workspace-invite-link")?.remove();
      const result = node("div", undefined, "workspace-invite-link");
      const link = node("input");
      link.readOnly = true;
      link.setAttribute("aria-label", "Invitation link");
      link.value = new URL("/frontend/prototype.html?app=1#/join-" + token, location.origin).href;
      const copy = button("Select invitation link", () => { link.focus(); link.select(); });
      result.append(node("p", "Share this link privately. PayShare did not send a message."), link, copy);
      invite.append(result);
      return "Invitation created.";
    });
    card.append(details("Invite teammate", invite));
  }

  card.append(node("h3", "Tasks and payouts"));
  if (!project.tasks.length) card.append(node("p", "No tasks assigned yet."));
  for (const task of project.tasks) card.append(taskCard(project, task, update));
  return card;
}

export function makeWorkspace(content, user, callbacks) {
  const controls = node("div", undefined, "workspace-toolbar");
  const profile = section("Your profile");
  profile.id = "workspace-profile";
  const profileForm = form("Save profile", [
    field("name", "Profile name", { value: user.name }),
    field("stellarAddress", "Public Stellar wallet", { value: user.stellar_address || "", optional: true }),
  ], async values => { callbacks.user(await api("/profile", "PUT", values)); return "Profile saved."; });
  profile.append(node("p", user.email + " · Email verification unavailable"), profileForm);
  const projects = node("div", undefined, "workspace-projects");
  const feedback = node("p", "", "workspace-feedback");
  feedback.setAttribute("role", "status");
  const heading = node("h1", `${user.role[0].toUpperCase()}${user.role.slice(1)} workspace`);
  const refresh = button("Refresh projects", () => load());
  controls.append(heading, refresh);
  content.classList.add("workspace");
  content.replaceChildren(controls, feedback, projects, profile);
  const update = async (path, method, values) => {
    try {
      await api(prefix + path, method, values);
      await load("Saved.");
    } catch (error) {
      if (/\/(payout|reconcile)$/.test(path) && error.status >= 500) await load(error.message);
      throw error;
    }
  };
  const capabilityRequest = user.role === "worker" ? Promise.resolve({}) :
    api(prefix + "/capabilities").catch(() => ({}));
  if (user.role !== "worker") {
    const create = section("Create a project");
    create.append(form("Create project", [
      field("name", "Project name"), moneyField("budget", "Project budget"),
      field("mode", "Project mode", { choices: [["preview", "Simulation"]] }),
    ], async values => {
      await update("/projects", "POST", { ...values, budget: cents(values.budget) });
      create.querySelector("form").reset();
      return "Project created.";
    }));
    feedback.after(create);
    void capabilityRequest.then(value => {
      if (value.testnet) {
        const option = node("option", "Stellar testnet");
        option.value = "testnet";
        create.querySelector('select[name="mode"]').append(option);
      }
    }).catch(() => {});
  }

  async function load(message) {
    refresh.disabled = true;
    feedback.textContent = "Loading projects…";
    try {
      const [list, capabilities] = await Promise.all([api(prefix + "/projects"), capabilityRequest]);
      projects.replaceChildren(...list.map(project => projectCard(project, update, capabilities.aiSummary)));
      if (!list.length) projects.append(node("p", "No projects yet."));
      feedback.textContent = message || "";
    } catch (error) {
      if (error.status === 401) return callbacks.expired();
      feedback.textContent = error.message;
    } finally {
      refresh.disabled = false;
    }
  }
  void load();
}
