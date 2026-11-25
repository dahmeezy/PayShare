import { api } from "./api.mjs";
import { rendersAuth, renderAuth } from "./auth-screens.mjs";
import { renderNotifications } from "./notifications-screen.mjs";
import { renderSettings } from "./settings.mjs";
import { rendersTask, renderTask } from "./task-screens.mjs";
import { closeTour, startTour, tourOpen } from "./tour.mjs";
import { openDialog } from "./demo-interactions.mjs";
import { bindDashboard, bindIdentity } from "./live-dashboard.mjs";
import { bindApprovals, bindBudget, bindPayments, bindProjects, bindTaskList } from "./live-records.mjs";
import { configureForm, fieldValue, validateFields } from "./live-details.mjs";
import { tidy } from "./live-cleanup.mjs";
import { action, clean, context, empty, initials, labelAction, layer, layers, match, money, paragraphs, payoutStatus,
  put, replaceEntries, rowLink, slots, stats, taskStatus } from "./live-elements.mjs";

export const liveMode = new URLSearchParams(location.search).get("app") === "1";
const workspace = "/workspace";
const baseRoute = route => route.replace(/-(dark|360)$/, "");
const isDashboard = route => /^(m?[cwd])01$/.test(route);
const forms = new Set(["c03", "c04", "c05", "c09", "c14", "c16", "d09", "mc09"]);
const routeGroups = {
  projects: new Set(["c02", "d02", "c06", "mc02", "d03", "md02", "c07"]),
  tasks: new Set(["c18", "w02", "mw02"]),
  budgets: new Set(["c10", "mc03", "mc04", "d04", "md03", "d05", "md04"]),
  approvals: new Set(["c23", "mc09"]),
  payments: new Set(["c29", "d08", "w12", "mw10"]),
};

const workerAllocation = new Set(["w08", "mw07"]);
const notifications = new Set(["c32", "mc10", "md07", "w13", "d10"]);
const settingsRoutes = { contractor: "c33", worker: "w33", client: "d33" };
const isSettings = route => Object.values(settingsRoutes).includes(route);
const publicRoutes = ["a01", "a02", "a03", "a04"];
const shortcutRoutes = {
  "c06": { overview:"c06", tasks:"c18", budget:"c10", members:"c07", activity:"c31", settings:"c09" },
  "d03": { overview:"d03", finances:"d04", allocations:"d05", deliverables:"d06" },
  "mc02": { overview:"mc02", tasks:"c18", budget:"mc03", members:"c07", activity:"c31" },
  "md02": { overview:"md02", finances:"md03", allocations:"md04", deliverables:"md05" },
};
const cents = value => Math.round(Number(value) * 100);

export function liveApplication({ screen, render, roleFor, roles, announce, setAppearance, appearance }) {
  let user = null;
  let draft = {};
  let started = false;
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
  function logout(next = "a03") {
    return api("/logout", "POST", {}).then(() => {
      closeTour();
      user = null;
      draft = {};
      capabilities = {};
      data = context([]);
      go(next);
    });
  }
  // Every response that describes the account passes through here.
  function adopt(latest) {
    user = latest;
    const { appearance: theme, textSize } = latest.preferences;
    if (theme && theme !== appearance()) setAppearance(theme, { redraw: false });
    document.documentElement.dataset.demoTextSize = textSize === "default" ? "" : textSize;
    return user;
  }
  const canUse = () => user && !user.verificationRequired && user.role;
  async function loadCapabilities() {
    capabilities = canUse() ? await api(workspace + "/capabilities").catch(() => ({})) : {};
  }
  // Where an account belongs next: verification, role, invitation, setup, then its dashboard.
  function nextStep() {
    if (user.verificationRequired) return "a05";
    if (!user.role) return "a07";
    if (invitationToken) return "a06";
    return user.onboarded ? roles[user.role].home : "a08";
  }
  async function signedIn(latest) {
    adopt(latest);
    await loadCapabilities();
    go(nextStep());
  }
  async function finished(latest) {
    adopt(latest);
    await loadCapabilities();
    home();
  }
  function beginTour() {
    startTour({ screen, role: user.role, onEnd: async status => adopt(await api("/onboarding/tour", "POST", { status })) });
  }
  function openSettings(tab) { go(settingsRoutes[user.role], data.project, undefined, tab ? { tab } : {}); }
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
      match(form, [[/^Join as a worker$|^Project invitation$/, "Join " + result.name]]);
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
    if (decision === "accept") await loadCapabilities();
    if (user.onboarded) home();
    else go("a08");
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
    } else if (element.dataset.liveRoute === "profile") openSettings("profile");
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

  function bindOther(route, content) {
    if (route === "c31") {
      stats(content, [[data.tasks.filter(t => t.payout.status === "paid").length, "Verified payments"], [money(data.pending), "Awaiting payout"],
        [data.tasks.filter(t => t.payout.status === "failed").length, "Unconfirmed"],
        [(data.agentLog || []).filter(entry => entry.outcome === "blocked").length, "Attempts the agent stopped"]]);
      const area = layer(content, "Log") || content;
      for (const item of [...area.children].slice(1)) item.hidden = true;
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
      if (capabilities.aiSummary && data.project) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "btn btn-sm live-outline";
        button.textContent = "Get AI status summary";
        button.addEventListener("click", () => execute(button, async () =>
          (await api(workspace + "/projects/" + data.project.id + "/ai-summary", "POST")).summary));
        area.append(button);
      }
    }
  }

  return {
    async start() {
      try {
        adopt(await api("/session"));
        await loadCapabilities();
      } catch (error) { if (error.status !== 401) startError = error.message; }
      started = true;
    },
    route(requested) {
      const token = requested.match(/^join-([\w-]{43})$/)?.[1];
      if (token && token !== ignoredToken && token !== invitationToken) saveInvitation(token);
      const joining = Boolean(token && invitationToken) || requested === "a06";
      if (!user) {
        if (joining) return "a06";
        return publicRoutes.includes(requested) ? requested : "a03";
      }
      if (user.verificationRequired) return "a05";
      if (!user.role) return "a07";
      if (joining) return "a06";
      if (!user.onboarded) {
        if (["a08", "a09"].includes(requested) || (requested === "a07" && !user.invited)) return requested;
        return invitationToken ? "a06" : "a08";
      }
      if (requested === "a08" || requested === "profile") return settingsRoutes[user.role];
      if (requested === "a09") return settingsRoutes[user.role];
      if (requested === "md07" && user.role === "client") return "d10";
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
      if (!isDashboard(normalized)) closeTour();
      if (!canUse() || !roleFor(normalized) || !started) return;
      const query = params();
      const selected = query.get("project");
      const taskId = query.get("task");
      try {
        const projects = await api(workspace + "/projects");
        if (!isCurrent()) return;
        const feed = await api(workspace + "/notifications").catch(() => null);
        if (!isCurrent()) return;
        data = { ...context(projects, selected, taskId), feed };
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
    openSettings,
    logout(button) { execute(button, () => logout()); },
    saveAppearance(value) {
      if (canUse()) api("/preferences", "PUT", { appearance: value }).then(adopt).catch(error => announce(error.message));
    },
    handle(button, labelText, displayed, scope, target, authoredLayer) {
      const route = baseRoute(displayed);
      const label = clean(labelText).toLowerCase();
      const value = name => fieldValue(screen, name);
      const { project, task, projects } = data;
      const base = project && workspace + "/projects/" + project.id;
      const missing = message => { notice(layer(screen, "Modal") || layer(screen, "Content") || scope, message); announce(message); return true; };
      const run = (operation, check = false) => {
        if (!check || validateFields(layer(screen, "Modal") || screen)) execute(button, operation);
        return true;
      };
      if (route === "a06" && label === "join project") return run(() => respond("accept"));
      if (target === "@logout" || (user && /^(sign out|log out)$/.test(label))) return run(() => logout());
      if (!canUse() || !roleFor(route)) return false;
      if (authoredLayer === "Help") { beginTour(); return true; }
      if (target === "@settings") { openSettings(); return true; }

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
      if (["Tab", "Chip"].includes(authoredLayer) && (routeGroups.tasks.has(route) || routeGroups.payments.has(route) || ["c15","mc06","mc09"].includes(route))) {
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
      return missing("This action is unavailable in the connected app.");
    },

    install(displayed) {
      const route = baseRoute(displayed);
      const content = layer(screen, "Content");
      const form = layer(screen, "Form");
      if (route === "a01") match(screen, [["Lagos Wedding Decoration", "Sample project · Lagos Wedding Decoration"]]);
      if (route === "a01") match(screen, [[/^Works with WhatsApp/, "In English · WhatsApp updates are not available yet"]]);
      if (route === "a07") match(screen, [[/^You can join other projects/, "Pick the role that matches how you work."]]);
      if (rendersAuth(route) && (user || publicRoutes.includes(route))) {
        const invitation = route === "a02" && invitationToken
          ? api(workspace + "/invitations/lookup", "POST", { token: invitationToken }).catch(() => null) : null;
        renderAuth(screen, route, { user, signedIn, finished, invitation, problem: startError,
          updated: adopt, go, signOut: next => logout(next).catch(error => announce(error.message)) });
        return;
      }
      if (route === "a06") invitationControls(form);
      if (!canUse() || !roleFor(route)) return;
      if (rendersTask(route)) {
        // Phone frames without a content area are rebuilt by the task screen itself.
        bindIdentity(screen, user, data);
        renderTask(screen, route, { user, data, capabilities, problem: startError || selectionNotice, roleHome: roles[user.role].home,
          home, open: (destination, project, task) => go(destination, project || data.project, task) });
        return;
      }
      if (!content) return;
      if (route === "c16" && user.role === "client") {
        layer(screen, "Sidebar").hidden = true;
        const body = layer(screen, "Main");
        if (body) body.setAttribute("aria-label", "Client invitation");
      }
      bindIdentity(screen, user, data);
      const bell = layer(screen, "Bell");
      if (bell && !layer(bell, "icon/check")) {
        const unread = data.feed?.unread || 0;
        for (const dot of [...bell.children].slice(1)) dot.remove();
        bell.classList.toggle("ps-unread", unread > 0);
        bell.setAttribute("aria-label", unread ? "Notifications, " + unread + " unread" : "Notifications");
      }
      for (const item of layers(screen, "Sidebar item")) {
        if (paragraphs(item)[0]?.textContent !== "Notifications") continue;
        const badge = layer(item, "Count");
        if (!badge) continue;
        badge.hidden = !data.feed?.unread;
        put(paragraphs(badge)[0], data.feed?.unread);
      }
      if (isSettings(route)) {
        renderSettings(content, { route, user, capabilities, tab: params().get("tab"), appearance, setAppearance,
          updated: adopt, logout: control => execute(control, () => logout()), startTour: () => { home(); setTimeout(beginTour, 250); } });
        return;
      }
      if (notifications.has(route)) {
        renderNotifications(content, { feed: data.feed, role: user.role, refresh: () => render(),
          settingsHref: "#/" + settingsRoutes[user.role] + "?tab=notifications",
          open: (destination, item) => {
            const project = data.projects.find(entry => entry.id === item.projectId);
            go(destination, project, item.taskId ? { id: item.taskId } : undefined);
          } });
        return;
      }
      if (!isDashboard(route)) for (const title of paragraphs(layer(content, "Page header"))) {
        title.textContent = title.textContent.replaceAll("Lagos Wedding Decoration", data.project?.name || "Projects");
      }
      if (startError || selectionNotice) empty(content, startError || selectionNotice, content.firstChild);
      if (isDashboard(route)) bindDashboard(screen, route, user, data);
      else if (routeGroups.projects.has(route)) bindProjects(screen, route, data);
      else if (routeGroups.tasks.has(route)) bindTaskList(content, route, data, filter);
      else if (routeGroups.budgets.has(route)) bindBudget(content, route, data);
      else if (routeGroups.approvals.has(route)) bindApprovals(content, route, data, filter);
      else if (routeGroups.payments.has(route)) bindPayments(content, route, data, filter);
      else if (workerAllocation.has(route)) bindAllocation(content);
      else if (["c15", "mc06"].includes(route)) workers(route, content);
      else if (route === "c16") { if (user.role === "contractor") workers("c15", content); else {
        // A client invites from the funding page, so the worker list behind the pop-up is not theirs.
        for (const child of content.children) child.hidden = true;
      } }
      else if (route === "c14") bindBudget(content, "c10", data);
      else if (!forms.has(route)) bindOther(route, content);
      if (forms.has(route)) configureForm(screen, route, data, user, { capabilities, draft, create:params().has("create") });
      routeActions(route, content);
      tidy(screen, route, user, data);
      if (isDashboard(route) && user.onboarded && user.tourPending && !tourOpen()) {
        // Wait for the finished screen so the tour can point at its navigation.
        setTimeout(() => { if (user?.tourPending && screen.dataset.route.startsWith(displayed) && !tourOpen()) beginTour(); }, 150);
      }
      if (routeGroups.tasks.has(route) || routeGroups.payments.has(route) || ["c15", "mc06", "mc09"].includes(route)) {
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
          const selected = filter ? clean(filter).toLowerCase().startsWith(caption) : caption === (route === "mc09" ? "ready" : "all");
          chip.setAttribute("aria-pressed", String(selected));
          const indicator = layer(chip, "Indicator");
          if (indicator) indicator.classList.toggle("f45", selected);
        }
      }
    },
  };
}
