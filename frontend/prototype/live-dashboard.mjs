import { action, bar, date, empty, initials, layer, layers, match, money, number, paragraphs, put,
  payoutBadge, payoutStatus, replaceEntries, rowLink, slots, stats, statusText, sum, taskStatus } from "./live-elements.mjs";
const plural = (n, one, many) => n + " " + (n === 1 ? one : many);

export function bindIdentity(screen, user, { project, review, confirmations, tasks }) {
  const account = layer(screen, "User");
  const top = layer(screen, "Top bar");
  const mobile = layer(screen, "App bar");
  const name = user.name;
  match(account, [[/^[A-Z]{2}$/u, initials(name)], [/^(Tola Adeyemi|Amara Okafor|David James)$/, name]]);
  match(top, [[/^(TA|AO|DJ)$/, initials(name)], ["Stellar Testnet", project?.mode === "testnet" ? "Stellar Testnet" : "Simulation"]]);
  match(mobile, [[/^(TA|AO|DJ)$/, initials(name)], [/^(Tola Adeyemi|Amara Okafor|David James)$/, name],
    ["Lagos Wedding Decoration", project?.name || "No project"]]);
  const avatar = layer(top, "Avatar") || paragraphs(top).find(p => p.textContent === initials(name))?.parentElement;
  rowLink(avatar, "profile");
  match(layer(screen, "Project switcher"), [[/Lagos Wedding Decoration/i, project?.name || "No project"]]);
  for (const nav of [...layers(screen, "Sidebar item"), ...layers(screen, "Bottom nav item")]) {
    const badge = paragraphs(nav).at(-1);
    if (!/^\d+$/.test(badge?.textContent.trim())) continue;
    const name = paragraphs(nav)[0]?.textContent.toLowerCase() || "";
    const count = name.includes("approval") ? (user.role === "client" ? confirmations.length : review.length) :
      name.includes("task") ? tasks.filter(t => t.status !== "approved").length : 0;
    if (count) put(badge, count);
    else badge.parentElement.hidden = true;
  }
}

function datesAndActivities(data) {
  const items = data.tasks.flatMap(t => [
    ...(t.payout.status !== "pending" ? [{
      title: t.title, detail: payoutBadge(t.payout) + " · " + money(t.amount),
      when: t.payout.paidAt, status: t.payout.status === "simulated" ? "Simulated" :
        t.payout.status === "paid" ? "Verified" : t.payout.status === "failed" ? "Locked" : "Processing", route: t.project.role === "worker" ? "w12" : t.project.role === "client" ? "d08" : "c29",
      project: t.project, task: t,
    }] : []),
    ...(t.submission ? [{
      title: t.title, detail: taskStatus(t), when: t.submission.submittedAt,
      status: t.status === "submitted" ? "In review" : t.status === "approved" ? "Approved" : taskStatus(t), route: t.project.role === "worker" ? "w04" : t.project.role === "client" ? "d06" : "c21",
      project: t.project, task: t,
    }] : []),
  ]);
  for (const p of data.projects) {
    for (const funding of p.funding || []) items.push({
      title: funding.transaction ? "Funding verified" : "Simulated funding", detail: money(funding.amount),
      when: funding.confirmed_at, status: funding.transaction ? "Verified" : "Simulation", project: p,
      route: p.role === "client" ? "d08" : "c29",
    });
  }
  return items.sort((a, b) => String(b.when || "").localeCompare(String(a.when || "")));
}

function activity(root, items, selector) {
  replaceEntries(root, selector, items.slice(0, 3), (record, item) => {
    const body = layer(record, "Text");
    if (body) slots(body, layer(record, "AmountCol") ? [item.title, item.detail] : [item.title, date(item.when), item.detail]);
    else {
      const titleArea = layer(record, "t");
      const slotsInRow = paragraphs(record);
      const badge = slotsInRow.at(-1);
      if (titleArea) {
        slots(titleArea, [item.title, item.detail]);
        if (!titleArea.contains(badge)) statusText(badge, item.status);
        if (slotsInRow[0] !== paragraphs(titleArea)[0]) put(slotsInRow[0], initials(item.title));
      } else if (slotsInRow.length >= 4) {
        slots(record, [initials(item.title), item.title, item.detail, item.status]);
        statusText(badge, item.status);
      } else {
        slots(record, [item.title, item.detail, item.status]);
        if (slotsInRow.length > 2) statusText(badge, item.status);
      }
    }
    slots(layer(record, "AmountCol"), [item.detail, date(item.when)]);
    rowLink(record, item.route, item.project, item.task);
  }, "No recent activity.");
}

function progress(data) {
  const count = data.selectedTasks.filter(task => task.status === "approved").length;
  const percent = data.selectedTasks.length ? Math.round(100 * count / data.selectedTasks.length) : 0;
  return { percent, description: count + " of " + data.selectedTasks.length + " tasks done" };
}

function taskReviewRows(root, tasks) {
  replaceEntries(root, '[data-layer="Row"]', tasks, (row, t) => {
    const cells = layers(row, "Cell");
    slots(cells[0], [t.title]);
    slots(cells[1], [initials(t.workerName), t.workerName]);
    slots(cells[2], [date(t.submission?.submittedAt)]);
    slots(cells[3], [money(t.amount)]);
    rowLink(action(row, /.*/) || row, "c21", t.project, t);
  }, "No submitted tasks need review.");
}

function workerTasks(root, selector, tasks) {
  replaceEntries(root, selector, tasks, (record, t) => {
    const body = layer(record, "t");
    slots(body, [t.title, money(t.amount) + " · " + t.project.name]);
    const last = paragraphs(record).at(-1);
    if (last && !body?.contains(last)) statusText(last, taskStatus(t));
    if (!body) slots(record, [t.title, money(t.amount), taskStatus(t)]);
    else if (paragraphs(record)[0] !== paragraphs(body)[0]) put(paragraphs(record)[0], initials(t.title));
    rowLink(record, "w04", t.project, t);
  }, "No tasks assigned to you yet.");
}

export function bindDashboard(screen, route, user, data) {
  const content = layer(screen, "Content");
  const { project, projects, tasks, selectedTasks, review, confirmations, paid, pending, allocation, simulated, complete } = data;
  const { percent, description } = progress(data);
  const t = project?.totals || {};
  const name = project?.name || "No project yet";
  const client = project?.members?.find(x => x.role === "client")?.name;
  const contractor = project?.members?.find(x => x.role === "contractor")?.name;
  const state = project ? (project.mode === "preview" ? "Simulation" : project.funded >= project.budget ? "Fully funded" : "Funding open") : "No funding";
  const funds = project?.funded || 0;
  const available = Math.max(0, funds - (t.paid || 0));
  const activityItems = datesAndActivities(data);
  for (const track of layers(content, "Progress")) {
    if (track.firstElementChild?.dataset.layer === "Rectangle") {
      track.firstElementChild.style.width = percent + "%";
    }
  }
  const firstName = user.name.split(/\s+/)[0];
  const projectSummary = project ? name : "Create or join a project to get started.";
  const paidDetail = simulated ? money(simulated) + " simulated" : "Verified payments only";
  const pendingDetail = review.length ? review.length + " awaiting review" : "Awaiting conditions";

  if (route === "c01" || route === "d01") {
    const header = layer(content, "Title");
    slots(header, [route === "c01" ? "Good morning, " + firstName : "Welcome back, " + firstName,
      !project ? "Create or join a project to get started." : project.name + " · " + description]);
    stats(content, route === "c01" ? [
      [projects.length, projectSummary], [money(sum(projects, "funded")), client ? "Funded by " + client : "No deposits yet"],
      [money(allocation), selectedTasks.length + " project tasks"], [money(paid), paidDetail],
      [money(pending), pendingDetail], [money(available), "Selected project balance"],
    ] : [
      [projects.length, projectSummary], [money(project?.budget), "Agreed budget"], [money(funds), state],
      [percent + "%", description], [money(t.worker_pool), plural(new Set(selectedTasks.map(task => task.workerId)).size, "worker", "workers")],
      [money(project?.compensation), contractor || "No contractor linked"], [money(t.expenses), plural(project?.expenses.length || 0, "expense", "expenses")],
      [money(paid), paidDetail],
    ]);
    const card = layer(content, route === "c01" ? "Project overview" : "Project");
    slots(layer(card, "t"), [name, route === "c01" ? (client ? "Client " + client : state) : (contractor ? "Contractor " + contractor : state)]);
    match(layer(card, "Card head"), [["Funded", state]]);
    const legend = layer(card, "Legend");
    if (route === "c01") slots(legend, [undefined, money(t.expenses), undefined, money(project?.compensation),
      "Allocated to workers", money(t.allocated), "Unallocated", money(t.unallocated)]);
    else slots(legend, [undefined, money(t.expenses), undefined, money(project?.compensation), undefined, money(t.worker_pool)]);
    bar(layer(card, "Breakdown bar") || layer(card, "Bar"), [t.expenses || 0, project?.compensation || 0, t.allocated || 0, t.unallocated || 0]);
    match(card, [["2 of 5 tasks done", description], ["40%", percent + "%"]]);
    const reviewCard = layer(content, "Tasks awaiting review");
    taskReviewRows(reviewCard, review);
    const deadlines = layer(content, "Upcoming deadlines");
    match(deadlines, [["Upcoming deadlines", "Current tasks"]]);
    replaceEntries(deadlines, '[data-layer="Deadline"]', selectedTasks.slice(0, 4), (row, task) => {
      slots(row, [task.deadline ? new Date(task.deadline).toLocaleDateString(undefined, { month: "short" }).toUpperCase() : "TASK", task.deadline ? String(new Date(task.deadline).getDate()) : "•", task.title, task.workerName, taskStatus(task)]);
      rowLink(row, "c20", task.project, task);
    }, "No tasks scheduled.");
    replaceEntries(layer(content, "Workers requiring attention"), '[data-layer="Item"]', review.slice(0, 3), (row, task) => {
      slots(layer(row, "t"), [task.title, task.workerName + " · " + money(task.amount)]);
      rowLink(action(row, /.*/) || row, "c21", task.project, task);
    }, "No tasks need your attention.");
    activity(layer(content, "Agent activity"), activityItems.filter(item => item.task), '[data-layer="Step"]');
    activity(layer(content, "Recent transactions"), activityItems.filter(item => item.route === "c29"), '[data-layer="Transaction row"]');
    activity(layer(content, "Activity"), activityItems, '[data-layer="Step"]');
    const confirm = layer(content, "Needs you");
    if (confirm) {
      const task = confirmations[0];
      match(confirm, [["Confirm the bridal outfits", task ? "Confirm " + task.title : "No confirmations due"],
        [/Approved by Tola today/, task ? task.workerName + " · " + money(task.amount) : "Approved deliverables appear here when your confirmation is required."]]);
      const button = action(confirm, /review/i);
      if (button) { if (task) rowLink(button, "d06", task.project, task); else button.hidden = true; }
    }
    return;
  }

  if (route === "mc01" || route === "md01") {
    const card = layer(content, route === "mc01" ? "Funds summary" : "Project");
    slots(card, [name.toUpperCase(), money(funds) + " · " + state, undefined, number(paid), undefined, number(pending),
      undefined, number(available), route === "mc01" ? "Tap to see the full breakdown" : percent + "% done"]);
    rowLink(card, route === "mc01" ? "c10" : "d04", project);
    const mini = layers(content, "Mini stat");
    slots(mini[0], [undefined, projects.length, projectSummary]);
    slots(mini[1], [undefined, review.length, review[0]?.title || "No submissions"]);
    replaceEntries(layer(content, "Attention"), ':scope > [data-layer="Row"]', review.slice(0, 3), (row, task) => {
      slots(layer(row, "t") || row, [task.title, task.workerName + " · " + money(task.amount)]);
      rowLink(action(row, /.*/) || row, "c21", task.project, task);
    }, "No tasks need your attention.");
    const confirm = layer(content, "Confirm");
    const task = confirmations[0];
    slots(confirm, [task ? "Confirm " + task.title : "No confirmations due",
      task ? task.workerName + " · " + money(task.amount) : "Approved deliverables appear here."]);
    const button = action(confirm, /review/i);
    if (button) { if (task) rowLink(button, "d06", task.project, task); else button.hidden = true; }
    match(content, [["Budget change requested", "Project finances"], ["1,000 → 1,150 USDC for extra tables", money(project?.budget) + " agreed budget"]]);
    const finances = action(content, /^decide$/i);
    if (finances) put(paragraphs(finances).at(-1), "View finances");
    rowLink(finances, "d04", project);
    activity(layer(content, "Activity"), activityItems, ':scope > [data-layer="Row"]');
    return;
  }

  const workerMessage = tasks.length ? tasks.length + " assigned · " + complete + " approved" : "Assigned tasks and payment updates will appear here.";
  match(content, [[/^Hello, Amara$/, "Hello, " + firstName], [/^You have 1 task in review/, workerMessage]]);
  const wallet = layer(content, "My allocation");
  slots(wallet, route === "w01" ? [undefined, number(allocation), undefined, projectSummary, undefined, money(paid), undefined, money(pending)]
    : [undefined, number(allocation), undefined, undefined, money(paid), undefined, money(pending)]);
  match(content, [["Due soon", "In progress"]]);
  stats(content, [[tasks.length, projectSummary], [tasks.filter(x => x.status === "assigned").length, "In progress"],
    [tasks.filter(x => x.status === "submitted").length, "Submitted for review"], [complete, paidDetail]]);
  const next = layer(content, "Next");
  slots(next, [tasks[0] ? taskStatus(tasks[0]) : "No assigned work", tasks[0] ? tasks[0].title : workerMessage]);
  if (tasks[0]) rowLink(next, "w04", tasks[0].project, tasks[0]);
  workerTasks(layer(content, "Tasks"), route === "w01" ? ':scope > [data-layer="Task"]' : ':scope > [data-layer="Row"]', tasks.slice(0, 4));
  // The worker API intentionally does not provide project-wide financial amounts.
  const finances = layer(content, "Project finances") || layer(content, "Project");
  match(finances, [["Lagos Wedding Decoration", name], ["Total budget", "My agreed allocation"], ["1,000 USDC", money(allocation)],
    ["Funding", "Payout mode"], ["Fully funded", project ? state : "No project"], ["Approved expenses", "Verified paid"], ["Expenses", "Verified paid"],
    ["100 USDC", money(paid)], ["Worker pool", "Pending"], ["700 USDC", money(pending)],
    ["Worker pool paid so far", "My payouts"], [/^100.*700/, simulated ? money(simulated) + " simulated" : paidDetail],
    [/^You see the project totals/, "You see your own allocation and payments. Other workers’ amounts are private."]]);
  activity(layer(content, "Activity"), activityItems, '[data-layer="Step"]');
  match(layer(content, "Help"), [[/^Send Tola a voice note/, "Contact your contractor. Voice notes are unavailable."]]);
}
