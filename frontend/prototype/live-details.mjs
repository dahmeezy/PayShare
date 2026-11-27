import { action, empty, initials, labelAction, layer, layers, match, money, number,
  put, replaceEntries, slots } from "./live-elements.mjs";

export function input(root, label, options = {}) {
  const candidates = [...(root?.querySelectorAll("input,select,textarea") || [])];
  let control = candidates.find(node => options.oldLabel === node.getAttribute("aria-label") || label === node.getAttribute("aria-label"));
  if (!control && options.holder) {
    control = layer(options.holder, "Field")?.querySelector("input,textarea,select");
  }
  if (!control && options.holder) {
    const holder = options.holder;
    const field = layer(holder, "Field") || holder;
    const sample = field.querySelector("p");
    control = document.createElement(options.type === "textarea" ? "textarea" : options.choices ? "select" : "input");
    control.className = (sample?.className || "") + " demo-input live-input";
    if (sample) sample.replaceWith(control);
    else field.append(control);
  }
  if (!control && root) {
    const wrapper = document.createElement("label");
    wrapper.className = "live-field";
    wrapper.textContent = label;
    control = document.createElement(options.choices ? "select" : options.type === "textarea" ? "textarea" : "input");
    control.className = "live-input";
    wrapper.append(control);
    (options.before?.parentElement || root).insertBefore(wrapper, options.before || null);
  }
  if (!control) return;
  if (options.type && options.type !== "textarea" && control.tagName === "INPUT") control.type = options.type;
  if (control.type === "number") {
    control.min = options.zero ? "0" : "0.01";
    control.step = ".01";
    control.max = "10000000";
  }
  control.setAttribute("aria-label", label);
  control.dataset.liveField = label;
  if (options.oldLabel && options.oldLabel !== label) {
    const holder = control.closest('[data-layer="Input"], [data-layer="Select"]');
    const caption = holder && [...holder.children].find(n => n.tagName === "P");
    put(caption, label);
  }
  delete control.dataset.contact;
  control.required = options.required ?? false;
  control.disabled = false;
  control.removeAttribute("placeholder");
  if (options.choices && control.tagName === "SELECT") {
    control.replaceChildren(...options.choices.map(([value, text]) => new Option(text, value)));
  }
  if (options.value !== undefined) control.value = options.value;
  return control;
}
export function fieldValue(screen, label) {
  return [...screen.querySelectorAll("[data-live-field]")].find(node => node.dataset.liveField === label)?.value?.trim() || "";
}
export function validateFields(screen) {
  const control = [...screen.querySelectorAll("[data-live-field]")].find(item => !item.closest("[hidden],[inert]") && !item.checkValidity());
  if (control) control.reportValidity();
  return !control;
}
const removeLayers = (root, names) => names.forEach(name => layers(root, name).forEach(node => { node.hidden = true; }));
const hideAction = (root, regex) => [...(root?.querySelectorAll(".demo-action") || [])].filter(node => regex.test(node.textContent.trim())).forEach(node => { node.hidden = true; });

export function configureForm(screen, route, data, user, options) {
  const { project, ready } = data;
  const content = layer(screen, "Content") || screen;
  const form = layer(screen, "Modal") || content;
  const type = options.capabilities?.testnet ? [["preview", "Simulation"], ["testnet", "Stellar testnet"]] : [["preview", "Simulation"]];
  let button;
  if (route === "c03") {
    input(content, "Project name", { required: true, value: options.draft.name || "" });
    removeLayers(content, ["Description", "Requirements"]);
    for (const field of ["Client name", "Client email or phone", "Deadline", "Currency"]) {
      const el = [...content.querySelectorAll("[aria-label]")].find(n => n.getAttribute("aria-label") === field);
      if (el) el.closest("[data-layer='Input'],[data-layer='Select']").hidden = true;
    }
    hideAction(content, /save draft|add requirement/i);
  }
  if (route === "c04" || route === "c09") {
    const editable = route === "c09";
    const cls = "Total project budget (USDC)";
    if (editable) removeLayers(content, ["Danger zone", "Danger", "Team", "Archive", "Payment rules", "Settings"]);
    const host = editable ? (layer(content, "General") || content) : content;
    input(host, cls, { oldLabel: editable ? "Project name" : undefined, type: "number", required: true, value: editable ? (project?.budget || 0) / 100 : options.draft.budget || "" });
    input(host, "Your compensation (USDC)", { oldLabel: editable ? "Deadline" : undefined, type: "number", zero: true, value: editable ? (project?.compensation || 0) / 100 : "0" });
    if (!editable) input(layer(content, "Budget") || content, "Project mode", { choices: type });
    else {
      match(content, [[/Lagos Wedding Decoration/, project?.name || "No project"], ["General", "Budget and compensation"]]);
      const currency = host.querySelector('[aria-label="Currency"]');
      if (currency) { currency.replaceChildren(new Option("USDC (Stellar)")); currency.disabled = true; }
    }
    const area = layer(content, "Expenses");
    if (area && !editable) {
      [...area.children].slice(1).forEach(item => { item.hidden = true; });
      empty(area, "Add approved expenses from the budget screen after setting up your project.");
    }
    hideAction(content, /save draft|add expense|close project/i);
  }
  if (route === "c05" || route === "c16") {
    const area = layer(form, "Form") || form;
    input(area, "Invite email", { oldLabel: "WhatsApp number or email", type: "email", required: true, value: "" });
    const roleChoices = user.role === "client" ? [["contractor", "Contractor"]] : project?.members?.some(m => m.role === "client")
      ? [["worker", "Worker"]] : [["worker", "Worker"], ["client", "Client"]];
    input(area, "Invitation role", { oldLabel: "Role", choices: roleChoices, value: options.inviteRole || roleChoices[0][0] });
    removeLayers(form, ["Message preview", "Preview message", "Preview", "Send via", "Invites", "Invited", "Pending list", "List"]);
    for (const caption of ["Preferred language", "Name", "Skill"]) {
      const el = area.querySelector('[aria-label="' + caption + '"]');
      if (el) el.closest("[data-layer='Input'],[data-layer='Select']").hidden = true;
    }
    match(form, [[/^Invite a worker$/, user.role === "client" ? "Invite a contractor" : "Invite a worker"],
      [/They’ll get a secure link|Send using the/, "Create a private link to share with your teammate."],
      [/^Workers get a WhatsApp/, "Create a private link for each person. You can assign tasks after they join."],
      [/^Ẹ n lẹ|payshare\.app\/i\//, ""], [/^Lagos Wedding Decoration$/, project?.name || "Choose a project first"]]);
    labelAction(action(form, /send.*invite/i), "Create invitation link");
    hideAction(form, /^save draft$|^add$/i);
    if (route === "c05") {
      const table = form.querySelector('[data-layer="Table"]:has(> [data-layer="Row"])');
      replaceEntries(table, ':scope > [data-layer="Row"]', project?.invitations || [], (row, invite) => {
        const cells = layers(row, "Cell");
        slots(cells[0], [initials(invite.email), invite.email]);
        slots(cells[1], [invite.email]);
        const title = value => value[0].toUpperCase() + value.slice(1);
        slots(cells[2], [title(invite.role)]);
        slots(cells[3], [title(invite.status)]);
      }, "No invitations yet.");
    }
    const projectField = form.querySelector("select[aria-label='Project']");
    if (projectField) {
      projectField.replaceChildren(...data.projects.map(p => new Option(p.name, p.id)));
      projectField.value = project?.id || "";
      projectField.dataset.liveField = "Project";
    }
  }
  if (route === "c14") {
    input(form, "Expense description", { oldLabel: "What was it for?", required: true, value: "" });
    input(form, "Amount (USDC)", { type: "number", required: true, value: "" });
    match(form, [[/receipt.*upload|upload.*receipt/i, "Receipt uploads are unavailable."]]);
    removeLayers(form, ["Upload", "Upload receipt"]);
    labelAction(action(form, /send.*approval|save expense/i), "Record approved expense");
  }
  if (route === "d09") {
    const pay = layer(content, "Pay");
    const remaining = Math.max(0, (project?.budget || 0) - (project?.funded || 0));
    const creatable = !project || options.create;
    button = action(pay, /^Fund/);
    if (creatable) {
      for (const row of layers(pay, "Row")) row.hidden = true;
      removeLayers(pay, ["Wallet", "v"]);
      match(content, [[/^Lagos Wedding Decoration \/ Fund/, "Projects / Create"],
        ["Fund the project", "Create a project"], [/Pay the agreed budget/, "Set your budget before recording funding."]]);
      input(pay, "Project name", { required: true, value: "", before: button });
      input(pay, "Project budget (USDC)", { type: "number", required: true, value: "", before: button });
      input(pay, "Project mode", { choices: type, before: button });
      labelAction(button, "Create project");
    } else {
      match(content, [[/Lagos Wedding Decoration/, project.name], ["Tola Adeyemi", project.members?.find(m => m.role === "contractor")?.name || "Not linked"],
        ["13 Dec 2026", "—"], ["1,000.00", number(remaining)], ["1,000.00 USDC", money(project.budget)],
        ["Covered", "—"], [/You’ll confirm in your wallet/, project.mode === "preview" ? "Simulation only. No funds move." : "Enter the hash after sending the testnet deposit."]]);
      const breakdown = layers(content, "Breakdown row");
      [project.totals.expenses, project.compensation, project.totals.worker_pool].forEach((value, i) => slots(breakdown[i],
        [undefined, (project.budget ? Math.round(100 * value / project.budget) : 0) + "%", money(value)]));
      input(pay, "Funding amount (USDC)", { type: "number", required: true, value: String(remaining / 100), before: button });
      removeLayers(pay, ["Wallet"]);
      if (project.mode === "testnet") {
        empty(pay, "Send one Stellar testnet USDC transfer to " + project.payer + " with hash memo " + project.fundingMemo + ".", button);
        input(pay, "Stellar transaction hash", { required: true, value: "", before: button });
      }
      labelAction(button, project.mode === "preview" ? "Record simulated funding" : "Verify testnet deposit");
    }
    if (creatable) {
      removeLayers(content, ["Agreement"]);
      match(pay, [[/You’ll confirm in your wallet/, ""]]);
    }
  }
  if (route === "mc09") {
    button = action(screen, /^authorize/i);
    if (button) {
      labelAction(button, project?.mode === "preview" ? "Run payout simulation" : "Authorize Stellar testnet payout");
      button.hidden = !ready[0];
    }
  }
}
