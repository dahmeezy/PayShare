import { action, date, empty, initials, labelAction, layer, layers, match, money, number, paragraphs, payoutStatus,
  put, replaceEntries, rowLink, slots, stats, taskStatus } from "./live-elements.mjs";

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
  const { project, task, ready } = data;
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
    if (!editable) input(content, "Project mode", { choices: type });
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
      [/They’ll get a secure link|Send using the|^Invite workers/, "Create a private link to share with your teammate."],
      [/^Ẹ n lẹ|payshare\.app\/i\//, ""], [/^Lagos Wedding Decoration$/, project?.name || "Choose a project first"]]);
    labelAction(action(form, /send.*invite/i), "Create invitation link");
    hideAction(form, /^save draft$|^add$/i);
    if (route === "c05") {
      const table = form.querySelector('[data-layer="Table"]:has(> [data-layer="Row"])');
      replaceEntries(table, ':scope > [data-layer="Row"]', project?.invitations || [], (row, invite) => {
        const cells = layers(row, "Cell");
        slots(cells[0], [initials(invite.email), invite.email]);
        slots(cells[1], [invite.email]);
        slots(cells[2], [invite.role]);
        slots(cells[3], [invite.status]);
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
  if (["c19", "mc07"].includes(route)) {
    const workers = project?.members?.filter(p => p.role === "worker") || [];
    input(content, "Task title", { required: true, value: "" });
    input(content, "Task description", { oldLabel: "Description", holder: layer(content, "Description"), type: "textarea", required: true, value: "" });
    input(content, "Assign to", { required: true, choices: [["", "Select a worker"], ...workers.map(w => [w.id, w.name])], value: "" });
    input(content, "Agreed payment (USDC)", { oldLabel: route === "mc07" ? "Payment (USDC)" : undefined,
      type: "number", required: true, value: "" });
    const clientCheck = paragraphs(content).find(p => /Client confirmation required/i.test(p.textContent));
    if (clientCheck) {
      const row = clientCheck.closest('[data-layer="Rule"],[data-layer="Checkbox"]') || clientCheck.parentElement;
      let checkbox = row.querySelector("input[type='checkbox']");
      if (!checkbox) {
        checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        clientCheck.prepend(checkbox);
      }
      checkbox.checked = false;
      checkbox.dataset.liveField = "Client confirmation";
      checkbox.setAttribute("aria-label", "Require client confirmation");
      match(row, [[/David must confirm/, "Client confirmation is required before payout."]]);
    } else {
      const row = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.dataset.liveField = "Client confirmation";
      checkbox.setAttribute("aria-label", "Require client confirmation");
      row.append(checkbox, " Require client confirmation");
      content.append(row);
    }
    removeLayers(content, ["Deliverables", "Acceptance", "Voice", "Voice note", "Files", "Attachments", "Deliv"]);
    const deadline = content.querySelector('[aria-label="Deadline"]');
    if (deadline) { deadline.value = ""; deadline.disabled = true; deadline.placeholder = "Unavailable"; }
    match(content, [["Lagos Wedding Decoration", project?.name || "Choose a project"],
      [/Send WhatsApp reminders|Task can be reassigned/, "Unavailable in this version"]]);
    hideAction(content, /save draft|add item|re-record/i);
    labelAction(action(screen, /send (?:task )?to amara/i), "Assign task");
    if (!workers.length) empty(content, "Invite a worker and have them accept before assigning a task.");
  }
  if (["w05", "mw06"].includes(route)) {
    const notes = layer(content, "Comment");
    input(notes || content, "Submission notes or work link", { holder: notes, type: "textarea", required: true, value: "" });
    if (notes) {
      removeLayers(notes, ["Voice note"]);
      const label = paragraphs(notes).find(p => /comment/i.test(p.textContent));
      if (label) label.textContent = "Notes or work link";
    }
    removeLayers(content, ["Upload", "Types", "Gallery", "Photo", "Checklist", "Voice"]);
    for (const p of paragraphs(content)) {
      if (/Uploading|About 10 seconds|JPG|PNG|PDF|Drag files|\d+ MB/.test(p.textContent)) p.hidden = true;
    }
    match(content, [[/Sew wedding outfits/i, task?.title || "No task selected"], ["150 USDC", money(task?.amount)],
      [/Add photos|add files/i, "Share a note or a link. File and voice uploads are unavailable."]]);
  }
  if (["c21", "mc08", "d06", "md05"].includes(route)) {
    const contractor = ["c21", "mc08"].includes(route);
    const note = layer(content, "Note");
    const noteParts = paragraphs(note).filter(p => !p.closest('[data-layer="Voice note"]'));
    if (noteParts.length > 1) put(noteParts[0], "Submission notes");
    put(noteParts.at(-1), task?.submission?.notes || "No notes submitted.");
    removeLayers(content, ["Gallery", "Photo", "Voice note", "Criteria", "History", "v"]);
    removeLayers(content, ["Checkbox"]);
    for (const option of layers(content, "Option")) option.hidden = true;
    const feedback = layer(content, "Feedback");
    if (contractor) input(feedback || content, "Review notes", { holder: feedback, type: "textarea", value: "" });
    else if (feedback) feedback.hidden = true;
    match(screen, [[/^(Tasks \/ Sew wedding outfits|Deliverables \/ Bridal)/, task?.title || "No task selected"],
      [/^Review Amara’s submission|^Confirm the bridal outfits/, task?.title || "No task selected"],
      [/^Submitted today|^Made by Amara/, task ? task.workerName + " · " + date(task.submission?.submittedAt) : "No submission"],
      [/Then David confirms|When you confirm|Amara is paid/, "Payouts still require contractor authorization and verified conditions."],
      [/from Amara/i, task?.workerName || "Worker"]]);
    const allowed = task && (contractor ? task.status === "submitted" : task.status === "approved" && task.clientApprovalRequired && !task.clientApprovedAt);
    if (!allowed) {
      hideAction(screen, /^approve|^confirm|^request changes$|^changes$/i);
      empty(content, task ? taskStatus(task) : "No submitted work selected.");
    } else if (!contractor) hideAction(screen, /^request changes$|^changes$/i);
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
  if (route === "c24" || route === "mc09") {
    const payout = task || ready[0];
    button = action(screen, /^authorize/i);
    labelAction(button, project?.mode === "preview" ? "Run payout simulation" : "Authorize Stellar testnet payout");
    if (button) button.hidden = !payout || !ready.some(t => t.id === payout.id);
    match(screen, [[/Approvals \/ Payout to/, payout ? "Approvals / Payout to " + payout.workerName : "Approvals / Payout"],
      ["Sew wedding outfits", payout?.title || "No payout selected"], ["Amara Okafor", payout?.workerName || "—"],
      ["AO", initials(payout?.workerName || "")], ["Lagos Wedding Decoration", project?.name || "—"],
      [/^150\.00$|^150$/, number(payout?.amount)], [/^150 USDC$/, money(payout?.amount)],
      [/David confirmed the outfits/, payout ? taskStatus(payout) : "No eligible payout is selected."],
      [/Enter your 6-digit PIN|You’ll confirm with your PIN/, "Authorized by your signed-in contractor account."],
      [/Amara and David get a receipt/, "The payment status appears in Transactions."],
      [/files unlock|agent sends.*x402|Stellar confirms it/i, project?.mode === "preview" ? "No funds move during simulation." : "Settlement is verified on Stellar testnet."],
      [/^Stellar Testnet · USDC$/, project?.mode === "preview" ? "Simulation" : "Stellar Testnet · USDC"]]);
    const pin = screen.querySelector('[aria-label*="6-digit PIN"]');
    if (pin) pin.closest('[data-layer="Input"]').hidden = true;
    if (route === "c24" && payout) {
      for (const [i, check] of [...(layer(content, "Checks")?.querySelectorAll(':scope > [data-layer="c"]') || [])].entries()) {
        slots(layer(check, "t") || check, [["Allocation recorded", "Contractor review", "Client sign-off", "Funding", "Payment history", "Settlement"][i],
          [money(payout.amount), taskStatus(payout), payout.clientApprovalRequired ? "Confirmed" : "Not required",
            money(project.funded) + " funded", payoutStatus(payout.payout), project.mode === "preview" ? "Simulation" : "Stellar testnet"][i]]);
      }
    }
  }
}

export function bindTaskDetail(screen, route, data) {
  const task = data.task;
  const content = layer(screen, "Content");
  const title = layer(content, "Title") || layer(screen, "App bar");
  if (!task) {
    for (const el of [...(content?.children || [])]) if (el !== layer(content, "Page header")) el.hidden = true;
    empty(content, "Choose a task from the task list.");
    match(title, [[/Sew wedding outfits|Amara’s submission/, "No task selected"], [/Due|150 USDC/, ""]]);
    hideAction(screen, /submit|approve|accept|review submission/i);
    return;
  }
  match(title, [[/^Lagos Wedding Decoration/, task.project.name + " / Tasks"], [/Sew wedding outfits/, task.title],
    [/Due|Assigned to Amara/, money(task.amount) + " · " + taskStatus(task)], [/Awaiting your review|In progress/, taskStatus(task)]]);
  match(content, [["Lagos Wedding Decoration", task.project.name], ["Amara Okafor", task.workerName],
    [/Sew the bridal gown|Sew the bridal|Full decoration/, task.description], ["Sew wedding outfits", task.title],
    [/^150(?:\.00)? USDC$/, money(task.amount)], [/^(?:Fri )?5 Dec|^Sat 13 Dec|^Tola Adeyemi$/, "—"],
    ["AO", initials(task.workerName)], ["No · custom fitted", "Unavailable"], [/2 of 3 deliverables/, taskStatus(task)],
    ["Submissions (1)", "Submissions (" + Number(Boolean(task.submission)) + ")"], ["Discussion (4)", "Discussion"],
    [/Awaiting your review|Client confirmation pending/, taskStatus(task)],
    ["In progress", taskStatus(task)], ["Awaiting client", taskStatus(task)]]);
  for (const item of ["Discussion", "Upload", "Progress update", "Ask", "Files", "Voice note", "Criteria", "History", "Timeline"]) {
    const block = layer(content, item);
    if (block) block.hidden = true;
  }
  for (const p of paragraphs(content)) {
    if (/\.(jpg|pdf|png)|13 Nov|fits the bride|bridesmaid|Tola · Instructions|do accept|voice note|^Waiting for David/i.test(p.textContent)) p.hidden = true;
  }
  const body = layer(content, "Instructions") || layer(content, "Details") || content;
  if (body !== content) {
    for (const child of [...body.children].slice(1)) child.hidden = true;
  }
  empty(body, task.description);
  if (task.submission) empty(body, "Submission: " + task.submission.notes);
  if (task.review?.notes) empty(body, "Review: " + task.review.notes);
  if (route === "c11" || route === "w08" || route === "mw07") empty(body, payoutStatus(task.payout) + " · " + money(task.amount));
  if (route === "w06") {
    match(content, [[/Tola has been notified/, "Your contractor can review your submission in PayShare."],
      [/Thanks, Amara/, "Your work was received."]]);
    const submission = layer(content, "Submission");
    if (submission) {
      [...submission.children].slice(1).forEach(child => child.hidden = true);
      empty(submission, task.submission?.notes || "No submission notes.");
    }
  }
  const review = action(screen, /review submission/i);
  if (review) review.hidden = task.status !== "submitted";
  const submit = action(screen, /submit work|resubmit|submit again/i);
  if (submit) submit.hidden = !["assigned", "rejected"].includes(task.status);
}

export function configureProfile(screen, user, onboard) {
  const form = layer(screen, "Form");
  match(form, [[/^TA$/, initials(user.name)], ["Set up your profile", onboard ? "Set up your profile" : "Your profile"],
    ["Step 2 of 3", onboard ? "Step 2 of 3" : "Account settings"],
    ["Connect a Stellar wallet to receive USDC. You can do this later.", "Use a public Stellar address. PayShare never asks for a private key."]]);
  input(form, "Profile name", { oldLabel: "Business name (optional)", required: true, value: user.name });
  input(form, "Public Stellar wallet", { oldLabel: "WhatsApp number", value: user.stellar_address || "" });
  removeLayers(form, ["Two"]);
  hideAction(form, /upload photo|connect wallet/i);
  if (!onboard) labelAction(action(form, /^Continue$/i), "Save profile");
  empty(form, user.email + " · Email verification unavailable.");
}
