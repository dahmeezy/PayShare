import { api } from "./api.mjs";
import { openDialog } from "./demo-interactions.mjs";
import { bindDashboard, bindIdentity } from "./live-dashboard.mjs";
import { bindApprovals, bindBudget, bindPayments, bindProjects, bindTaskList } from "./live-records.mjs";
import { bindTaskDetail, configureForm, configureProfile, fieldValue, input, validateFields } from "./live-details.mjs";
import { action, clean, context, empty, initials, labelAction, layer, layers, match, money, paragraphs, payoutStatus,
  put, replaceEntries, rowLink, slots, stats, taskStatus } from "./live-elements.mjs";

export const liveMode = new URLSearchParams(location.search).get("app") === "1";
const workspace = "/workspace";
const baseRoute = route => route.replace(/-(dark|360)$/, "");
const isDashboard = route => /^(m?[cwd])01$/.test(route);
const forms = new Set(["c03", "c04", "c05", "c09", "c14", "c16", "c19", "mc07", "w05", "mw06", "c21", "mc08", "d06", "md05", "d09", "c24", "mc09"]);
const routeGroups = {
  projects: new Set(["c02", "d02", "c06", "mc02", "d03", "md02", "c07"]),
  tasks: new Set(["c18", "w02", "mw02"]),
  budgets: new Set(["c10", "mc03", "mc04", "d04", "md03", "d05", "md04"]),
  approvals: new Set(["c23", "mc09"]),
  payments: new Set(["c29", "d08", "w12", "mw10"]),
  taskDetails: new Set(["c20", "w03", "w04", "mw03", "mw05", "w06", "w07", "c11"]),
};

const workerAllocation = new Set(["w08", "mw07"]);
const notifications = new Set(["c32", "mc10", "md07", "w13"]);
const shortcutRoutes = {
  "c06": { overview:"c06", tasks:"c18", budget:"c10", members:"c07", activity:"c31", settings:"c09" },
  "d03": { overview:"d03", finances:"d04", allocations:"d05", deliverables:"d06" },
  "mc02": { overview:"mc02", tasks:"c18", budget:"mc03", members:"c07", activity:"c31" },
  "md02": { overview:"md02", finances:"md03", allocations:"md04", deliverables:"md05" },
};
const cents = value => Math.round(Number(value) * 100);

export function liveApplication({ screen, render, roleFor, roles, announce }) {
  let user = null;
  let draft = {};
  let started = false;
  let onboarding = false;
  let inFlight = false;
  let capabilities = {};
  let startError = "";
  let invitationToken = sessionStorage.getItem("payshare-invitation") || "";
  let ignoredToken = "";
  let filter = "";
  let currentView = "";
  let selectionNotice = "";
  let data = context([]);

  function params() {
    return new URLSearchParams(location.hash.split("?")[1] || "");
  }
  function selectedRoute(route, project, task, extra = {}) {
    const query = new URLSearchParams();
    if (project?.id) query.set("project", project.id);
    if (task?.id) query.set("task", task.id);
    for (const [key, value] of Object.entries(extra)) query.set(key, value);
    return "#/" + route + (query.size ? "?" + query : "");
  }
  function go(route, project, task, extra) {
    const hash = selectedRoute(route, project, task, extra);
    if (location.hash === hash) render();
    else location.hash = hash;
  }
  function home() { go(roles[user.role].home); }
  function logout() {
    return api("/logout", "POST").then(() => {
      user = null;
      onboarding = false;
      draft = {};
      data = context([]);
      go("a03");
    });
  }
  function saveInvitation(token) {
    invitationToken = token;
    if (token) sessionStorage.setItem("payshare-invitation", token);
    else sessionStorage.removeItem("payshare-invitation");
  }
  function notice(scope, message) {
    let note = scope.querySelector(":scope > .live-message");
    if (!note) {
      note = document.createElement("p");
      note.className = "live-message";
      note.setAttribute("role", "status");
      scope.append(note);
    }
    note.textContent = message;
  }
  function execute(button, operation) {
    if (inFlight || screen.inert) return;
    inFlight = true;
    button?.setAttribute("aria-busy", "true");
    const host = layer(screen, "Modal") || layer(screen, "Form") || layer(screen, "Content") || screen;
    notice(host, "Working…");
    announce("Working…");
    void Promise.resolve().then(operation).then(message => {
      if (host.isConnected) notice(host, message || "");
      if (message) announce(message);
    }).catch(error => {
      if (error.status === 401 && user) {
        user = null;
        go("a03");
      } else if (host.isConnected) notice(host, error.message);
      announce(error.message);
    }).finally(() => {
      inFlight = false;
      button?.removeAttribute("aria-busy");
    });
  }
  function invitationControls(form) {
    const original = action(form, /join project/i);
    const fields = [...form.children].filter(node => ["Input", "Select"].includes(node.dataset.layer));
    fields.forEach(node => { node.hidden = true; });
    if (original) original.hidden = true;
    const caption = paragraphs(layer(form, "Invite"));
    for (const [index, value] of [[0, "PS"], [1, "PayShare invitation"], [2, "Private project link"], [3, "Invitation details"], [4, "Accept to join the project"]]) put(caption[index], value);
    match(form, [["Join as a worker", "Project invitation"],
      [/We’ve filled in|You won’t be asked/, "Open the private invitation link shared by your teammate."]]);
    if (!invitationToken) return;
    const token = invitationToken;
    void api(workspace + "/invitations/lookup", "POST", { token }).then(result => {
      if (!form.isConnected || token !== invitationToken) return;
      put(caption[2], result.name);
      put(caption[3], "Join as " + result.role);
      if (!user) {
        for (const [label, route] of [["Sign in to respond", "a03"], ["Create an account to respond", "a02"]]) {
          const link = document.createElement("a");
          link.href = "#/" + route;
          link.className = "btn btn-sm";
          link.textContent = label;
          form.append(link);
        }
        return;
      }
      match(form, [[/Open the private invitation link/, "Signed in as " + user.email]]);
      if (original) {
        original.hidden = false;
        labelAction(original, "Accept invitation");
      }
      const decline = document.createElement("button");
      decline.type = "button";
      decline.className = "btn btn-sm";
      decline.textContent = "Decline invitation";
      decline.addEventListener("click", () => execute(decline, () => respond("decline")));
      const signout = decline.cloneNode();
      signout.textContent = "Sign out";
      signout.addEventListener("click", () => execute(signout, logout));
      form.append(decline, signout);
    }).catch(error => { if (form.isConnected) notice(form, error.message); });
  }
  async function respond(decision) {
    await api(workspace + "/invitations/respond", "POST", { token: invitationToken, decision });
    ignoredToken = invitationToken;
    saveInvitation("");
    if (decision === "accept") {
      onboarding = true;
      go("a08");
    } else home();
    return "Invitation " + (decision === "accept" ? "accepted." : "declined.");
  }
  function offerInvite(result) {
    const link = new URL("/frontend/prototype.html?app=1#/join-" + result.token, location.origin).href;
    openDialog("Invitation ready", dialog => {
      const message = document.createElement("p");
      message.textContent = "Share this link privately. No message was sent.";
      const field = document.createElement("input");
      field.className = "live-input";
      field.readOnly = true;
      field.value = link;
      field.setAttribute("aria-label", "Invitation link");
      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "demo-dialog-button";
      copy.textContent = "Select invitation link";
      copy.addEventListener("click", () => { field.focus(); field.select(); });
      dialog.append(message, field, copy);
    });
  }
  function targetSelection(element) {
    const project = data.projects.find(p => p.id === element.dataset.liveProject) || data.project;
    const task = data.tasks.find(t => t.id === element.dataset.liveTask);
    if (element.dataset.liveExternal) {
      const url = new URL(element.dataset.liveExternal);
      if (url.origin === "https://stellar.expert") window.open(url, "_blank", "noopener,noreferrer");
    } else if (element.dataset.liveRoute === "profile") go("a08");
    else go(element.dataset.liveRoute, project, task, element.dataset.liveCreate ? { create:"1" } : {});
  }
  function recordClick(event) {
    const element = event.target.closest("[data-live-route], [data-live-external]");
    if (!element || !screen.contains(element) || element.closest("[inert], [hidden]")) return;
    if (event.type === "keydown" && (event.key !== "Enter" || element.matches("button,a"))) return;
    if (event.type === "click" && event.button !== 0) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    targetSelection(element);
  }
  screen.addEventListener("click", recordClick, true);
  screen.addEventListener("keydown", recordClick, true);

  function routeActions(route, content) {
    const { project, review, confirmations, ready } = data;
    if (route === "c01") {
      rowLink(action(content, /review submissions/i), review[0] ? "c21" : "c18", project, review[0]);
      rowLink(action(content, /^view budget$/i), "c10", project);
    }
    if (route === "d01") rowLink(action(content, /fund a project/i), "d09", project);
    if (route === "md01") {
      const header = layer(screen, "App bar");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn btn-sm live-outline";
      button.textContent = project ? "Fund project" : "Create project";
      rowLink(button, "d09", project);
      header?.append(button);
    }
    if (route === "d02" || (["d09", "d04", "md03"].includes(route) && project)) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn btn-sm live-outline";
      if (route === "d02") {
        button.textContent = "Create project";
        rowLink(button, "d09", project);
        button.dataset.liveCreate = "true";
      } else if (!project.members?.some(m => m.role === "contractor")) {
        button.textContent = "Invite contractor";
        rowLink(button, "c16", project);
      } else button.hidden = true;
      if (!button.hidden) (layer(content, "Actions") || layer(content, "Page header") || content).append(button);
    }
    if (["c10", "mc03"].includes(route)) {
      rowLink(action(content, /add allocation/i), "c19", project);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn btn-sm live-outline";
      button.textContent = "Manage budget";
      rowLink(button, "c09", project);
      (layer(content, "Actions") || content).append(button);
      if (route === "mc03") {
        const expense = button.cloneNode(true);
        expense.textContent = "Add expense";
        rowLink(expense, "c14", project);
        content.append(expense);
      }
    }
    if (route === "mc09" && ready[0]) {
      const authorize = action(screen, /authorize|simulation/i);
      if (authorize) rowLink(authorize, "c24", project, data.task || ready[0]);
    }
    if (["d04","md03"].includes(route) && capabilities.aiSummary && project) {
      const brief = document.createElement("button");
      brief.type = "button";
      brief.className = "btn btn-sm live-outline";
      brief.textContent = "Get AI status summary";
      brief.addEventListener("click", () => execute(brief, async () =>
        (await api(workspace + "/projects/" + project.id + "/ai-summary", "POST")).summary));
      (layer(content, "Actions") || content).append(brief);
    }
    if (["d03", "md02", "d04", "md03"].includes(route) && confirmations[0]) {
      rowLink(action(content, /confirm|review/i), "d06", project, confirmations[0]);
    }
    if (["c20", "w03", "w04", "mw03", "mw05", "c11"].includes(route) && data.task) {
      rowLink(action(content, /review submission/i), "c21", project, data.task);
    }
    const active = shortcutRoutes[route];
    if (active) {
      for (const tab of paragraphs(layer(content, "Tabs") || layer(content, "Chips"))) {
        const dest = active[clean(tab.textContent).toLowerCase()];
        if (dest) rowLink(tab.parentElement, dest, project);
      }
    }
  }

  function workers(route, content) {
    const { projects, project, tasks } = data;
    const members = [...new Map(projects.flatMap(p => (p.members || []).filter(m => m.role === "worker").map(m => [m.id, m]))).values()];
    const invites = projects.flatMap(p => (p.invitations || []).filter(i => i.role === "worker" && i.status === "pending"));
    const all = [...members.map(m => ({ ...m, status:"Active" })), ...invites.map(i => ({ name:i.email, status:"Invited" }))];
    let records = all.filter(m => /invited/i.test(filter) ? m.status === "Invited" : /active/i.test(filter) ? m.status === "Active" : true);
    if (/attention/i.test(filter)) records = records.filter(m => tasks.some(t => t.workerId === m.id && t.status === "submitted"));
    const selector = route === "mc06" ? ':scope > [data-layer="Row"]' : '[data-layer="Worker card"]';
    replaceEntries(layer(content, route === "mc06" ? "List" : "Grid"), selector, records, (card, member) => {
      if (route === "mc06") slots(card, [initials(member.name), member.name, "Worker", member.status]);
      else {
        slots(layer(card, "Head"), [initials(member.name), member.name, "Worker", member.status]);
        const own = tasks.filter(t => t.workerId === member.id);
        slots(layer(card, "Stats"), [undefined, own.length, undefined, money(own.reduce((s, t) => s + t.amount, 0)), undefined,
          money(own.filter(t => t.payout.status === "paid").reduce((s, t) => s + t.amount, 0))]);
      }
      const control = action(card, /view|more/i);
      const task = tasks.find(t => t.workerId === member.id);
      if (control && !task) control.hidden = true;
      else if (task) rowLink(control || card, route === "mc06" ? "c20" : "c17", task.project, task);
    }, "No workers to show.");
    match(layer(content, "Filters") || layer(content, "Chips"), [
      [/^All\s*\(?6\)?$/, "All (" + all.length + ")"], [/^Active\s*\(?4\)?$/, "Active (" + members.length + ")"],
      [/^Invited\s*\(?1\)?$/, "Invited (" + invites.length + ")"], [/Needs attention|Attention 2/, "Needs attention"],
    ]);
    if (!action(content, /^invite worker$/i)) {
      const card = layer(content, "Invite card");
      if (card) rowLink(card, "c16", project);
      else {
        const button = document.createElement("button");
        button.className = "btn btn-sm live-outline";
        button.textContent = "Invite worker";
        rowLink(button, "c16", project);
        content.append(button);
      }
    }
  }

  function bindAllocation(content) {
    const { project, tasks, allocation, paid, pending, simulated } = data;
    stats(content, [[money(allocation), "Your agreed pay"], [money(paid), "Verified payments"], [money(pending), "Awaiting payout"]]);
    slots(layer(content, "Mine"), [undefined, money(allocation), project?.name || "No project", undefined, money(paid), undefined, money(pending)]);
    for (const name of ["Change", "Wallet", "Payment status", "Project finances", "Project"]) {
      const area = layer(content, name);
      if (area) {
        [...area.children].slice(1).forEach(child => child.hidden = true);
        const detail = name === "Payment status" ? money(simulated) + " simulated · No funds moved" :
          name === "Wallet" ? (user.stellar_address || "Add your public wallet in Profile.") :
          name === "Change" ? "Allocation changes are unavailable." : "Only your allocation and payouts are available here.";
        empty(area, detail);
        match(area, [[/Change request.*/, "Allocation changes"], ["Lagos Wedding Decoration", project?.name || "No project"]]);
      }
    }
    const history = layer(content, "Allocation history") || layer(content, "Hist");
    if (history) {
      [...history.children].slice(1).forEach(child => child.hidden = true);
      if (!tasks.length) empty(history, "No allocations recorded.");
      for (const task of tasks) empty(history, task.title + " · " + money(task.amount) + " · " + payoutStatus(task.payout));
    }
  }

  function panelUnsupported(content, message) {
    if (!content) return;
    const pageHeader = layer(content, "Page header");
    for (const child of content.children) if (child !== pageHeader) child.hidden = true;
    match(pageHeader, [[/Lagos Wedding Decoration/, data.project?.name || "Projects"],
      [/Amara Okafor|Sew wedding outfits/, data.task?.title || ""]]);
    empty(content, message);
  }

  function bindOther(route, content) {
    if (route === "c33") {
      const profile = layer(content, "Profile");
      match(profile, [["TA", initials(user.name)], ["Tola Adeyemi", user.name], [/^Contractor ·/, "Contractor"], ["tola@studioadeyemi.ng", user.email],
        ["WhatsApp", "Payout wallet"], [/^\+234/, user.stellar_address || "Not configured"], ["Verified", "Email verification"], ["Email and phone", "Unavailable"]]);
      rowLink(profile, "profile");
      for (const name of ["Security", "Language"]) {
        const item = layer(content, name);
        if (item) {
          [...item.children].slice(1).forEach(child => child.hidden = true);
          empty(item, name === "Security" ? "Payment actions use your signed-in account. Two-step verification is unavailable." : "Additional language and delivery settings are unavailable.");
        }
      }
      const tab = paragraphs(layer(content, "Tabs")).find(p => clean(p.textContent) === "Profile");
      if (tab) rowLink(tab.parentElement, "profile");
      const save = action(content, /save changes/i);
      if (save) save.hidden = true;
      return;
    }
    if (route === "w11") {
      const txn = data.task?.payout;
      if (!txn?.transaction) return panelUnsupported(content, "This payout has no verified Stellar receipt.");
      match(content, [[/PS-00142/, "Payment receipt"], [/150(?:\.00)? USDC/, money(data.task.amount)],
        [/Sew wedding outfits/, data.task.title], ["Lagos Wedding Decoration", data.project?.name],
        [/^19 Nov.*/, txn.paidAt ? new Date(txn.paidAt).toLocaleString() : "—"],
        [/3c9a|7a3f|7e3a|^G[A-Z0-9…]{3,}/, txn.transaction],
        [/^150\.00$/, String(data.task.amount / 100)]]);
      const view = action(content, /stellar expert|explorer/i);
      if (view) view.dataset.liveExternal = txn.explorerUrl;
      else {
        const link = document.createElement("a");
        link.href = txn.explorerUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "View verified transaction";
        content.append(link);
      }
      return;
    }
    if (route === "c31" || route === "c08") {
      stats(content, [[data.tasks.filter(t => t.payout.status === "paid").length, "Verified payments"], [data.pending / 100 + " USDC", "Awaiting payout"],
        [data.tasks.filter(t => t.payout.status === "failed").length, "Unconfirmed"], ["—", "Timing not tracked"]]);
      const area = layer(content, "Log") || layer(content, "Timeline") || content;
      for (const item of [...area.children].slice(1)) item.hidden = true;
      for (const task of data.selectedTasks) empty(area, task.title + " · " + payoutStatus(task.payout));
      const rail = layer(content, "Rail");
      if (rail) rail.hidden = true;
      if (!data.selectedTasks.length) empty(area, "No project activity.");
      if (route === "c31" && user.role !== "worker") {
        const log = data.agentLog || [];
        empty(area, log.length ? "Payout agent decisions, newest first" : "The payout agent has not made any decisions yet.");
        for (const entry of log) {
          empty(area, new Date(entry.at).toLocaleString() + " · " + entry.message);
          for (const check of entry.checks) empty(area, "    " + (check.ok ? "✓ " : "✗ ") + check.label);
        }
        const unpaid = data.selectedTasks.filter(task => !["paid", "simulated"].includes(task.payout.status));
        const reason = task => task.acceptedAt === null ? "Task not accepted" : task.status === "assigned" ? "Work not submitted" :
          task.status === "submitted" ? "Awaiting your review" : taskStatus(task);
        replaceEntries(layer(content, "Now"), '[data-layer="r"]', unpaid, (row, task) =>
          slots(row, [initials(task.workerName), task.workerName + " · " + money(task.amount), reason(task), "Waiting"]), "No payments are waiting.");
      }
      if (capabilities.aiSummary && data.project) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "btn btn-sm live-outline";
        button.textContent = "Get AI status summary";
        button.addEventListener("click", () => execute(button, async () =>
          (await api(workspace + "/projects/" + data.project.id + "/ai-summary", "POST")).summary));
        area.append(button);
      }
      return;
    }
    if (notifications.has(route)) return panelUnsupported(content, "No notifications. Notification delivery is unavailable.");
    if (route === "c17" && data.task) {
      match(content, [["Amara Okafor", data.task.workerName], ["AO", initials(data.task.workerName)],
        ["Sew wedding outfits", data.task.title], [/^150 USDC$/, money(data.task.amount)]]);
      for (const child of [...content.children].slice(1)) child.hidden = true;
      empty(content, data.task.title + " · " + taskStatus(data.task) + " · " + money(data.task.amount));
      return;
    }
    if (["c25", "c26", "c27", "c28", "c30"].includes(route)) {
      const status = data.task?.payout;
      panelUnsupported(content, status ? payoutStatus(status) + " · " + money(data.task.amount) : "No payout selected.");
      if (status?.canReconcile && ["failed", "processing"].includes(status.status)) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "btn btn-sm";
        button.textContent = "Check Stellar confirmation";
        button.addEventListener("click", () => execute(button, async () => {
          await api(workspace + "/projects/" + data.project.id + "/tasks/" + data.task.id + "/reconcile", "POST", {});
          go("c29", data.project, data.task);
          return "Stellar payment confirmed.";
        }));
        content.append(button);
      }
      if (data.agentLog?.length) {
        const list = document.createElement("div");
        list.setAttribute("aria-label", "Payout agent log");
        content.append(list);
        for (const entry of data.agentLog.filter(item => item.taskId === data.task?.id)) {
          empty(list, new Date(entry.at).toLocaleString() + " · " + entry.message);
          for (const check of entry.checks) empty(list, (check.ok ? "✓ " : "✗ ") + check.label);
        }
      }
      return;
    }
    panelUnsupported(content, "This screen’s workflow is unavailable in the connected app.");
  }

  return {
    async start() {
      try {
        user = await api("/session");
        capabilities = await api(workspace + "/capabilities").catch(() => ({}));
      } catch (error) { if (error.status !== 401) startError = error.message; }
      started = true;
    },
    route(requested) {
      const token = requested.match(/^join-([\w-]{43})$/)?.[1];
      if (token && token !== ignoredToken && token !== invitationToken) saveInvitation(token);
      if ((token && invitationToken) || requested === "a06") return "a06";
      if (!user) {
        if (requested === "a07" && !draft.password) return "a02";
        return ["a01", "a02", "a03", "a04", "a05", "a07"].includes(requested) ? requested : "a03";
      }
      if (["a08", "a09", "a10"].includes(requested)) return requested;
      if (roleFor(requested) === user.role || (requested === "c16" && user.role === "client")) return requested;
      return roles[user.role].home;
    },
    accountRole() { return user?.role; },
    hash(route) {
      return roleFor(route) && user ? selectedRoute(route, data.project, data.task) : "#/" + route;
    },
    async prepare(route, isCurrent) {
      if (!isCurrent()) return;
      const normalized = baseRoute(route);
      if (currentView !== normalized) filter = "";
      currentView = normalized;
      if (!user || !roleFor(normalized) || !started) return;
      const query = params();
      const selected = query.get("project");
      const taskId = query.get("task");
      try {
        const projects = await api(workspace + "/projects");
        if (!isCurrent()) return;
        data = context(projects, selected, taskId);
        selectionNotice = data.selectionMissing ? "This project or task is unavailable. Choose a record from the list." : "";
        if (!taskId && !data.task) data.task = (normalized === "c21" || normalized === "mc08" ? data.review[0] :
          normalized === "d06" || normalized === "md05" ? data.confirmations[0] :
          normalized === "c24" || normalized === "mc09" ? data.ready[0] : null) || data.selectedTasks[0];
        startError = "";
        if (["c31", "c08", "c25", "c26", "c27", "c28", "c30"].includes(normalized) && data.project && user.role !== "worker") {
          data.agentLog = await api(workspace + "/projects/" + data.project.id + "/agent-log").catch(() => []);
        }
        // A worker must accept the agreed terms before working: unaccepted tasks open the accept screen.
        const pending = data.task;
        if (user.role === "worker" && pending && pending.acceptedAt === null && !pending.declinedAt && pending.status === "assigned"
          && ["w04", "mw03"].includes(normalized)) {
          go(normalized === "mw03" ? "mw05" : "w03", pending.project, pending);
          return;
        }
      } catch (error) {
        if (!isCurrent()) return;
        data = context([]);
        startError = error.message;
        if (error.status === 401) { user = null; go("a03"); }
      }
    },
    search(query) {
      const phrase = clean(query).toLowerCase();
      if (!phrase) return announce("Enter a project or task name.");
      openDialog("Search PayShare", dialog => {
        const projects = data.projects.filter(project => project.name.toLowerCase().includes(phrase));
        const tasks = data.tasks.filter(task => (task.title + " " + task.workerName).toLowerCase().includes(phrase));
        if (!projects.length && !tasks.length) empty(dialog, "No matching projects or tasks.");
        const add = (text, route, project, task) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "demo-dialog-button";
          button.textContent = text;
          button.addEventListener("click", () => { dialog.close(); go(route, project, task); });
          dialog.append(button);
        };
        const projectRoute = { contractor:"c06", client:"d03", worker:"w02" }[user.role];
        const taskRoute = { contractor:"c20", client:"d06", worker:"w04" }[user.role];
        for (const project of projects) add(project.name, projectRoute, project);
        for (const task of tasks) add(task.title, taskRoute, task.project, task);
      });
    },
    openProfile() { go("a08"); },
    logout(button) { execute(button, logout); },
    handle(button, labelText, displayed, scope, target, authoredLayer) {
      const route = baseRoute(displayed);
      const label = clean(labelText).toLowerCase();
      const value = name => fieldValue(screen, name);
      const { project, task, projects, ready } = data;
      const base = project && workspace + "/projects/" + project.id;
      const taskPath = task && base + "/tasks/" + task.id;
      const missing = message => { notice(layer(screen, "Modal") || layer(screen, "Content") || scope, message); announce(message); return true; };
      const run = (operation, check = false) => {
        if (!check || validateFields(layer(screen, "Modal") || screen)) execute(button, operation);
        return true;
      };
      const afterAuth = async registered => {
        capabilities = await api(workspace + "/capabilities").catch(() => ({}));
        if (invitationToken) go("a06");
        else if (registered) { onboarding = true; go("a08"); }
        else home();
      };
      if (route === "a02" && label === "create account") {
        draft = { name:value("Full name"), email:value("Email address"), password:screen.querySelector('[aria-label="Create a password"]')?.value };
        if (!invitationToken) { go("a07"); return true; }
        return run(async () => {
          user = await api("/register", "POST", { ...draft, invitationToken });
          draft = {};
          await afterAuth(true);
        }, true);
      }
      if (route === "a07" && label === "continue") return run(async () => {
        const role = screen.querySelector('[data-demo-role][aria-checked="true"]')?.dataset.demoRole;
        if (!role || !draft.password) throw new Error("Choose an account role first.");
        user = await api("/register", "POST", { ...draft, role });
        draft = {};
        await afterAuth(true);
      });
      if (route === "a03" && label === "log in" && button.hasAttribute("data-submit")) return run(async () => {
        user = await api("/login", "POST", { email:value("Email address"), password:screen.querySelector('[aria-label="Password"]')?.value });
        await afterAuth(false);
      }, true);
      if (route === "a03" && label.includes("login code")) return missing("WhatsApp login is unavailable. Use your password.");
      if (route === "a04" && label === "send reset link") return run(async () =>
        (await api("/forgot", "POST", { email:value("Email address") })).message, true);
      if (route === "a05") {
        if (target === "a03" || target === "@back") return false;
        return missing("Account verification is unavailable. No message was sent.");
      }
      if (route === "a06" && label === "join project") return run(() => respond("accept"));
      if (route === "a08") {
        if (label === "continue") return run(async () => {
          user = await api("/profile", "PUT", { name:value("Profile name"), stellarAddress:value("Public Stellar wallet") });
          if (onboarding) go("a09");
          else home();
        }, true);
        if (label === "skip for now") { if (onboarding) go("a09"); else home(); return true; }
      }
      if (route === "a09" && /skip|continue|enable|turn on|finish setup/.test(label)) {
        go("a10");
        return true;
      }
      if (route === "a10" && /go to dashboard|start exploring|got it|continue/.test(label)) {
        onboarding = false;
        home();
        return true;
      }
      if (target === "@logout" || (user && /^(sign out|log out)$/.test(label))) return run(logout);
      if (!user || (!roleFor(route) && !["a08","a09","a10"].includes(route))) return false;

      if (["@theme", "@light", "@dark", "@system", "@role-menu", "@settings", "@back"].includes(target)) return false;
      if (/close|^cancel$/.test(label) || authoredLayer === "Close") {
        if (["c16", "c14"].includes(route)) { go(route === "c14" ? "c10" : user.role === "client" ? "d09" : "c15", project); return true; }
        return false;
      }
      if (authoredLayer === "Project switcher") {
        openDialog("Switch project", dialog => {
          if (!projects.length) empty(dialog, "No projects to switch to.");
          for (const item of projects) {
            const nav = document.createElement("button");
            nav.type = "button";
            nav.className = "demo-dialog-button";
            nav.textContent = item.name;
            nav.addEventListener("click", () => { dialog.close(); go(roles[user.role].home, item); });
            dialog.append(nav);
          }
        });
        return true;
      }
      if (route === "c03" && label === "continue to budget") {
        if (validateFields(screen)) { draft = { name:value("Project name") }; go("c04"); }
        return true;
      }
      if (route === "c04" && label === "continue to workers") return run(async () => {
        if (!draft.name) { go("c03"); return; }
        const budget = cents(value("Total project budget (USDC)"));
        const newProject = await api(workspace + "/projects", "POST", { name:draft.name, budget, mode:value("Project mode") });
        draft = {};
        const compensation = cents(value("Your compensation (USDC)"));
        if (compensation) {
          try { await api(workspace + "/projects/" + newProject.id + "/budget", "PUT", { budget, compensation }); }
          catch (error) { announce("Project created. Compensation was not saved: " + error.message); }
        }
        go("c05", newProject);
      }, true);
      if (route === "c05" && label === "skip for now") { go("c06", project); return true; }
      if (route === "d09" && label.startsWith("fund")) return run(async () => {
        if (!project || params().has("create")) {
          const result = await api(workspace + "/projects", "POST", {
            name:value("Project name"), budget:cents(value("Project budget (USDC)")), mode:value("Project mode"),
          });
          go("d09", result);
          return "Project created.";
        }
        await api(base + "/funding", "POST", { amount:cents(value("Funding amount (USDC)")), transaction:value("Stellar transaction hash") || undefined });
        go("d04", project);
        return project.mode === "preview" ? "Simulated funding recorded." : "Testnet funding verified.";
      }, true);
      if (["c05", "c16"].includes(route) && /send.*invite/.test(label)) return run(async () => {
        const chosen = projects.find(p => p.id === value("Project")) || project;
        if (!chosen) throw new Error("Create a project first.");
        const result = await api(workspace + "/projects/" + chosen.id + "/invitations", "POST", { role:value("Invitation role"), email:value("Invite email") });
        offerInvite(result);
        return "Invitation created.";
      }, true);
      if (route === "c09" && /^save changes/.test(label)) return run(async () => {
        if (!base) throw new Error("Choose a project first.");
        await api(base + "/budget", "PUT", { budget:cents(value("Total project budget (USDC)")), compensation:cents(value("Your compensation (USDC)")) });
        go("c10", project);
        return "Budget saved.";
      }, true);
      if (route === "c14" && /send.*approval|save expense/.test(label)) return run(async () => {
        if (!base) throw new Error("Choose a project first.");
        await api(base + "/expenses", "POST", { description:value("Expense description"), amount:cents(value("Amount (USDC)")) });
        go("c10", project);
        return "Expense recorded.";
      }, true);
      if (["c19", "mc07"].includes(route) && /send (?:task )?to|create task/.test(label)) return run(async () => {
        if (!base) throw new Error("Choose a project first.");
        const { id } = await api(base + "/tasks", "POST", { workerId:value("Assign to"), title:value("Task title"),
          description:value("Task description"), allocation:cents(value("Agreed payment (USDC)")),
          clientApprovalRequired:!!screen.querySelector('[data-live-field="Client confirmation"]')?.checked });
        go("c20", project, { id });
        return "Task assigned.";
      }, true);
      const sendTask = route === "w05" || route === "mw06";
      const reviewTask = route === "c21" || route === "mc08";
      const confirmTask = route === "d06" || route === "md05";
      if (sendTask && label.includes("submit for review")) return run(async () => {
        if (!taskPath) throw new Error("Choose a task first.");
        await api(taskPath + "/submission", "POST", { notes:value("Submission notes or work link") });
        go("w06", project, task);
        return "Work submitted.";
      }, true);
      if (reviewTask && /approve|request changes/.test(label)) return run(async () => {
        if (!taskPath) throw new Error("Choose a submitted task first.");
        const approved = /^approve/.test(label);
        await api(taskPath + "/review", "POST", { decision:approved ? "approved" : "rejected", notes:value("Review notes") });
        go("c23", project, task);
        return approved ? "Work approved." : "Changes requested.";
      });
      if (confirmTask && /^confirm|^approve/.test(label)) return run(async () => {
        if (!taskPath) throw new Error("Choose a deliverable first.");
        await api(taskPath + "/confirm", "POST", {});
        home();
        return "Deliverable confirmed.";
      });
      if (route === "c24" && /^authorize/.test(label)) return run(async () => {
        const payout = task || ready[0];
        if (!payout || !base) throw new Error("No payout is eligible.");
        const pin = value("Payout PIN") || value("Create a 6-digit payout PIN");
        if (!/^\d{6}$/.test(pin)) throw new Error("Enter your 6-digit payout PIN.");
        if (!capabilities.payoutPinSet) {
          await api(workspace + "/pin", "PUT", { pin });
          capabilities.payoutPinSet = true;
        }
        try { await api(base + "/tasks/" + payout.id + "/payout", "POST", { pin }); }
        catch (error) {
          if (error.status === 502) go("c27", project, payout);
          throw error;
        }
        go("c29", project, payout);
        return project.mode === "preview" ? "Simulated payout. No funds moved." : "Stellar payment verified.";
      });
      if (["w03", "mw05"].includes(route) && /^accept/.test(label)) return run(async () => {
        if (!taskPath) throw new Error("Choose a task first.");
        await api(taskPath + "/accept", "POST", { decision: "accept" });
        go("w04", project, task);
        return "Task and agreed payment accepted.";
      }, true);
      if (["w03", "mw05"].includes(route) && /^(decline|reject)/.test(label)) return run(async () => {
        if (!taskPath) throw new Error("Choose a task first.");
        await api(taskPath + "/accept", "POST", { decision: "decline", reason: value("Reason") || undefined });
        home();
        return "Task declined.";
      }, true);
      if (["Tab", "Chip"].includes(authoredLayer) && (routeGroups.tasks.has(route) || routeGroups.payments.has(route) || ["c15","mc06"].includes(route))) {
        filter = label;
        render();
        return true;
      }
      if (target && !target.startsWith("@") &&
          (!/whatsapp|^wa\d/.test(target)) && (roleFor(target) === user.role || (target === "c16" && user.role === "client"))) {
        go(target, project, task);
        return true;
      }
      if (target === "@home" || (authoredLayer === "Logo" && user)) { home(); return true; }
      if (/profile|payout wallet/.test(label) && route === "c33") { go("a08"); return true; }
      return missing("This action is unavailable in the connected app.");
    },

    install(displayed) {
      const route = baseRoute(displayed);
      const content = layer(screen, "Content");
      const form = layer(screen, "Form");
      if (route === "a01") match(screen, [["Lagos Wedding Decoration", "Sample project · Lagos Wedding Decoration"]]);
      if (["a02", "a03", "a04"].includes(route)) {
        if (route === "a02") input(form, "Full name", { required:true });
        input(form, "Email address", { oldLabel:"Email or WhatsApp number", type:"email", required:true });
        const hint = layer(form, "h") || form;
        match(hint, [[/Use your email or WhatsApp/, "Use your email address."],
          [/We’ll send a reset link/, "Password recovery is unavailable without a delivery service."]]);
        form?.querySelector('[data-figma="31:351"]')?.parentElement.remove();
        if (route === "a04") labelAction(action(form, /send reset link/i), "Check recovery availability");
        if (startError) notice(form || screen, startError);
      }
      if (route === "a05") {
        match(form, [[/Demo code/, "Verification delivery is unavailable. No message was sent."], ["Show demo code", "Delivery unavailable"]]);
        for (const field of form.querySelectorAll("input")) field.disabled = true;
      }
      if (route === "a06") invitationControls(form);
      if (route === "a08" && user) configureProfile(screen, user, onboarding);
      if (route === "a09" && form) {
        for (const item of form.querySelectorAll('input,select,[role="switch"]')) item.disabled = true;
        match(form, [["How should we reach you?", "Notification preferences"], [/Agreements and payments always stay/, "Notification delivery is unavailable. Continue to your dashboard."],
          [/Task invites, reminders|Receipts and weekly|Always on|Only if WhatsApp/, "Unavailable"]]);
      }
      if (route === "a10" && user) {
        const sidebar = layer(screen, "Sidebar");
        if (sidebar && user.role !== "contractor") sidebar.hidden = true;
        match(content, [[/^Welcome, Tola!/, "Welcome, " + user.name.split(/\s+/)[0] + "!"],
          [/Workers accept before/, "Workers can view and submit their tasks."], [/By WhatsApp or email|They get a secure link/, "Share a private invitation manually."],
          [/Once work is approved/, "The agent checks the budget, approvals and payment history before an authorized payout."]]);
        if (user.role !== "contractor") {
          const list = layer(content, "Checklist");
          for (const item of [...(list?.children || [])].slice(1)) item.hidden = true;
          empty(list, user.role === "worker" ? "Open your dashboard to see assigned work and payments." : "Open your dashboard to create or fund a project.");
        }
        labelAction(action(content, /^got it$/i), "Go to dashboard");
      }
      if (!user || !roleFor(route) || !content) return;
      if (route === "c16" && user.role === "client") {
        layer(screen, "Sidebar").hidden = true;
        const body = layer(screen, "Main");
        if (body) body.setAttribute("aria-label", "Client invitation");
      }
      bindIdentity(screen, user, data);
      if (!isDashboard(route)) for (const title of paragraphs(layer(content, "Page header"))) {
        title.textContent = title.textContent.replaceAll("Lagos Wedding Decoration", data.project?.name || "Projects");
      }
      if (startError || selectionNotice) empty(content, startError || selectionNotice, content.firstChild);
      if (isDashboard(route)) bindDashboard(screen, route, user, data);
      else if (routeGroups.projects.has(route)) bindProjects(screen, route, data);
      else if (routeGroups.tasks.has(route)) bindTaskList(content, route, data, filter);
      else if (routeGroups.budgets.has(route)) bindBudget(content, route, data);
      else if (routeGroups.approvals.has(route)) bindApprovals(content, route, data);
      else if (routeGroups.payments.has(route)) bindPayments(content, route, data, filter);
      else if (routeGroups.taskDetails.has(route)) bindTaskDetail(screen, route, data);
      else if (workerAllocation.has(route)) bindAllocation(content);
      else if (["c15", "mc06"].includes(route)) workers(route, content);
      else if (route === "c16") { if (user.role === "contractor") workers("c15", content); else panelUnsupported(content, "Create a private invitation link."); }
      else if (route === "c14") bindBudget(content, "c10", data);
      else if (!forms.has(route)) bindOther(route, content);
      if (forms.has(route)) configureForm(screen, route, data, user, { capabilities, draft, create:params().has("create") });
      routeActions(route, content);
      if (routeGroups.tasks.has(route) || routeGroups.payments.has(route) || ["c15", "mc06"].includes(route)) {
        const tabs = layer(content, "Tabs") || layer(content, "Chips") || layer(content, "Filters");
        for (const chip of [...(tabs?.children || [])]) {
          if (chip.querySelector("input")) continue;
          const caption = clean(paragraphs(chip)[0]?.textContent || "").toLowerCase().replace(/\s*\(?\d+\)?$/, "");
          if (!caption) continue;
          if (!chip.matches("a,button")) {
            chip.role = "button";
            chip.tabIndex = 0;
            const select = () => { filter = caption; render(); };
            chip.addEventListener("click", select);
            chip.addEventListener("keydown", event => {
              if (event.key === " " || event.key === "Enter") { event.preventDefault(); select(); }
            });
          }
          const selected = filter ? filter.startsWith(caption) : caption === "all";
          chip.setAttribute("aria-pressed", String(selected));
          const indicator = layer(chip, "Indicator");
          if (indicator) indicator.classList.toggle("f45", selected);
        }
      }
    },
  };
}
