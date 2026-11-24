export const layer = (root, name) => root?.querySelector('[data-layer="' + name + '"]');
export const layers = (root, name) => [...(root?.querySelectorAll('[data-layer="' + name + '"]') || [])];
export const paragraphs = root => [...(root?.querySelectorAll("p") || [])];
export const clean = value => value.trim().replace(/\s+/g, " ");
export const money = (cents = 0) => number(cents) + " USDC";
export const number = (cents = 0) => new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(cents / 100);
export const initials = (name = "") => name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
export const date = value => value ? new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—";
export const sum = (items, key) => items.reduce((total, item) => total + (item[key] || 0), 0);

export function put(node, value) {
  if (node && value !== undefined) node.textContent = String(value);
}
export function slots(root, values) {
  paragraphs(root).forEach((item, index) => put(item, values[index]));
}
export function match(root, entries) {
  for (const p of paragraphs(root)) {
    const label = clean(p.textContent);
    for (const [search, value] of entries) {
      if (typeof search === "string" ? label === search : search.test(label)) {
        put(p, value);
        break;
      }
    }
  }
}

export function empty(root, message, before = null) {
  if (!root) return;
  const note = document.createElement("p");
  note.className = "live-note";
  note.textContent = message;
  root.insertBefore(note, before);
}

export function replaceEntries(root, selector, entries, fill, message) {
  const nodes = [...(root?.querySelectorAll(selector) || [])];
  if (!nodes.length) return;
  const parent = nodes[0].parentElement;
  const end = nodes.at(-1).nextSibling;
  if (!entries.length) {
    empty(parent, message, nodes[0]);
    nodes.forEach(node => node.remove());
    return;
  }
  const template = nodes[0].cloneNode(true);
  entries.forEach((entry, i) => {
    const node = nodes[i] || template.cloneNode(true);
    if (!nodes[i]) parent.insertBefore(node, end);
    fill(node, entry, i);
  });
  nodes.slice(entries.length).forEach(node => node.remove());
}

export function rowLink(node, route, project, task) {
  if (!node || !route) return;
  node.dataset.liveRoute = route;
  if (project?.id) node.dataset.liveProject = project.id;
  if (task?.id) node.dataset.liveTask = task.id;
  if (!node.matches("a,button")) {
    node.tabIndex = 0;
    node.role = "link";
  }
}
export const action = (root, regex) => [...(root?.querySelectorAll(".demo-action") || [])].find(
  item => regex.test(clean(item.textContent)),
);
export function labelAction(node, value) {
  if (!node) return;
  const caption = paragraphs(node).at(-1);
  if (caption) put(caption, value);
  else put(node, value);
}

export function taskStatus(task) {
  const labels = { assigned: "In progress", submitted: "Awaiting review", rejected: "Changes requested", approved: "Approved" };
  if (task.status === "approved" && task.clientApprovalRequired && !task.clientApprovedAt) return "Awaiting client confirmation";
  return labels[task.status] || task.status;
}
export function payoutStatus(payout) {
  return {
    pending: "Pending", simulated: "Simulated · No funds moved", processing: "Awaiting Stellar confirmation",
    paid: "Verified payment", failed: "Unconfirmed · Locked",
  }[payout.status] || "Unavailable";
}
export function statusText(node, value) {
  if (!node) return;
  node.classList.add("live-status");
  node.dataset.liveTone = /failed|locked|changes/i.test(value) ? "warning" :
    /simulated|verified|approved|fully funded/i.test(value) ? "good" : "neutral";
  put(node, value);
}
export function stats(root, values) {
  layers(root, "Stat card").forEach((card, i) => slots(card, [undefined, ...(values[i] || ["—", "No records yet"])]));
}
export function bar(root, amounts) {
  if (!root) return;
  const total = sum(amounts.map(value => ({ value })), "value");
  [...root.children].forEach((node, index) => {
    node.style.flex = '0 0 ' + (total ? 100 * (amounts[index] || 0) / total : 0) + '%';
    node.style.minWidth = "0";
  });
}

export function context(projects, selected, taskId) {
  const project = selected === null || selected === undefined ? projects[0] : projects.find(item => item.id === selected);
  const tasks = projects.flatMap(p => p.tasks.map(t => ({ ...t, project: p })));
  const availableTasks = tasks.filter(t => t.project === project);
  const task = availableTasks.find(item => item.id === taskId);
  const selectionMissing = Boolean((selected !== null && selected !== undefined && !project) ||
    (taskId !== null && taskId !== undefined && !task));
  const selectedTasks = selectionMissing ? [] : availableTasks;
  const paid = sum(tasks.filter(t => t.payout.status === "paid"), "amount");
  const simulated = sum(tasks.filter(t => t.payout.status === "simulated"), "amount");
  const allocation = sum(tasks, "amount");
  return {
    projects, project, tasks, selectedTasks, task, selectionMissing, paid, simulated, allocation,
    pending: allocation - paid - simulated,
    complete: tasks.filter(t => t.status === "approved").length,
    review: selectedTasks.filter(t => t.status === "submitted"),
    confirmations: selectedTasks.filter(t => t.status === "approved" && t.clientApprovalRequired && !t.clientApprovedAt),
    ready: selectedTasks.filter(t => t.status === "approved" && (!t.clientApprovalRequired || t.clientApprovedAt) && t.payout.status === "pending"),
  };
}
