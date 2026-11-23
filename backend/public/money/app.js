const content = document.querySelector("#content");
const login = document.querySelector("#login");
const tabs = document.querySelector("#tabs");
const notice = document.querySelector("#notice");
const project = "/projects/proj_demo";
const usdc = (amount) => `${(amount / 100).toFixed(2)} USDC`;
let token;
let user;
let selected = new URL(location.href).searchParams.get("section") || "overview";

async function api(path, body, method = "POST") {
  const response = await fetch("/api" + path, {
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    ...(body === undefined ? {} : { method, body: JSON.stringify(body) }),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || "Request failed");
  return value;
}

function add(parent, tag, text) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  parent.append(element);
  return element;
}

function card(title, ...rows) {
  const article = add(content, "article");
  add(article, "h3", title);
  for (const row of rows.filter(Boolean)) add(article, "p", row);
  return article;
}

function link(parent, label, url) {
  const anchor = add(parent, "a", label);
  anchor.href = url;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  return anchor;
}

function form(title, button, fields, submit) {
  const element = add(content, "form");
  add(element, "h3", title);
  for (const [name, label, type = "text"] of fields) {
    const wrapper = add(element, "label", label);
    const input = add(wrapper, Array.isArray(type) ? "select" : "input");
    input.name = name;
    if (Array.isArray(type)) {
      for (const option of type) {
        const [value, text] = Array.isArray(option) ? option : [option, option];
        add(input, "option", text).value = value;
      }
    } else {
      input.type = type;
      input.required = type !== "checkbox";
      if (type === "number") input.min = "0";
    }
  }
  const action = add(element, "button", button);
  element.addEventListener("submit", async (event) => {
    event.preventDefault();
    action.disabled = true;
    try {
      const values = new FormData(element);
      const payload = Object.fromEntries(fields.map(([key, , type]) => [
        key, type === "checkbox" ? values.has(key) : type === "number" ? Number(values.get(key)) : values.get(key),
      ]));
      const result = await submit(payload);
      if (result?.share_url) {
        notice.replaceChildren();
        link(notice, "Open WhatsApp draft", result.share_url);
      } else {
        notice.textContent = "Saved.";
        await show(selected);
      }
    } catch (error) {
      notice.textContent = error.message;
    } finally {
      action.disabled = false;
    }
  });
}

const is = (role) => user.role === role;
const contractor = () => is("contractor");
const client = () => is("client");
const worker = () => is("worker");
const workers = async () => (await api(project + "/allocations")).map((row) => [row.worker_id, row.worker_name]);
const history = (events) => events?.map((event) => event.action.replaceAll("_", " ")).join(" → ");

async function overview() {
  const [summary, allocations, expenses] = await Promise.all([
    api(project + "/money-summary"), api(project + "/allocations"), api(project + "/expenses"),
  ]);
  card("Budget", `Budget  ${usdc(summary.total_budget)}`, `Verified funding  ${usdc(summary.funded)}`,
    `Approved expenses  ${usdc(summary.expenses)}`, `Worker pool  ${usdc(summary.worker_pool)}`,
    !worker() && `Contractor compensation  ${usdc(summary.contractor_comp)}`,
    !worker() && `Allocated  ${usdc(summary.allocated)} · Paid  ${usdc(summary.paid)} · Pending  ${usdc(summary.pending)}`,
    !worker() && `Uncommitted funding  ${usdc(summary.remaining)}`);
  for (const row of allocations) card(row.worker_name, row.task, usdc(row.amount));
  if (Array.isArray(expenses)) for (const e of expenses) card(e.description, usdc(e.amount), e.approved ? "Approved" : "Pending approval");
  if (!contractor()) return;
  form("Add an expense", "Save expense", [["description", "Description"], ["amount", "Amount in cents", "number"],
    ["approved", "Approved", "checkbox"]], (body) => api("/expenses", body));
  form("Contractor compensation", "Save compensation", [["amount", "Amount in cents", "number"]],
    (body) => api(project + "/contractor-compensation", body, "PUT"));
  form("Add a new allocation", "Save allocation", [["worker_id", "Worker", await workers()], ["amount", "Amount in cents", "number"]],
    (body) => api("/allocations", body));
}

async function funding() {
  const records = await api(project + "/funding");
  if (!records.length) card("No funding recorded");
  for (const record of records) {
    card(`${usdc(record.amount)} · ${record.status}`, record.recipient && `Testnet USDC destination  ${record.recipient}`, record.transaction);
    if (client() && record.status === "pending") {
      form("Verify your transfer", "Verify funding", [["transaction", "Stellar testnet transaction hash"]],
        (body) => api(`/funding/${record.id}/verify`, body));
    }
  }
  if (client()) form("Record a funding request", "Get destination", [["amount", "Amount in cents", "number"],
    ["funding_address", "Your Stellar testnet public address"]], (body) => api("/funding", body));
}

async function deliverables() {
  for (const task of await api(project + "/deliverables")) {
    const path = `/tasks/${task.id}`;
    card(task.title, `${task.worker} · ${usdc(task.amount)}`, task.status || "Awaiting task terms", task.criteria,
      task.client_confirmed && "Client confirmed", task.incomplete_report_open && "Open incomplete report", history(task.history));
    if (contractor() && !task.status) {
      form("Set task terms", "Save terms", [["criteria", "Acceptance criteria"], ["requires_client", "Client review required", "checkbox"],
        ["overall_completion", "Overall completion", "checkbox"], ["transferable", "Transferable", "checkbox"]],
      (body) => api(path + "/terms", body));
    }
    if (worker() && task.status === "assigned") {
      form("Agree to the terms", `Accept ${usdc(task.amount)}`, [], () => api(path + "/accept", { amount: task.amount }));
    }
    if (contractor() && task.status === "accepted" && !task.incomplete_report_open) {
      form("Contractor review", "Approve work", [["evidence", "Submission reference or review note"]],
        (body) => api(path + "/contractor-approve", body));
    }
    if (client() && task.status === "approved" && !task.client_confirmed && !task.incomplete_report_open &&
        (task.requires_client || task.overall_completion)) {
      form("Client review", "Confirm deliverable", [], () => api(path + "/client-confirm", { confirmed: true }));
    }
    if (worker() && ["accepted", "approved"].includes(task.status) && !task.incomplete_report_open) {
      form("Report incomplete work", "Send report", [["reason", "Reason"]], (body) => api(path + "/incomplete-reports", body));
    }
  }
}

async function changes() {
  for (const change of await api(project + "/allocation-changes")) {
    card(change.allocation_id.replace("alloc_", ""), `${usdc(change.current_amount)} → ${usdc(change.proposed_amount)}`,
      change.reason, change.status, history(change.history));
    if (change.status !== "pending" || change.awaiting !== user.role) continue;
    const respond = (body) => api(`/allocation-changes/${change.id}/respond`, body);
    form("Respond to proposal", "Save response", [["action", "Decision", [["accept", "Accept"], ["reject", "Reject"]]]], respond);
    if (worker()) form("Counteroffer", "Send counteroffer", [["amount", "Amount in cents", "number"]],
      (body) => respond({ ...body, action: "counter" }));
  }
  if (!worker()) form("Propose a change", "Send proposal", [
    ["allocation_id", "Worker", (await workers()).map(([id, name]) => [`alloc_${id}`, name])],
    ["proposed_amount", "Amount in cents", "number"], ["reason", "Reason"],
  ], (body) => api("/allocation-changes", body));
}

async function reports() {
  const [reports, notifications] = await Promise.all([
    api(project + "/incomplete-reports"), api(project + "/incomplete-notifications"),
  ]);
  if (notifications.length) card("Recent activity", ...notifications.slice(-5).reverse()
    .map((item) => `${item.task} · ${item.action.replaceAll("_", " ")}`));
  if (!reports.length) card("No incomplete work reports");
  for (const report of reports) {
    card(report.task_id, report.reason, report.status.replaceAll("_", " "), report.resolution?.reason, history(report.history));
    const path = `/incomplete-reports/${report.id}`;
    if (contractor() && report.status === "open") {
      const resolve = (action) => (body) => api(path + "/resolve", { ...body, action });
      form("Extend the deadline", "Save extension", [["date", "New due date", "date"], ["reason", "Reason"]], resolve("extend"));
      form("Propose partial pay", "Send offer", [["amount", "Amount in cents", "number"], ["reason", "Reason"]], resolve("partial_payment"));
      form("Propose reassignment", "Send proposal", [["worker_id", "New worker", (await workers()).filter(([id]) => id !== report.worker_id)],
        ["reason", "Reason"]], resolve("reassign"));
      form("Propose cancellation", "Send proposal", [["reason", "Reason"]], resolve("cancel"));
    }
    if (worker() && report.status === "awaiting_worker") {
      card("Proposed resolution", report.resolution.action.replaceAll("_", " "),
        report.resolution.amount && usdc(report.resolution.amount));
      form("Respond to resolution", "Save response", [["decision", "Decision", [["yes", "Accept"], ["no", "Decline"]]]],
        (body) => api(path + "/respond", { accepted: body.decision === "yes" }));
    }
  }
}

async function payments() {
  const result = await api(project + "/payments");
  card("Project progress", `${result.progress.paid} of ${result.progress.total} workers paid`);
  for (const row of result.payments) {
    const article = card(row.worker_name, `${usdc(row.amount)} · ${row.status}`, row.paid_at,
      ...row.reasons, row.next_action);
    if (row.explorer_url) link(article, "View Stellar receipt", row.explorer_url);
  }
}

async function whatsapp() {
  form("Prepare a WhatsApp message", "Create share link", [["sent_to", "Worker", await workers()],
    ["message_type", "Message type", [["invitation", "Invitation"], ["deadline_reminder", "Deadline reminder"], ["task_update", "Progress update"],
      ["payment_reminder", "Payment reminder"], ["payment_update", "Payment update"], ["allocation_change", "Allocation change"]]],
    ["message", "Message"]], (body) => api("/whatsapp", { project_id: "proj_demo", ...body }));
}

const pages = {
  overview: ["Budget and allocations", overview],
  funding: ["Funding", funding],
  deliverables: ["Deliverables", deliverables],
  changes: ["Allocation changes", changes],
  reports: ["Incomplete work", reports],
  payments: ["Payments", payments],
  whatsapp: ["WhatsApp", whatsapp],
};

async function show(section) {
  selected = Object.hasOwn(pages, section) && !(worker() && section === "whatsapp") ? section : "overview";
  for (const button of tabs.querySelectorAll("button")) {
    if (button.dataset.section === selected) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
  content.replaceChildren();
  const [title, load] = pages[selected];
  add(content, "h2", title).id = "section-title";
  tabs.inert = true;
  try { await load(); } finally { tabs.inert = false; }
}

login.addEventListener("submit", async (event) => {
  event.preventDefault();
  token = new FormData(login).get("token");
  try {
    user = await api("/session");
    login.reset();
    login.hidden = true;
    tabs.hidden = false;
    for (const [section, [title]] of Object.entries(pages)) {
      if (worker() && section === "whatsapp") continue;
      const button = add(tabs, "button", title);
      button.dataset.section = section;
      button.addEventListener("click", () => {
        notice.textContent = "";
        show(section).catch((error) => { notice.textContent = error.message; });
      });
    }
    await show(selected);
  } catch (error) {
    notice.textContent = error.message;
  }
});
