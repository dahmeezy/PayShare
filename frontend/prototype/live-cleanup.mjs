// The Figma frames carry sample copy and controls for features PayShare doesn't have.
// This pass runs after the live bindings so none of it reaches a signed-in person.
import { action, layer, layers, match, money, number, paragraphs, payoutStatus, put } from "./live-elements.mjs";

const hide = node => { if (node) node.hidden = true; };
// Design-only controls. Anything the app gave a destination is left alone.
const unsupported = /^(message|ask |record (a )?voice|re-record|remind|discuss|export record|save draft|change history|add requirement|propose change|share (receipt|on whatsapp)|download pdf)/i;

// A spreadsheet must never run a cell that starts like a formula.
export const csvCell = value => {
  const text = String(value ?? "");
  return '"' + (/^[=+\-@\t\r]/.test(text) ? "'" + text : text).replaceAll('"', '""') + '"';
};
export function paymentRows(user, data) {
  const projects = user.role === "worker" || !data.project ? data.projects : [data.project];
  const rows = [["Type", "Project", "Task", "Worker", "Amount (USDC)", "Date", "Status", "Transaction"]];
  for (const project of projects) {
    for (const entry of project.funding || []) rows.push(["Funding", project.name, "", "", entry.amount / 100, entry.confirmed_at,
      entry.transaction ? "Verified" : "Simulation", entry.transaction || ""]);
    for (const task of project.tasks) rows.push(["Payout", project.name, task.title, task.workerName, task.amount / 100,
      task.payout.paidAt || "", payoutStatus(task.payout), task.payout.transaction || ""]);
  }
  return rows;
}
function download(user, data) {
  const file = new Blob([paymentRows(user, data).map(row => row.map(csvCell).join(",")).join("\r\n")], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(file);
  link.download = "payshare-statement.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
function exportControl(screen, user, data) {
  const control = action(screen, /^(export( csv)?|download statement)$/i);
  if (!control) return;
  control.hidden = false;
  // Replacing the node drops the sample handler.
  const real = control.cloneNode(true);
  delete real.dataset.liveRoute;
  real.addEventListener("click", event => { event.preventDefault(); download(user, data); });
  control.replaceWith(real);
}

// Phone frames draw header buttons as bare icons. Each one either does what its icon says
// or is removed; none is left looking pressable without working.
export function wireAppBar(screen, { user, data, go, markRead }) {
  const bar = layer(screen, "App bar");
  const actions = {
    bell: ["Notifications", () => go({ client: "d10", contractor: "c32", worker: "w13" }[user.role])],
    check: ["Mark all as read", markRead],
    download: ["Download statement (CSV)", () => download(user, data)],
    file: ["Download statement (CSV)", () => download(user, data)],
    "user-plus": ["Invite a worker", () => go("c16")],
    x: ["Close", () => go("c18")],
  };
  for (const node of [...(bar?.children || [])]) {
    if (!["Bell", "Right"].includes(node.dataset.layer)) continue;
    const name = node.querySelector('[data-layer^="icon/"]')?.dataset.layer.slice(5);
    if (!name) continue;
    if (!Object.hasOwn(actions, name)) { node.remove(); continue; }
    const [label, run] = actions[name];
    const control = document.createElement("button");
    control.type = "button";
    control.className = node.className.replace("demo-action", "").trim() + " ps-bar-button";
    control.dataset.layer = name === "bell" ? "Bell" : "Header action";
    control.setAttribute("aria-label", label);
    control.append(...node.childNodes);
    control.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); run(); });
    node.replaceWith(control);
  }
}

function budgetPreview(content) {
  const preview = layer(content, "Live preview");
  const inputs = [...content.querySelectorAll('input[type="number"]')];
  if (!preview || inputs.length < 2) return;
  const [budget, compensation] = inputs;
  const update = () => {
    const total = Math.round(Number(budget.value || 0) * 100);
    const own = Math.round(Number(compensation.value || 0) * 100);
    const pool = total - own;
    put(paragraphs(layer(preview, "v"))[0], number(total));
    layers(preview, "Breakdown row").forEach((row, index) => {
      const amount = [0, own, Math.max(0, pool)][index];
      const cells = paragraphs(row);
      put(cells.at(-2), (total ? Math.round(100 * amount / total) : 0) + "%");
      put(cells.at(-1), money(amount));
    });
    const bar = layer(preview, "bar");
    [...(bar?.children || [])].forEach((part, index) => { part.style.flex = [0, own, Math.max(0, pool)][index] + " 1 0"; });
    put(paragraphs(layer(preview, "ok")).at(-1), pool < 0 ? "Compensation is more than the budget" : total ? "Every USDC is accounted for" : "Enter your budget");
    const summary = layer(content, "Pool");
    if (summary) {
      const cells = paragraphs(summary);
      put(cells[1], number(total) + " − " + number(own) + " compensation");
      put(cells.at(-1), money(Math.max(0, pool)));
    }
  };
  for (const input of inputs) input.addEventListener("input", update);
  update();
}

export function tidy(screen, route, user, data) {
  const content = layer(screen, "Content");
  const { project, selectedTasks = [] } = data;
  for (const control of screen.querySelectorAll(".demo-action:not([data-live-route], [data-live-external])")) {
    if (unsupported.test(control.textContent.trim())) hide(control);
  }
  const workers = new Set(selectedTasks.map(task => task.workerId)).size;
  const totals = project?.totals || {};
  if (route === "c03") {
    match(content, [["Your client will be invited", "Invite your team next"],
      [/gets a link to fund the budget/, "After the project is created, share private invitation links with your client and workers."]]);
  }
  if (route === "c04") budgetPreview(content);
  if (route === "c05") match(content, [["SKILL", "ROLE"]]);
  if (route === "c06") {
    match(content, [[/sign-off\.?$/, "Only these deliverables need the client’s confirmation."],
      [/^1 submissions recorded\.$/, "1 submission recorded."],
      [/^\d{1,2} Nov 2026$/, project?.createdAt ? new Date(project.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"],
      [/^\d+ tasks · \d+ done$/, selectedTasks.length + " tasks · " + selectedTasks.filter(task => task.status === "approved").length + " done"]]);
  }
  if (route === "c07") match(content, [[/^Members \(\d+\)$/, "Members (" + (project?.members?.length || 0) + ")"]]);
  if (route === "c09") hide(layer(content, "Limits"));
  if (route === "c10" || route === "c14") {
    match(content, [[/USDC allocated$/, money(totals.allocated) + " of " + money(totals.worker_pool) + " allocated"],
      [/agreed · .* remaining$/, money(totals.allocated) + " agreed · " + money(totals.paid) + " paid"],
      ["Budgeted", "Recorded in"], ["Paid out", "Recorded in"], ["On project completion", "Project budget"],
      [/^Visible to you and/, "Visible to you and the client. Workers never see this amount."]]);
  }
  if (route === "c14") {
    const modal = layer(screen, "Modal");
    // Only the connected fields stay in the form; the sample warning, upload and options go.
    const body = layer(modal, "Body") || layer(modal, "Form");
    for (const child of [...(body?.children || [])]) {
      if (!child.querySelector("[data-live-field]") && !child.matches("[data-live-field], .live-field, .live-note, .live-message")) hide(child);
    }
    for (const select of modal?.querySelectorAll("select:not([data-live-field])") || []) hide(select.closest('[data-layer="Select"], [data-layer="Input"]'));
  }
  if (["c15", "mc06"].includes(route)) match(content, [[/^By WhatsApp/, "Share a private invitation link"]]);
  if (route === "c31") match(content, [[/^Monitoring$/, "Rules active"], [/^Duplicates blocked$/, "Blocked attempts"]]);
  if (route === "d05") match(content, [[/workers · .* pool$/, workers + (workers === 1 ? " worker · " : " workers · ") + money(totals.worker_pool) + " pool"]]);
  if (route === "d09") match(content, [[/^Worker allocation pool \(/, "Worker allocation pool"]]);
  if (route === "mw07") for (const child of layer(content, "Hist")?.children || []) if (!child.matches(".live-note")) hide(child);
  if (["w01", "mw01"].includes(route)) hide(action(content, /voice note/i));
  if (["c29", "d08", "d04", "md03", "w12", "mw10"].includes(route)) exportControl(screen, user, data);
}
