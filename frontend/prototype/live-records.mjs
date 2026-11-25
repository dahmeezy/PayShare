import { action, bar, clean, date, empty, initials, labelAction, layer, layers, match, money, number, paragraphs,
  payoutBadge, payoutStatus, put, replaceEntries, rowLink, slots, stats, statusText, sum, taskStatus } from "./live-elements.mjs";

const recs = ':scope > [data-layer="Row"]';
const label = value => value?.[0]?.toUpperCase() + value?.slice(1);
const shortHash = tx => tx ? tx.slice(0, 6) + "…" + tx.slice(-5) : "—";
const state = project => project?.mode === "preview" ? "Simulation" : project?.funded >= project?.budget ? "Fully funded" : "Not fully funded";
const percent = project => Math.round((project.tasks.filter(t => t.status === "approved").length / (project.tasks.length || 1)) * 100) + "%";
const paid = task => task.payout.status === "paid" ? task.amount : 0;
const taskLabel = task => task.payout.status !== "pending" ? payoutStatus(task.payout) : taskStatus(task);
const values = task => [initials(task.workerName), task.workerName];

function table(container, records, valuesFor, routeFor, message) {
  const root = container?.querySelector('[data-layer="Table"]:has(> [data-layer="Row"])') || container;
  if (root?.dataset.layer === "Table") root.classList.add("live-table");
  replaceEntries(root, recs, records, (row, item) => {
    const cells = [...row.children].filter(node => node.dataset.layer === "Cell");
    const values = valuesFor(item);
    cells.forEach((cell, i) => {
      const value = values[i];
      if (Array.isArray(value)) slots(cell, paragraphs(cell).length > 1 ? value : [value.at(-1)]);
      else if (value !== undefined) slots(cell, [value]);
    });
    const route = routeFor?.(item);
    rowLink(row, route, item.project || item, item.project && item);
    for (const button of row.querySelectorAll(".demo-action")) {
      if (route) rowLink(button, route, item.project || item, item.project && item);
      else if (item.explorerUrl) button.dataset.liveExternal = item.explorerUrl;
      else button.hidden = true;
    }
    if (item.explorerUrl && !route) {
      row.dataset.liveExternal = item.explorerUrl;
      row.tabIndex = 0;
      row.role = "link";
    }
  }, message);
}

function tasksIn(root, list, route, { approvals = false } = {}) {
  const status = t => t.clientApprovalRequired ? (t.clientApprovedAt ? "Confirmed" : "Required") : "Not needed";
  table(root, list, task => approvals ? [
    [initials(task.workerName), task.title + " · " + money(task.amount)], taskLabel(task),
    task.status === "submitted" ? "Contractor" : "Client", date(task.submission?.submittedAt),
  ] : [task.title, values(task), money(task.amount), "—", status(task), taskLabel(task)],
  route, "No matching tasks.");
}

function chips(container, counts) {
  const root = layer(container, "Chips") || layer(container, "Tabs") || layer(container, "Filters");
  if (!root) return;
  const items = [...root.children].filter(item => paragraphs(item).length);
  items.forEach((item, index) => {
    if (counts[index] === undefined) return;
    const caption = clean(item.textContent).replace(/\s*\(?\d+\)?$/, "");
    put(paragraphs(item)[0], caption + " (" + counts[index] + ")");
  });
}

export function bindProjects(screen, route, data) {
  const content = layer(screen, "Content");
  const { projects, project, selectedTasks } = data;
  if (["c02", "d02"].includes(route)) {
    const completed = p => p.tasks.length > 0 && p.tasks.every(t => t.payout?.status === "paid");
    const draft = p => !completed(p) && !(Number(p.funded) > 0);
    chips(content, [projects.length, projects.filter(p => !completed(p) && !draft(p)).length,
      projects.filter(draft).length, projects.filter(completed).length]);
    table(layer(content, "Projects table") || content, projects, p => [
      route === "c02" ? [p.name, new Set(p.tasks.map(t => t.workerId)).size + " workers · " + p.tasks.length + " tasks"] : p.name,
      p.members?.filter(x => x.role === (route === "c02" ? "client" : "contractor")).map(x => [initials(x.name), x.name])[0] || ["—", "Not linked"],
      money(p.budget), state(p), percent(p), "—",
    ], () => route === "c02" ? "c06" : "d03", "No projects yet. Use Create project to get started.");
    return;
  }
  if (["c07"].includes(route)) {
    const members = project?.members || [];
    match(layer(content, "Page header"), [[/Lagos Wedding Decoration/, project?.name || "No project"]]);
    table(content, members, m => [[initials(m.name), m.name], label(m.role),
      selectedTasks.filter(t => t.workerId === m.id).map(t => t.title).join(", ") || "—",
      m.role === "worker" ? money(sum(selectedTasks.filter(t => t.workerId === m.id), "amount")) : "—",
      m.role === "worker" ? "Own allocation" : "Project breakdown", "Active"], null, "No members yet.");
    const invites = layer(content, "Invited") || layer(content, "Invitations");
    if (invites) {
      [...invites.children].slice(1).forEach(child => child.hidden = true);
      empty(invites, "Invitations are managed from the invitation screen.");
    }
    return;
  }
  if (["c06", "mc02", "d03", "md02"].includes(route)) {
    const totals = project?.totals || {};
    match(content, [[/Lagos Wedding Decoration/, project?.name || "No project"], [/James–Okon|Event Sat/, state(project)],
      ["David James", project?.members?.find(x => x.role === "client")?.name || "Not linked"],
      ["Tola Adeyemi", project?.members?.find(x => x.role === "contractor")?.name || "Not linked"],
      [/Funded 14 Nov|^Funded$|Fully funded/, state(project)], [/2 ?[\/] ?5 tasks|^40%$/, project ? percent(project) : "0%"],
      [/^[\d,]+(?:\.\d+)? USDC$/, money(project?.budget)]]);
    stats(content, [[money(project?.funded), state(project)], [money(totals.paid), "Verified payments"],
      [money(totals.pending), "Agreed allocations"], [money(Math.max(0, (project?.funded || 0) - (totals.paid || 0))), "Project balance"]]);
    if (route === "d03" || route === "md02") {
      const list = layer(content, "Deliverables") || layer(content, "Deliv");
      replaceEntries(list, route === "d03" ? ':scope > [data-layer="d"]' : recs, selectedTasks, (record, task) => {
        slots(layer(record, "t"), [task.title, task.workerName + " · " + money(task.amount)]);
        statusText(paragraphs(record).at(-1), taskLabel(task));
        rowLink(record, "d06", project, task);
      }, "No deliverables yet.");
      const history = layer(content, "Activity");
      const updates = selectedTasks.filter(task => task.submission);
      replaceEntries(history, '[data-layer="Step"]', updates, (step, task) => slots(layer(step, "Text"),
        [task.title, date(task.submission.submittedAt), taskLabel(task)]), "No project activity yet.");
      const info = layer(content, "Info");
      const contractor = project?.members?.find(member => member.role === "contractor");
      match(info, [["TA", initials(contractor?.name || "")], [/^Contractor ·/, "Contractor"],
        [/1,000 of 1,000 USDC/, money(project?.funded) + " of " + money(project?.budget)],
        [/^13 Dec 2026|^Sat 13 Dec 2026$/, "—"], [/40% · 2 of 5/, project ? percent(project) : "0%"]]);
      return;
    }
    const taskList = layer(content, "Tasks");
    if (layer(taskList, "Table")) tasksIn(taskList, selectedTasks, () => "c20");
    else replaceEntries(taskList, recs, selectedTasks, (row, task) => {
      slots(layer(row, "t") || row, [task.title, task.workerName + " · " + money(task.amount)]);
      statusText(paragraphs(row).at(-1), taskLabel(task));
      rowLink(row, route === "md02" ? "d06" : "c20", task.project, task);
    }, "No tasks assigned.");
    for (const card of ["Deliverables", "Project info", "Recent activity", "Milestones"]) {
      const section = layer(content, card);
      if (!section) continue;
      if (card === "Project info") {
        match(section, [[/13 Dec|Eko Hotel|James–Okon/, "—"]]);
      } else if (card === "Deliverables") {
        for (const item of [...section.children].slice(1)) item.remove();
        empty(section, selectedTasks.filter(t => t.submission).length + " submissions recorded.");
      } else {
        for (const item of [...section.children].slice(1)) item.remove();
        empty(section, "View task and payment updates in the activity screens.");
      }
    }
  }
}

export function bindTaskList(content, route, data, filter) {
  const tasks = route.startsWith("w") || route.startsWith("mw") ? data.tasks : data.selectedTasks;
  const select = task => {
    if (!filter || /all/i.test(filter)) return true;
    if (/awaiting acceptance/i.test(filter)) return false;
    if (/new|in progress/i.test(filter)) return task.status === "assigned";
    if (/review/i.test(filter)) return task.status === "submitted";
    if (/done|completed|approved/i.test(filter)) return task.status === "approved";
    if (/issues/i.test(filter)) return task.status === "rejected";
    return true;
  };
  const filtered = tasks.filter(select);
  const n = value => tasks.filter(t => t.status === value).length;
  chips(content, route === "c18" ? [tasks.length, 0, n("assigned"), n("submitted"), n("approved"), n("rejected")]
    : route === "mw02" ? [tasks.length, n("assigned"), n("submitted"), n("approved")]
      : [tasks.length, n("assigned"), n("assigned"), n("submitted"), n("approved")]);
  if (route === "c18") {
    tasksIn(layer(content, "Tasks table"), filtered, t => t.status === "submitted" ? "c21" : "c20");
    const issue = layer(content, "Issue banner");
    if (issue) issue.hidden = true;
    return;
  }
  const list = layer(content, "List") || content;
  const selector = route === "mw02" ? ':scope > div:has(> [data-layer="h"]):has(> [data-layer="r"])' : ':scope > [data-layer]:has(> [data-layer="amt"])';
  replaceEntries(list, selector, filtered, (record, t) => {
    slots(layer(record, "t"), [t.title, t.project.name]);
    const amount = layer(record, "amt") || layer(record, "r");
    slots(amount, [money(t.amount), taskLabel(t)]);
    if (route === "mw02") statusText(paragraphs(amount).at(-1), taskLabel(t));
    rowLink(record, "w04", t.project, t);
    const button = action(record, /.*/);
    labelAction(button, "View task");
    rowLink(button, "w04", t.project, t);
  }, "No tasks match this view.");
}

function budgetSummary(content, project, data) {
  const t = project?.totals || {};
  const funded = project?.funded || 0;
  const remaining = Math.max(0, funded - (t.paid || 0));
  stats(content, [[money(project?.budget), money(funded) + " funded"], [money(t.allocated), money(t.unallocated) + " unallocated"],
    [money(t.paid), "Verified payments"], [money(Math.max(0, (t.pending || 0) - data.simulated)), "Awaiting payout"], [money(remaining), "Project balance"]]);
  const nums = [t.expenses || 0, project?.compensation || 0, t.worker_pool || 0];
  const formulas = [
    number(project?.budget) + " − " + number(nums[0]) + " − " + number(nums[1]) + " = " + money(nums[2]) + " for workers",
    money(t.unallocated) + " unallocated",
  ];
  match(content, [[/Lagos Wedding Decoration/, project?.name || "No project"], [/Where every USDC/, "Approved expenses and contractor compensation are deducted from the budget."],
    [/^Balanced|^Fully allocated/, formulas[1]], [/^1,000 − 100 − 200/, formulas[0]]]);
  slots(layer(content, "Total"), [number(project?.budget), "USDC budget", formulas[1]]);
  slots(layer(content, "Approved expenses"), [undefined, money(nums[0])]);
  slots(layer(content, "Contractor compensation"), [undefined, money(nums[1])]);
  slots(layer(content, "Worker allocation pool"), [undefined, money(nums[2])]);
  const breakdown = layer(content, "Budget breakdown");
  if (breakdown) {
    match(breakdown, [[/1,000\s*−\s*100/, formulas[0]], ["100 USDC", money(nums[0])],
      ["200 USDC", money(nums[1])], ["700 USDC", money(nums[2])], ["1,000 USDC", money(project?.budget)],
      [/Balanced|fully allocated/i, formulas[1]]]);
    bar(layer(breakdown, "Bar") || layer(breakdown, "Stack"), nums);
  }
  const expenses = content.querySelector('[data-layer="Expenses"]:has(> [data-layer="Card head"])');
  const total = paragraphs(layer(expenses, "Card head"));
  // Some frames show a total beside the title; others have only the title.
  if (total.length > 1 && /USDC/.test(total.at(-1).textContent)) put(total.at(-1), money(t.expenses));
  replaceEntries(expenses, '[data-layer="Exp"], [data-layer="Expense"], [data-layer="Expense row"]', project?.expenses || [],
    (row, expense) => slots(row, [expense.description, "Approved", money(expense.amount)]), "No approved expenses.");
  const compensation = layer(content, "Compensation");
  if (compensation) {
    match(compensation, [["200 USDC", money(project?.compensation)], ["Paid out", "Budgeted"],
      [/Tola Adeyemi/, project?.members?.find(m => m.role === "contractor")?.name || "No contractor"]]);
    rowLink(action(compensation, /.*/), "c09", project);
  }
}
function allocations(root, tasks, route) {
  table(root, tasks, t => [values(t), t.title, money(t.amount), money(paid(t)),
    ...(route === "d05" ? [money(t.amount - paid(t))] : []), taskLabel(t)], () => route === "d05" ? "d06" : "c11", "No allocations yet.");
}

export function bindBudget(content, route, data) {
  const { project, selectedTasks } = data;
  const t = project?.totals || {};
  if (["c10", "mc03", "d04", "md03"].includes(route)) budgetSummary(content, project, data);
  const owner = layer(content, "Worker allocations") || layer(content, "Allocations");
  if (owner && ["c10", "d05"].includes(route)) allocations(owner, selectedTasks, route);
  if (route === "mc03") replaceEntries(layer(content, "Worker allocation pool"), recs, selectedTasks,
    (row, task) => slots(row, [task.workerName, money(task.amount)]), "No allocations.");
  if (route === "d05") {
    slots(layer(content, "Totals"), [undefined, money(t.allocated) + " agreed · " + money(t.paid) + " verified"]);
    const note = paragraphs(content).find(p => p.textContent === "A change is pending");
    if (note) note.parentElement.parentElement.hidden = true;
  }
  if (["mc04", "md04"].includes(route)) {
    if (route === "mc04") slots(layer(content, "tot"), [money(t.allocated) + " of " + money(t.worker_pool) + " allocated", money(t.unallocated) + " left"]);
    replaceEntries(content, ':scope > div:has(> [data-layer="h"]):has(> [data-layer="r"])', selectedTasks, (row, task) => {
      slots(row, route === "mc04" ? [initials(task.workerName), task.workerName, task.title,
        money(task.amount) + " agreed · " + money(paid(task)) + " verified", taskLabel(task)] :
        [initials(task.workerName), task.workerName, task.title, taskLabel(task), undefined, money(task.amount),
          undefined, money(paid(task)), undefined, money(task.amount - paid(task))]);
      rowLink(row, route === "md04" ? "d06" : "c11", project, task);
    }, "No allocations yet.");
  }
  if (["d04", "md03"].includes(route)) {
    const budgets = [t.expenses || 0, project?.compensation || 0, t.worker_pool || 0];
    const breakdown = layer(content, "Budget breakdown") || layer(content, "Breakdown");
    const left = layer(breakdown, "c1");
    const right = layer(breakdown, "c2");
    const pending = sum(selectedTasks.filter(task => !["paid","simulated"].includes(task.payout.status)), "amount");
    layers(left, "Breakdown row").forEach((row, i) => slots(row, [
      ["Approved expenses", "Contractor compensation", "Worker allocation pool"][i],
      (project?.budget ? Math.round(100 * budgets[i] / project.budget) : 0) + "%", money(budgets[i]),
    ]));
    replaceEntries(right, '[data-layer="Breakdown row"]', selectedTasks, (row, task) =>
      slots(row, [task.workerName, task.title, money(task.amount)]), "No allocations yet.");
    bar(layer(breakdown, "Bar") || layer(breakdown, "Stack"), budgets);
    const pool = layer(content, "Worker allocation pool");
    replaceEntries(pool, recs, selectedTasks, (row, task) => slots(row, [task.workerName, money(task.amount)]), "No allocations yet.");
    slots(layer(content, "Total"), [money(project?.budget)]);
    const deposits = layer(content, "Funding");
    if (deposits) match(deposits, [[/14 Nov|12 Nov|15 Nov/, ""], [/^1,000 USDC$/, money(project?.funded)],
      [/David James|Tola Adeyemi/, project?.members?.find(m => m.role === "contractor")?.name || "—"],
      [/Fully funded|Confirmed/, state(project)]]);
    replaceEntries(layer(content, "Expenses"), ':scope > [data-layer="e"]', project?.expenses || [], (row, expense) => {
      slots(layer(row, "t"), [expense.description, "Approved"]);
      put(paragraphs(row).at(-1), money(expense.amount));
      const receipt = action(row, /view receipt/i);
      if (receipt) receipt.hidden = true;
    }, "No approved expenses.");
    const payments = layer(content, "Payments");
    const pendingRows = layers(payments, "Row");
    pendingRows.forEach((row, i) => slots(row, [
      ["Verified paid","Pending",route === "md03" ? "Remaining funds" : "Simulated payouts","Contractor compensation"][i],
      money([t.paid, pending, route === "md03" ? Math.max(0, (project?.funded || 0) - (t.paid || 0)) :
        sum(selectedTasks.filter(task => task.payout.status === "simulated"), "amount"), project?.compensation][i]),
    ]));
    const progress = layer(payments, "p");
    slots(progress, ["Paid out of " + money(project?.budget), money(t.paid)]);
    stats(content, [[money(project?.budget), "Agreed budget"], [money(project?.funded), state(project)], [money(t.paid), "Verified payments"],
      [money(pending), "Awaiting payout"], [money(Math.max(0, (project?.funded || 0) - (t.paid || 0))), "Project balance"]]);
    match(content, [[/^[^ ]*14 Nov|^Agreed 12 Nov|^(?:Fully )?Funded 14 Nov/, state(project)],
      [/^Lagos Wedding Decoration/, project?.name || "No project"]]);
  }
}

export function bindApprovals(content, route, data, filter) {
  const { project, ready, review, confirmations, selectedTasks } = data;
  if (route === "c23") {
    const pending = layer(content, "Pending");
    tasksIn(pending, [...review, ...confirmations], t => t.status === "submitted" ? "c21" : "c20", { approvals: true });
    for (const button of pending?.querySelectorAll("[data-live-task].demo-action") || []) labelAction(button, "View task");
    const grid = layer(layer(content, "Payout eligibility"), "Grid");
    const emptyGrid = ready.length ? "No other eligible payouts." : "No eligible payouts.";
    replaceEntries(grid, ':scope > [data-layer]', ready, (card, task) => {
      for (const holder of [...card.children].slice(1)) holder.remove();
      slots(card, [initials(task.workerName), task.workerName, money(task.amount), "Ready"]);
      empty(card, task.title + " · " + (project?.mode === "preview" ? "Simulation" : "Stellar testnet"));
      let button = action(card, /.*/);
      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.className = "btn btn-sm";
        card.append(button);
      }
      labelAction(button, "Authorize payout");
      rowLink(button, "c24", project, task);
    }, emptyGrid);
    chips(content, [review.length + confirmations.length, selectedTasks.filter(t => t.status === "approved").length]);
  } else {
    chips(content, [ready.length, selectedTasks.length - ready.length, selectedTasks.filter(t => paid(t)).length,
      selectedTasks.filter(t => t.payout.status === "failed").length]);
    const card = layer(content, "Ready");
    const chosen = clean(filter || "").toLowerCase().match(/^(waiting|paid|failed)/)?.[1];
    const task = chosen ? null : ready[0];
    if (task) {
      slots(card, [initials(task.workerName), task.workerName, task.title, money(task.amount), "Allocation recorded",
        "Contractor approved", task.clientApprovalRequired ? "Client confirmed" : "Client confirmation not required", "Funds available", "No payout recorded"]);
      rowLink(card, "c24", project, task);
    } else if (card) { card.hidden = true; if (!chosen) empty(content, "No payouts ready."); }
    const listed = {
      waiting: t => !ready.includes(t) && !["paid", "simulated", "failed"].includes(t.payout.status),
      paid: t => ["paid", "simulated"].includes(t.payout.status),
      failed: t => t.payout.status === "failed",
    }[chosen] || (t => !ready.includes(t));
    if (chosen) {
      match(content, [["Waiting", { waiting: "Waiting", paid: "Paid", failed: "Failed" }[chosen]]]);
    }
    replaceEntries(layer(content, "Waiting"), recs, selectedTasks.filter(listed), (row, item) => {
      slots(row, [initials(item.workerName), item.workerName + " · " + money(item.amount), item.title, taskLabel(item)]);
      rowLink(row, item.payout.status !== "pending" ? "c30" : item.status === "submitted" ? "c21" : "c20", project, item);
    }, chosen === "paid" ? "No payments recorded yet." : chosen === "failed" ? "No failed payouts." : "No waiting tasks.");
  }
}

export function bindPayments(content, route, data, filter) {
  const { project, tasks, selectedTasks } = data;
  const owned = route === "w12" || route === "mw10";
  const relevant = owned ? tasks : selectedTasks;
  const payments = relevant.map(t => ({
    project: t.project, task: t, name: owned ? t.project.name : t.workerName, title: t.title, amount: t.amount,
    date: t.payout.paidAt, tx: t.payout.transaction, status: payoutBadge(t.payout), explorerUrl: t.payout.explorerUrl,
  }));
  if (!owned) for (const receipt of project?.funding || []) payments.push({
    name: receipt.transaction ? "Verified funding" : "Simulated funding", title: project.name, amount: receipt.amount, date: receipt.confirmed_at,
    tx: receipt.transaction, status: receipt.transaction ? "Verified" : "Simulation", explorerUrl: receipt.transaction && "https://stellar.expert/explorer/testnet/tx/" + receipt.transaction,
  });
  const entries = payments.filter(item => !filter || /^all/i.test(filter) ||
    (/pending/i.test(filter) ? /pending|waiting/i.test(item.status) :
      /paid|success/i.test(filter) ? /verified.*payment/i.test(item.status) :
      /fail/i.test(filter) ? /locked/i.test(item.status) :
      /fund|received/i.test(filter) ? !item.task : true));
  const pending = sum(relevant.filter(t => !["paid", "simulated"].includes(t.payout.status)), "amount");
  if (owned) {
    stats(content, [[money(data.paid), "Verified payments"], [money(pending), "Awaiting payout"], ["—", "Timing not tracked"]]);
    slots(layer(content, "Total"), [undefined, money(data.paid), money(pending) + " pending"]);
    replaceEntries(layer(content, "List"), '[data-layer="Transaction row"]', entries, (record, item) => {
      slots(layer(record, "Text"), [item.name, item.title]);
      slots(layer(record, "AmountCol"), [money(item.amount), item.status]);
      if (item.tx) rowLink(record, "w11", item.project, item.task);
    }, "No payments recorded yet.");
  } else {
    stats(content, [[money(project?.funded), state(project)], [money(sum(relevant.filter(t => paid(t)), "amount")), "Verified payouts"],
      [money(pending), "Awaiting payout"], [relevant.filter(t => t.payout.status === "failed").length, "Unconfirmed settlements"]]);
    table(layer(content, "Transactions table") || content, entries, item => [[initials(item.name), item.name],
      item.title, money(item.amount), date(item.date), shortHash(item.tx), item.status],
    item => route === "c29" && item.task?.payout.canReconcile ? "c27" : null, "No payments recorded yet.");
  }
}
