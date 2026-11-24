import { addPasswordToggle, applyAuthPlaceholders, demoCode, validContact, wireCode } from "./auth-controls.mjs";
import { downloadSample, editorDialog, filterItems, messageDialog, openDialog, pickFiles, restoreMockFields, saveMockFields, showFiles, wireChoices } from "./demo-interactions.mjs";
import { demoMessages, readPreference, roles, savePreference } from "./mock-data.mjs";
import { liveApplication, liveMode } from "./live.mjs";
import { authoredRoutes, displayRoute, groups, normalize, roleFor, roleLinks, targetFor } from "./navigation.mjs";

const screen = document.querySelector("#screen");
const catalog = document.querySelector("#catalog");
const list = document.querySelector("#catalog-list");
const search = document.querySelector("#screen-filter");
const status = document.querySelector("#notice");
const narrow = matchMedia("(max-width: 767px)");
const compact = matchMedia("(max-width: 370px)");
const hideChrome = new URL(location.href).searchParams.has("compare");
let role = readPreference("role", "contractor");
if (!Object.hasOwn(roles, role)) role = "contractor";
let verifyCode;
let verificationPurpose = "signup";
let sampleInvitation;
let catalogRole = "";
let dark = readPreference("theme", "light") === "dark";
let frame;
let renderVersion = 0;
let statusTimer;
const [frames, authoring] = await Promise.all(["screens.json", "reactions.json"].map(async (file) => {
  const response = await fetch(new URL(file, import.meta.url));
  if (!response.ok) throw new Error("Could not load the PayShare screen index");
  return response.json();
})).catch((error) => {
  screen.textContent = error.message;
  screen.removeAttribute("aria-busy");
  return [[], []];
});
const index = new Map(frames.map(view => [view.route, view]));
const authored = authoredRoutes(authoring);
const live = liveMode ? liveApplication({ screen, render, roles, roleFor, announce }) : null;
if (live) await live.start();

function announce(message) {
  clearTimeout(statusTimer);
  status.textContent = message;
  statusTimer = setTimeout(() => { status.textContent = ""; }, 4500);
}

function element(tag, text) {
  const item = document.createElement(tag);
  if (text) item.textContent = text;
  return item;
}
function cleanName(name) {
  return name.replaceAll("&amp;", "&").replaceAll("&quot;", '"');
}
function href(route) { return "#/" + route; }
function goto(route) {
  if (route === "@home") route = roles[role].home;
  if (index.has(route) || route === "reset-password") location.hash = live?.hash(route) || href(route);
}
function labelOf(node) {
  return node.innerText.trim().replace(/\s+/g, " ");
}

function focusInvalid(onScreen) {
  const fields = [...onScreen.querySelectorAll("input, textarea, select")].filter(el => !el.closest("[hidden], [inert]"));
  const password = fields.find(el => el.dataset.password === "new");
  const repeat = fields.find(el => el.dataset.password === "confirm");
  if (repeat) repeat.setCustomValidity(repeat.value !== password?.value ? "The passwords must match." : "");
  for (const field of fields) {
    if (field.dataset.contact === "true") {
      field.setCustomValidity(field.value && !validContact(field.value) ? "Enter an email address or a phone number with its country code." : "");
    }
  }
  const invalid = fields.find(el => !el.checkValidity());
  if (!invalid) return false;
  invalid.reportValidity();
  invalid.focus();
  return true;
}

function installInput(node) {
  const field = [...node.children].find(child => /^(field|search field)$/i.test(child.dataset.layer || ""));
  const caption = [...node.children].find(child => child !== field && labelOf(child));
  if (!field || !caption || field.querySelector("input,select,textarea")) return;
  const text = [...field.children].find(child => child.matches("p, span"));
  if (!text) return;
  const label = labelOf(caption);
  const sample = labelOf(text);
  const select = node.dataset.layer === "Select" || !!field.querySelector('[data-layer*="chevron-down" i]');
  const multiline = /reason|description|message|feedback|instructions|notes|criteria/i.test(label) && field.clientHeight > 60;
  const input = element(select ? "select" : multiline ? "textarea" : "input");
  input.className = text.className + " demo-input";
  input.setAttribute("aria-label", label);
  if (select) {
    const values = /role/i.test(label) ? ["Contractor", "Worker", "Client"]
      : /language/i.test(label) ? ["English", "Yoruba", "Igbo", "Hausa", "Pidgin"]
      : /worker|assign/i.test(label) ? ["Amara Okafor", "Chidi Eze", "Ngozi Bello", "Femi", "Kemi"]
      : /status/i.test(label) ? ["Active", "Pending", "Completed"]
      : /country/i.test(label) ? ["Nigeria", "Ghana", "Kenya", "South Africa"]
      : /project/i.test(label) ? ["Lagos Wedding Decoration", "Ikeja Office Launch Event"]
      : /reason/i.test(label) ? ["Scope changed", "Budget changed", "More time requested"]
      : /time zone/i.test(label) ? ["West Africa Time (Lagos)", "Greenwich Mean Time", "East Africa Time"]
      : ["Other"];
    for (const value of new Set([sample, ...values].filter(Boolean))) input.append(element("option", value));
    field.classList.add("demo-select-field");
    field.querySelector('[data-layer*="chevron-down" i]')?.setAttribute("aria-hidden", "true");
  } else {
    input.placeholder = sample;
    input.autocomplete = "off";
    const password = /password|\bpin\b/i.test(label);
    const contact = /email|whatsapp number|phone number/i.test(label);
    const auth = /^a\d|^reset-password$/.test(screen.dataset.route);
    if (password && input.tagName === "INPUT") {
      input.type = "password";
      input.required = true;
      input.minLength = /pin/i.test(label) ? 6 : 8;
      input.dataset.password = /confirm/i.test(label) ? "confirm" : "new";
      if (/pin/i.test(label)) {
        input.inputMode = "numeric";
        input.pattern = "[0-9]{6}";
        input.maxLength = 6;
      } else input.autocomplete = "new-password";
      field.classList.add("password-field");
      const icon = [...field.children].find(child => child.querySelector("img"));
      text.replaceWith(input);
      addPasswordToggle(input, icon);
      return;
    } else if (/amount|budget|\bUSDC\b/i.test(label) && input.tagName === "INPUT") {
      input.inputMode = "decimal";
      input.pattern = "[0-9]+(\\.[0-9]{1,2})?";
      if (!auth) input.value = sample.replaceAll(",", "").match(/^\d+(?:\.\d+)?/)?.[0] || "";
    } else {
      if (contact) input.dataset.contact = "true";
      if (!auth || screen.dataset.route === "a06") input.value = sample;
    }
    if (!/optional/i.test(label) && (contact || /^(full name|your name|project name|task title)$/i.test(label))) {
      input.required = true;
    }
  }
  text.replaceWith(input);
}
function installSearch(node) {
  const text = node.querySelector("p");
  if (!text) return;
  const input = element("input");
  input.type = "search";
  input.placeholder = labelOf(text);
  input.setAttribute("aria-label", input.placeholder);
  input.className = text.className + " demo-input";
  input.addEventListener("input", () => {
    if (node.closest('[data-layer="Top bar"], [data-layer="App bar"]')) return;
    runFilter();
  });
  input.addEventListener("keydown", event => {
    if (event.key !== "Enter") return;
    event.stopPropagation();
    if (node.closest('[data-layer="Top bar"], [data-layer="App bar"]')) {
      if (live) live.search(input.value);
      else {
        search.value = input.value;
        showCatalog(role);
      }
    } else runFilter();
  });
  text.replaceWith(input);
}
function installUpload(node) {
  const input = element("input");
  input.type = "file";
  input.multiple = true;
  input.className = "demo-file";
  input.setAttribute("aria-label", "Choose demo attachments");
  input.addEventListener("change", () => {
    showFiles(node, input.files, announce);
  });
  node.classList.add("demo-upload");
  node.append(input);
}
function runFilter() {
  const query = screen.querySelector('[data-layer="Filters"] input[type="search"]')?.value ||
    [...screen.querySelectorAll('input[type="search"]')].find(input => !input.closest('[data-layer="Top bar"], [data-layer="App bar"]'))?.value || "";
  const filter = screen.querySelector('[data-demo-filter][aria-pressed="true"]')?.dataset.demoFilter || "";
  const result = filterItems(screen, filter, query);
  screen.querySelector(".demo-empty-results")?.remove();
  if (result.count && !result.visible) {
    const note = element("p", "No sample items match these filters.");
    note.className = "demo-empty-results";
    (screen.querySelector('[data-layer="Content"]') || screen.firstElementChild).append(note);
  }
}

function isSubmit(label) {
  return /^(create account|log in|verify|continue|save|submit|send|authorize|invite|approve|accept|join|finish setup|fund \d)/i.test(label);
}

function demoAction(button, label, route, layer, scope) {
  const clean = normalize(label);
  if (layer === "icon/log-out") {
    role = "contractor";
    savePreference("role", role);
    return goto("a01");
  }
  if (/download|export/i.test(label)) return downloadSample(scope, label, announce);
  if (layer === "Link") return editorDialog("Add a sample link", "Website address", value => {
    try {
      const link = new URL(value);
      if (!["http:", "https:"].includes(link.protocol)) throw new Error("Scheme");
      const item = element("p", "Local link: " + link.href);
      item.className = "selection-details";
      button.after(item);
      announce("Link saved in this preview.");
    } catch {
      announce("Enter a complete HTTP or HTTPS address.");
    }
  });
  if (/^copy|share receipt|share on whatsapp/i.test(label)) {
    const link = new URL(location.href);
    return openDialog("Demo share link", dialog => {
      const input = element("input");
      input.value = link.href;
      input.readOnly = true;
      input.setAttribute("aria-label", "Local preview link");
      dialog.append(element("p", "Use this link to open the same sample screen."), input);
      input.addEventListener("focus", () => input.select());
    });
  }
  if (/upload photo|add more files|choose files|attach/i.test(label)) {
    return pickFiles(button.parentElement, announce, { multiple: !/photo/i.test(label), accept: /photo/i.test(label) ? "image/*" : "" });
  }
  if (layer === "Play" || /^play/i.test(label)) return messageDialog("Sample voice note", "Please finish the fittings before 5 December and share photos of the completed outfits.");
  if (/record|voice note|message|ask|remind|discuss|send guide|send link|request changes|^changes$|post update/i.test(label) || layer === "Quick reply") {
    return editorDialog(label || "Demo message", "Draft text", text => {
      button.dataset.draft = text;
      announce("Draft saved locally. No message or audio was sent.");
    });
  }
  if (/^add( |$)/i.test(label)) {
    return editorDialog(label, "New item", text => {
      const item = element("p", text);
      item.className = "selection-details";
      button.before(item);
      announce("Sample item added.");
    });
  }
  if (/mark all as read/i.test(label)) {
    for (const badge of scope.querySelectorAll('[data-layer="Unread"]')) badge.hidden = true;
    button.disabled = true;
    return announce("Sample notifications marked as read.");
  }
  if (/^resend|^show demo code|^or get the code/i.test(label)) return announce("Demo code: " + demoCode + ". No message was sent.");
  if (/^close project|withdraw|reject|decline/i.test(label)) {
    return openDialog(label, dialog => {
      dialog.append(element("p", "This updates the local demo only."));
      const confirm = element("button", "Confirm demo update");
      confirm.className = "demo-dialog-button";
      confirm.addEventListener("click", () => {
        button.disabled = true;
        dialog.close();
        announce("Sample update recorded.");
      });
      dialog.append(confirm);
    });
  }
  if (!["Chip", "Tab"].includes(layer) && (isSubmit(label) || /resolve/i.test(label))) return saveMockFields(scope, route, announce);
  if (/^default$|^large$|^extra large$/i.test(label)) {
    const size = clean === "large" ? "large" : clean === "extra large" ? "extra-large" : "";
    document.documentElement.dataset.demoTextSize = size;
    savePreference("text-size", size);
    for (const chip of button.parentElement.querySelectorAll('[data-layer="Chip"]')) chip.setAttribute("aria-pressed", String(chip === button));
    return;
  }
  if (["Chip", "Tab"].includes(layer)) {
    if (route.startsWith("c33")) return showSettings(label);
    for (const sibling of button.parentElement.querySelectorAll("[data-demo-filter]")) sibling.setAttribute("aria-pressed", String(sibling === button));
    return runFilter();
  }
  const card = button.closest('[data-layer="Row"], [data-layer="Worker card"], [data-layer="Notification item"], [data-layer="Task card"]');
  if (card) return messageDialog(label || "Sample details", card.innerText.trim());
  if (/project switcher/i.test(layer)) return showCatalog(role, "project");
  if (/help/i.test(layer)) return messageDialog("Help and guides", "Use Explore screens to open the sample PayShare flows for your role.");
  if (/network/i.test(layer)) return messageDialog("Stellar Testnet", demoMessages.payment);
  if (/avatar|user/i.test(layer)) return showSettings("Profile");
  if (/attachment|menu/i.test(layer)) return messageDialog("Sample attachment", demoMessages.attachment);
  if (/view|open|browse|all/i.test(label)) return showCatalog(role);
  return messageDialog(label || "Demo control", "This control is shown in the design. Its full workflow is not available in the demo.");
}

function showSettings(title = "Settings") {
  if (live) return openDialog(title, dialog => {
    for (const [label, run] of [["Profile", () => live.openProfile()], ["Switch theme", () => switchTheme()],
      ["Sign out", () => live.logout()]]) {
      const button = element("button", label);
      button.className = "demo-dialog-button";
      button.addEventListener("click", () => { dialog.close(); run(); });
      dialog.append(button);
    }
  });
  return openDialog(title, dialog => {
    dialog.append(element("p", roles[role].label + " demo preferences"));
    const theme = element("button", dark ? "Use light theme" : "Use dark theme");
    theme.className = "demo-dialog-button";
    theme.addEventListener("click", () => {
      dialog.close();
      switchTheme();
    });
    dialog.append(theme);
  });
}

function showRoleMenu() {
  return openDialog(roles[role].label + " navigation", dialog => {
    const nav = element("nav");
    nav.className = "demo-role-menu";
    for (const [label, target] of roleLinks(role)) {
      if (target === "@settings") {
        const settings = element("button", label);
        settings.addEventListener("click", () => { dialog.close(); showSettings(); });
        nav.append(settings);
      } else {
        const link = element("a", label);
        link.href = live?.hash(target) || href(target);
        link.addEventListener("click", () => dialog.close());
        nav.append(link);
      }
    }
    dialog.append(nav);
  });
}

function installAction(node, label, route) {
  const layer = node.dataset.layer || "";
  let target = targetFor(route, layer, label, authored);
  if (/^Theme Match device$/i.test(layer)) target = "@system";
  if (/^Theme (Light|Dark)$/i.test(layer)) target = normalize(label) === "dark" ? "@dark" : "@light";
  if (layer === "Bell") target = { contractor:"c32", worker:"w13", client:"md07" }[role];
  if (/connect wallet/i.test(label)) target = "@wallet";
  if (/\bmore\b/i.test(label) && /nav item/i.test(layer)) target = "@role-menu";
  if (/return to|go back/i.test(label) && !target) target = "@back";
  if (/appearance|switch theme|dark mode|light mode/i.test(label) && !target) target = "@theme";
  if (/signature|download|stellar expert|explorer|copy (address|link|hash)/i.test(label) && !target) target = "@receipt";
  if (/whatsapp/i.test(label) && !target) target = "whatsapp";
  if ((label === "Back" || layer === "Back" || layer === "icon/arrow-left") && !target) target = "@back";
  if (layer === "icon/log-out") target = "@logout";
  if (route === "a05" && /^verify$/i.test(label)) target = "@verify";
  if (route === "a06" && cleanInvite(label)) target = "@join-invite";
  if (route === "a08" && label === "Skip for now") target = "a09";
  if (route === "reset-password" && label === "Save new password") target = "@reset";
  if (/^authorize|^fund \d/i.test(label) && !target) target = "@payment";

  const button = element(target && index.has(target) ? "a" : "button");
  if (button.tagName === "A") button.href = href(target);
  else button.type = "button";
  for (const attr of node.attributes) {
    if (!["type","href"].includes(attr.name)) button.setAttribute(attr.name, attr.value);
  }
  button.classList.add("demo-action");
  const submits = ["Button", "CTA"].includes(layer) && isSubmit(label);
  if (submits) button.dataset.submit = "";
  if (["Tab", "Chip"].includes(layer) && !target) {
    button.setAttribute("aria-pressed", String(/^all\b/i.test(label)));
    button.dataset.demoFilter = label;
  }
  if (!label) button.setAttribute("aria-label", layer || "Open action");
  button.append(...node.childNodes);
  node.replaceWith(button);
  button.addEventListener("click", (event) => {
    event.preventDefault();
    if (button.closest("[inert]")) return;
    const modal = screen.querySelector('[data-layer="Modal"]');
    const scope = modal || screen;
    if (live && /^a0[23]$/.test(route) && submits && focusInvalid(scope)) return;
    if (live?.handle(button, label, route, scope, target, layer)) return;
    if (target === "@verify") {
      if (verifyCode?.()) {
        const next = verificationPurpose === "reset" ? "reset-password" : verificationPurpose === "login" ? "@home" : "a07";
        verificationPurpose = "signup";
        announce("Demo code accepted.");
        goto(next);
      }
      return;
    }
    const codeLogin = route === "a03" && /get a login code/i.test(label);
    if (submits || codeLogin) {
      const verifyScope = codeLogin ? screen.querySelector('[data-layer="Input"]') : scope;
      if (focusInvalid(verifyScope || scope)) return;
    }
    if (target === "@join-invite") {
      role = "worker";
      savePreference("role", role);
      announce("Demo invitation accepted. Your worker workspace is ready.");
      return goto("w01");
    }
    if (target === "@reset") {
      announce("Demo password reset complete. No account was changed.");
      return goto("a03");
    }
    if (target === "@role-menu") return showRoleMenu();
    if (target === "@settings") return showSettings();
    if (target === "@logout") return demoAction(button, label, route, layer, scope);
    if (target === "@back") return closeScreen(route);
    if (target === "@theme") return switchTheme();
    if (target === "@system") return switchTheme(matchMedia("(prefers-color-scheme: dark)").matches);
    if (target === "@light" || target === "@dark") return switchTheme(target === "@dark");
    if (target === "@wallet") return announce("Wallet connection is a demo. PayShare never asks for a private key.");
    if (target === "@receipt") return /download|export/i.test(label) ? downloadSample(scope, label, announce) : announce(demoMessages.receipt);
    if (target === "@payment") return announce(demoMessages.payment);
    if (!target && (layer === "Close" || /^(cancel|close|dismiss)$/i.test(label))) return closeScreen(route);
    if (!target) return demoAction(button, label, route, layer, scope);
    if (route === "c16" && label === "Send invite") {
      const value = label => scope.querySelector(`[aria-label="${label}"]`)?.value.trim();
      const contact = value("WhatsApp number or email");
      sampleInvitation = {
        name: value("Name"),
        phone: contact?.startsWith("+") ? contact : "",
        project: value("Project"),
        language: value("Preferred language"),
      };
      saveMockFields(scope, route, announce);
      return openDialog("Sample invitation ready", dialog => {
        const link = element("a", "Open worker invitation");
        link.href = href("a06");
        link.className = "demo-dialog-button";
        link.addEventListener("click", () => dialog.close());
        dialog.append(element("p", "Use this link to try the worker’s view. No invitation was sent."), link);
      });
    }
    if (target === "a05") {
      verificationPurpose = route === "a04" ? "reset" : route === "a03" ? "login" : "signup";
      announce("Use demo code " + demoCode + ". No message was sent.");
    } else if (/authorize|fund|release/i.test(label)) announce(demoMessages.payment);
    else if (submits) saveMockFields(scope, route, announce);
    goto(target);

  });
}
const cleanInvite = label => /^(join project|accept invitation)$/i.test(label);

function closeScreen(route) {
  const base = route.replace(/-(dark|360)$/, "");
  if (live && base === "c16" && live.accountRole() === "client") { goto("d09"); return; }
  if (live && base === "c24") { goto("c23"); return; }
  const parent = ({
    c12:"c11", c14:"c10", c16:"c15", mc05:"mc04", mc07:"mc02", mc08:"mc02", mc09:"mc01",
    mw03:"mw02", mw04:"mw03", mw05:"mw03", mw06:"mw03", mw08:"mw07", mw09:"mw03", md05:"md01", md06:"md01",
    a02:"a01", a03:"a01", a04:"a03", a05:"a03", a06:"a01", a07:"a05", a08:"a07", a09:"a08", "reset-password":"a03",
  })[base];
  goto(parent || (roleFor(base) ? roles[role].home : "a01"));
}

function installInvite() {
  const form = screen.querySelector('[data-layer="Form"]');
  if (sampleInvitation) {
    const { name, phone, project, language } = sampleInvitation;
    const projectName = form.querySelector('[data-figma="56:511"]');
    if (project && projectName) projectName.textContent = "to " + project;
    form.querySelector('[aria-label="Your name"]').value = name || "";
    form.querySelector('[aria-label="WhatsApp number"]').value = phone;
    if (language) form.querySelector('[aria-label="Preferred language"]').value = language;
    sampleInvitation = undefined;
  }
  const profile = [...form.children].filter(node => ["Input", "Select", "Button"].includes(node.dataset.layer));
  for (const node of profile) node.hidden = true;
  const last = form.querySelector('[data-figma="56:525"]');
  if (last) last.textContent = "Review the invitation from Tola before joining as a worker.";
  const actions = element("div");
  actions.className = "invite-actions";
  const accept = element("button", "Accept invitation");
  const decline = element("button", "Decline invitation");
  accept.className = decline.className = "demo-dialog-button";
  accept.addEventListener("click", () => {
    for (const node of profile) node.hidden = false;
    actions.remove();
    if (last) last.textContent = "Confirm your profile to join the project as a worker.";
    profile[0]?.querySelector("input")?.focus();
  });
  decline.addEventListener("click", () => {
    actions.replaceChildren(element("p", "Invitation declined in this demo."));
    const back = element("button", "Back to welcome");
    back.className = "demo-dialog-button";
    back.addEventListener("click", () => goto("a01"));
    actions.append(back);
  });
  actions.append(accept, decline);
  form.append(actions);
}

function resetFields() {
  const node = screen.querySelector('[data-layer="Input"]');
  const first = node.cloneNode(true);
  node.firstElementChild.textContent = "New password";
  first.querySelector("p").textContent = "Confirm password";
  node.after(first);
  screen.querySelector('[data-figma="56:384"] p').textContent = "Save new password";
  const form = screen.querySelector('[data-layer="Form"]');
  const heading = form.querySelector('[data-layer="h"]');
  if (heading) heading.replaceChildren(element("h2", "Choose a new password"), element("p", "Use a sample password. This is a local demo."));
}

function wireScreen(route) {
  const container = screen.firstElementChild;
  verifyCode = undefined;
  if (route === "reset-password") resetFields();
  const fields = new Set(screen.querySelectorAll('[data-layer="Input"], [data-layer="Select"]'));
  for (const field of screen.querySelectorAll('[data-layer="Field"]')) fields.add(field.parentElement);
  for (const node of fields) installInput(node);
  for (const composer of screen.querySelectorAll('[data-layer="Composer"]')) {
    const sample = composer.querySelector('[data-layer="input"] p');
    if (!sample) continue;
    const input = element("input");
    input.placeholder = labelOf(sample);
    input.className = sample.className + " demo-input";
    input.setAttribute("aria-label", "Draft WhatsApp message");
    input.addEventListener("keydown", event => {
      if (event.key !== "Enter" || !input.value.trim()) return;
      event.stopPropagation();
      const message = element("p", "Local draft: " + input.value.trim());
      message.className = "selection-details";
      composer.before(message);
      input.value = "";
      announce("Draft saved in this preview. Nothing was sent.");
    });
    sample.replaceWith(input);
  }
  for (const node of screen.querySelectorAll('[data-layer="Search field"], [data-layer="Search"]')) installSearch(node);
  for (const node of screen.querySelectorAll('[data-layer^="Upload" i]')) {
    if (!node.parentElement.closest('[data-layer^="Upload" i]')) installUpload(node);
  }

  if (route === "a05") {
    const code = screen.querySelector('[data-layer="Code"]');
    code.classList.add("code-grid");
    const inputs = [...code.children].map((box, i) => {
      const input = element("input");
      input.className = "demo-input verification-digit";
      input.setAttribute("aria-label", "Verification digit " + (i + 1));
      box.replaceChildren(input);
      return input;
    });
    const hint = screen.querySelector('[data-figma="56:443"]');
    hint.textContent = "Demo code " + demoCode + ". No email or WhatsApp message was sent.";
    screen.querySelector('[data-figma="56:462"]').textContent = "Show demo code";
    const feedback = element("p");
    feedback.className = "auth-feedback";
    feedback.role = "alert";
    code.after(feedback);
    verifyCode = wireCode(inputs, feedback);
  }
  wireChoices(screen);
  for (const table of screen.querySelectorAll('[data-layer="Table"], [data-layer="Projects table"], [data-layer="Tasks table"], [data-layer="Transactions table"]')) {
    if (table.parentElement.closest(".demo-table-scroll")) continue;
    const wrapper = element("div");
    wrapper.className = "demo-table-scroll";
    wrapper.setAttribute("aria-label", table.dataset.layer);
    wrapper.role = "region";
    wrapper.tabIndex = 0;
    table.before(wrapper);
    wrapper.append(table);
  }

  const actions = screen.querySelectorAll('[data-layer="Button"], [data-layer="Sidebar item"], [data-layer="Bottom nav item"], [data-layer="Logo"], [data-layer="Tab"], [data-layer="Row"], [data-layer="Cell"], [data-layer="Chip"], [data-layer="Play"], [data-layer="Close"], [data-layer="Bell"], [data-layer="CTA"], [data-layer="Quick reply"], [data-layer^="Theme "], [data-layer="Back"], [data-layer="icon/arrow-left"], [data-layer="icon/log-out"], [data-layer="Help"], [data-layer="Project switcher"], [data-layer="Menu"], [data-layer="Link"]');
  for (const node of actions) {
    if (!screen.contains(node) || node.closest("a,button") ||
        node.querySelector('input, select, textarea, [data-layer="Button"]')) continue;
    const label = labelOf(node);
    const layer = node.dataset.layer;
    if (["Cell", "Row"].includes(layer) && !targetFor(route, layer, label, authored)) continue;
    installAction(node, label, route);
  }
  for (const node of screen.querySelectorAll("p")) {
    if (node.closest("a,button") || node.children.length) continue;
    const label = labelOf(node);
    if (route === "a01" && node.closest('[data-layer="Nav"]') && /^(how it works|for contractors|for workers|for clients)$/i.test(label)) {
      const link = element("button", label);
      link.className = node.className + " demo-action";
      link.type = "button";
      link.addEventListener("click", () => screen.querySelector('[data-layer="' + (label === "How it works" ? "How" : "Roles") + '"]')?.scrollIntoView({ behavior:"smooth" }));
      node.replaceWith(link);
      continue;
    }
    if (/^(log in|sign up|forgot password\?|create an account|back to log in|resend (?:code|in .+)|show demo code|or get the code on whatsapp instead)$/i.test(label)) {
      installAction(node, label, route);
    }
  }

  const modal = screen.querySelector('[data-layer="Modal"]');
  if (modal) {
    modal.role = "dialog";
    modal.ariaModal = "true";
    modal.ariaLabel = cleanName(frame.name);
    modal.tabIndex = -1;
    for (const sibling of modal.parentElement.children) if (sibling !== modal) sibling.inert = true;
  }
  if (route === "a07") {
    for (const name of Object.keys(roles)) {
      const candidates = [...screen.querySelectorAll('[data-layer="Form side"] p')].filter(node =>
        normalize(node.textContent).includes(name) && /^(i’m a|i manage|i do the work)/i.test(normalize(node.textContent)));
      const item = candidates.at(-1)?.parentElement?.closest("[data-layer]") || candidates.at(-1);
      if (!item) continue;
      item.setAttribute("role", "radio");
      item.setAttribute("aria-checked", String(role === name));
      item.dataset.demoRole = name;
      item.tabIndex = 0;
      const select = () => {
        role = name;
        savePreference("role", role);
        for (const row of screen.querySelectorAll("[data-demo-role]")) row.setAttribute("aria-checked", String(row === item));
      };
      item.addEventListener("click", select);
      item.addEventListener("keydown", (event) => {
        if (["Enter"," "].includes(event.key)) { event.preventDefault(); select(); }
      });
    }
  }
  if (route === "a06" && !live) installInvite();
  if (!live) restoreMockFields(screen, route);
  if (container) container.setAttribute("aria-label", cleanName(frame.name));
  if (roleFor(route) && !screen.querySelector('[data-layer="Bottom nav"]')) {
    const menu = element("button", roles[role].label + " menu");
    menu.className = "compact-role-menu";
    menu.addEventListener("click", showRoleMenu);
    screen.prepend(menu);
  }
}

async function render() {
  if (!index.size) return;
  const version = ++renderVersion;
  const requested = location.hash.match(/^#\/([\w-]+)(?:\?.*)?$/)?.[1] || "a01";
  const route = live?.route(requested) || requested;
  const reset = route === "reset-password";
  const wanted = reset ? "a04" : index.has(route) ? route : "a01";
  const target = displayRoute(wanted, index, {
    narrow: narrow.matches, compact: compact.matches, dark,
  });
  const view = index.get(target) || index.get(wanted);
  const currentRole = live?.accountRole() || roleFor(view.route);
  if (currentRole) {
    role = currentRole;
    savePreference("role", role);
  }
  const title = reset ? "Reset password" : cleanName(view.name);
  frame = view;
  document.title = title + " | PayShare";
  screen.setAttribute("aria-busy", "true");
  if (live) screen.inert = true;
  screen.dataset.route = reset ? route : view.route;
  screen.className = view.width <= 420 ? "phone" : "desktop";
  screen.classList.toggle("appearance-dark", view.route.endsWith("-dark") || dark);
  screen.classList.toggle("theme-adapted", dark && !view.route.endsWith("-dark"));
  screen.classList.toggle("sample-payment", /payment|payout|receipt|approved & paid|transactions|project funding/i.test(title));
  screen.style.setProperty("--frame-width", view.width + "px");
  screen.style.setProperty("--frame-height", view.height + "px");
  try {
    const response = await fetch(new URL("views/" + view.route + ".html", import.meta.url));
    if (!response.ok) throw new Error("This demo screen is temporarily unavailable.");
    const html = await response.text();
    await live?.prepare(reset ? route : view.route, () => version === renderVersion);
    if (version !== renderVersion) return;
    const template = document.createElement("template");
    template.innerHTML = html;
    screen.replaceChildren(template.content);
    screen.querySelectorAll("a[href]").forEach(node => {
      if (!node.getAttribute("href").startsWith("#/")) node.removeAttribute("href");
    });
    wireScreen(screen.dataset.route);
    live?.install(screen.dataset.route);
    if (/^(a\d{2}|reset-password)$/.test(screen.dataset.route)) applyAuthPlaceholders(screen);
    if (!live && !hideChrome && screen.classList.contains("sample-payment")) {
      const banner = element("p", demoMessages.payment);
      banner.className = "payment-note";
      screen.prepend(banner);
    }
    screen.inert = false;
    const modal = screen.querySelector('[data-layer="Modal"]');
    if (modal) modal.focus({ preventScroll:true });
    else if (document.activeElement?.id !== "explore") screen.focus({ preventScroll:true });
    window.scrollTo(0,0);
  } catch (error) {
    if (version === renderVersion) screen.replaceChildren(element("p", error.message));
  } finally {
    if (version === renderVersion) {
      screen.inert = false;
      screen.removeAttribute("aria-busy");
    }
  }
}
function setCatalogItems() {
  const phrase = normalize(search.value);
  list.replaceChildren();
  for (const [id, name] of Object.entries(groups)) {
    const items = frames.filter(view => view.page === id && (!catalogRole || roleFor(view.route) === catalogRole) && normalize(cleanName(view.name)).includes(phrase));
    if (!items.length) continue;
    const section = element("section");
    section.append(element("h3", name));
    const rows = element("ul");
    for (const view of items) {
      const row = element("li");
      const link = element("a", cleanName(view.name));
      link.href = href(view.route);
      link.addEventListener("click", () => catalog.close());
      row.append(link);
      rows.append(row);
    }
    section.append(rows);
    list.append(section);
  }
  if (!list.childElementCount) list.append(element("p", "No screens match."));
}
function showCatalog(scope = "", phrase = search.value) {
  catalogRole = typeof scope === "string" ? scope : "";
  search.value = phrase;
  setCatalogItems();
  if (!catalog.open) catalog.showModal();
  search.focus();
}
function switchTheme(next = !dark) {
  dark = next;
  savePreference("theme", dark ? "dark" : "light");
  const current = location.hash.match(/^#\/([\w-]+)(?:\?.*)?$/)?.[1];
  if (current?.endsWith("-dark")) goto(current.replace(/-dark$/, ""));
  else render();
  announce(dark ? "Dark theme" : "Light theme");
}
for (const { label, home } of Object.values(roles)) {
  const link = element("a", label);
  link.href = href(home);
  link.addEventListener("click", () => catalog.close());
  document.querySelector("#demo-roles").append(link);
}
document.querySelector(".skip").addEventListener("click", (event) => {
  event.preventDefault();
  screen.focus();
});
document.querySelector("#explore").addEventListener("click", () => showCatalog("", ""));
document.querySelector("#close-catalog").addEventListener("click", () => catalog.close());
document.querySelector("#theme").addEventListener("click", () => switchTheme());
search.addEventListener("input", setCatalogItems);
window.addEventListener("hashchange", render);
window.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && event.target.matches("#screen input") && event.target.type !== "file") {
    const action = (screen.querySelector('[role="dialog"]') || screen).querySelector("[data-submit]");
    if (action) { event.preventDefault(); action.click(); }
  }
  const modal = screen.querySelector('[data-layer="Modal"]');
  if (!modal || document.querySelector("dialog[open]")) return;
  if (event.key === "Escape") closeScreen(screen.dataset.route);
  if (event.key === "Tab") {
    const controls = [...modal.querySelectorAll('a[href], button, input, textarea, select')].filter(node => !node.disabled && node.getClientRects().length);
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && [first, modal].includes(document.activeElement)) {
      event.preventDefault();
      (last || modal).focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      (first || modal).focus();
    }
  }
});
narrow.addEventListener("change", render);
compact.addEventListener("change", render);
if (live) {
  document.querySelector("#demo").hidden = true;
  document.body.classList.add("workspace-live");
}
if (hideChrome) {
  document.querySelector("#demo").hidden = true;
  document.body.classList.add("compare-view");
}
document.documentElement.dataset.demoTextSize = readPreference("text-size", "");
render();
