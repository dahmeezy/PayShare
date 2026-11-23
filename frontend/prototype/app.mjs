import { demoMessages, readPreference, roles, savePreference } from "./mock-data.mjs";
import { authoredRoutes, displayRoute, groups, normalize, roleFor, targetFor } from "./navigation.mjs";

const screen = document.querySelector("#screen");
const catalog = document.querySelector("#catalog");
const list = document.querySelector("#catalog-list");
const search = document.querySelector("#screen-filter");
const status = document.querySelector("#notice");
const narrow = matchMedia("(max-width: 767px)");
const compact = matchMedia("(max-width: 370px)");
const hideChrome = new URL(location.href).searchParams.has("compare");
let role = readPreference("role", "contractor");
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
  if (index.has(route)) location.hash = href(route);
}
function labelOf(node) {
  return node.innerText.trim().replace(/\s+/g, " ");
}

function focusInvalid(onScreen) {
  const input = [...onScreen.querySelectorAll("input, textarea, select")]
    .find(el => el.required && !el.checkValidity());
  if (!input) return false;
  input.reportValidity();
  input.focus();
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
  const select = [...field.querySelectorAll("[data-layer]")].some(child => /chevron-down/i.test(child.dataset.layer));
  const multiline = /reason|description|message|feedback|instructions|notes|criteria/i.test(label) && field.clientHeight > 60;
  const input = element(select ? "select" : multiline ? "textarea" : "input");
  input.className = text.className + " demo-input";
  input.setAttribute("aria-label", label);
  if (select) {
    const values = /role/i.test(label) ? ["Contractor", "Worker", "Client"] : /language/i.test(label) ? ["English", "Yorùbá", "Igbo"]
      : /worker|assign/i.test(label) ? ["Amara Okafor", "Chidi Eze", "Ngozi Bello", "Femi", "Kemi"]
      : /status/i.test(label) ? ["Active", "Pending", "Completed"] : ["Other"];
    for (const value of new Set([sample, ...values].filter(Boolean))) input.append(element("option", value));
  } else {
    input.placeholder = sample;
    input.autocomplete = "off";
    if (input.tagName === "INPUT") {
      if (/password|\bpin\b/i.test(label)) {
        input.type = "password";
        input.required = true;
        input.minLength = /pin/i.test(label) ? 6 : 8;
        if (/pin/i.test(label)) {
          input.inputMode = "numeric";
          input.pattern = "[0-9]{6}";
          input.maxLength = 6;
        }
      } else if (/amount|budget|\bUSDC\b/i.test(label)) {
        input.inputMode = "decimal";
        input.pattern = "[0-9]+(\\.[0-9]{1,2})?";
      } else if (/email/i.test(label) && !/whatsapp|phone/i.test(label)) {
        input.type = "email";
      } else if (/code/i.test(label)) {
        input.inputMode = "numeric";
        input.pattern = "[0-9]{6}";
        input.required = true;
      }
    }
    if (/full name|email or whatsapp/i.test(label)) input.required = true;
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
    const query = normalize(input.value);
    const results = screen.querySelectorAll('[data-layer="Row"], [data-layer="Task card"]');
    for (const item of results) item.hidden = !!query && !normalize(item.textContent).includes(query);
    if (query && !results.length) {
      search.value = input.value;
      showCatalog();
    }
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
    if (input.files.length) announce(`${input.files.length} attachment(s) selected for the demo. No files were uploaded.`);
  });
  node.classList.add("demo-upload");
  node.append(input);
}
function isSubmit(label) {
  return /^(create account|log in|verify|continue|save|submit|send|authorize|invite|approve|accept)/i.test(label);
}
function installAction(node, label, route) {
  const layer = node.dataset.layer || "";
  let target = targetFor(route, layer, label, authored);
  if (/^Theme (Light|Dark)$/i.test(layer)) target = normalize(label) === "dark" ? "@dark" : "@light";
  if (layer === "Bell") target = { contractor:"c32", worker:"w13", client:"md07" }[role];
  if (/connect wallet/i.test(label)) target = "@wallet";
  if (/\bmore\b/i.test(label) && /nav item/i.test(layer)) target = "@catalog";
  if (/return to|go back/i.test(label) && !target) target = "@back";
  if (/appearance|switch theme|dark mode|light mode/i.test(label) && !target) target = "@theme";
  if (/signature|download|stellar expert|explorer|copy (address|link|hash)/i.test(label) && !target) target = "@receipt";
  if (/whatsapp/i.test(label) && !target) target = "whatsapp";
  if (label === "Back" && !target) target = "@back";

  const button = element(target && index.has(target) ? "a" : "button");
  if (button.tagName === "A") button.href = href(target);
  else button.type = "button";
  for (const attr of node.attributes) {
    if (!["type","href"].includes(attr.name)) button.setAttribute(attr.name, attr.value);
  }
  button.classList.add("demo-action");
  if (isSubmit(label)) button.dataset.submit = "";
  if (["Tab", "Chip"].includes(layer) && !target) button.setAttribute("aria-pressed", "false");
  if (!label) button.setAttribute("aria-label", layer || "Open action");
  button.append(...node.childNodes);
  node.replaceWith(button);
  button.addEventListener("click", (event) => {
    event.preventDefault();
    const modal = screen.querySelector('[data-layer="Modal"]');
    if (isSubmit(label) && focusInvalid(modal || screen)) return;
    if (target === "@catalog") return showCatalog();
    if (target === "@back") return history.back();
    if (target === "@theme") return switchTheme();
    if (target === "@light" || target === "@dark") return switchTheme(target === "@dark");
    if (target === "@wallet") return announce("Wallet connection is a demo. PayShare never asks for a private key.");
    if (target === "@receipt") return announce(demoMessages.receipt);
    if (target) {
      if (/authorize|fund|release/i.test(label)) announce(demoMessages.payment);
      else if (isSubmit(label)) announce(demoMessages.saved);
      goto(target);
    } else if (["Tab", "Chip"].includes(layer)) {
      const siblings = button.parentElement.querySelectorAll("[aria-pressed]");
      for (const sibling of siblings) sibling.setAttribute("aria-pressed", String(sibling === button));
      const hasStatus = /all|pending|active|completed|paid|progress|new/i.test(label);
      if (hasStatus) for (const row of screen.querySelectorAll('[data-layer="Table"] [data-layer="Row"]')) {
        row.hidden = !/^all$/i.test(label) && !normalize(row.textContent).includes(normalize(label));
      }
    } else if (/^(cancel|close|dismiss)$/i.test(label) || layer === "Close") {
      if (modal) goto(({ c12:"c11",c14:"c10",c16:"c15" })[route.replace("-dark","")] || "c01");
      else history.back();
    } else if (/view|open|browse|all/i.test(label)) {
      showCatalog();
    } else if (/audio|voice|play|record/i.test(label)) announce(demoMessages.voice);
    else if (/receipt/i.test(label)) announce(demoMessages.receipt);
    else announce(demoMessages.saved);
  });
}
function wireScreen(route) {
  const container = screen.firstElementChild;
  for (const node of screen.querySelectorAll('[data-layer="Input"]')) installInput(node);
  for (const node of screen.querySelectorAll('[data-layer="Search field"]')) installSearch(node);
  for (const node of screen.querySelectorAll('[data-layer^="Upload" i]')) {
    if (!node.parentElement.closest('[data-layer^="Upload" i]')) installUpload(node);
  }

  if (route === "a05") {
    const boxes = [...screen.querySelectorAll('[data-layer="Code"] > [data-layer="box"]')];
    boxes.forEach((box, i) => {
      const text = box.querySelector("p");
      const input = element("input");
      input.className = (text?.className || "") + " demo-input verification-digit";
      input.setAttribute("aria-label", "Verification digit " + (i + 1));
      input.inputMode = "numeric";
      input.pattern = "[0-9]";
      input.maxLength = 1;
      input.required = true;
      input.placeholder = text ? labelOf(text) : "";
      input.addEventListener("input", () => {
        input.value = input.value.replace(/[^0-9]/g, "");
        if (input.value) boxes[i + 1]?.querySelector("input")?.focus();
      });
      box.replaceChildren(input);
    });
  }
  for (const toggle of screen.querySelectorAll('[data-layer^="Switch" i]')) {
    toggle.setAttribute("role", "switch");
    toggle.setAttribute("aria-checked", String(/on/i.test(toggle.dataset.layer)));
    toggle.setAttribute("aria-label", labelOf(toggle.parentElement).split(/\n/)[0] || "Notification preference");
    toggle.tabIndex = 0;
    const flip = () => toggle.setAttribute("aria-checked", String(toggle.getAttribute("aria-checked") !== "true"));
    toggle.addEventListener("click", flip);
    toggle.addEventListener("keydown", event => { if (event.key === " ") { event.preventDefault(); flip(); } });
  }

  const actions = screen.querySelectorAll('[data-layer="Button"], [data-layer="Sidebar item"], [data-layer="Bottom nav item"], [data-layer="Logo"], [data-layer="Tab"], [data-layer="Row"], [data-layer="Cell"], [data-layer="Chip"], [data-layer="Play"], [data-layer="Close"], [data-layer="Bell"], [data-layer="CTA"], [data-layer="Quick reply"], [data-layer^="Theme "]');
  for (const node of actions) {
    if (!screen.contains(node) || node.closest("a,button") || node.querySelector("input,select,textarea")) continue;
    const label = labelOf(node);
    const layer = node.dataset.layer;
    if (["Cell", "Row", "Chip"].includes(layer) && !targetFor(route, layer, label, authored)) continue;
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
    if (/^(log in|sign up|forgot password\?|create an account|back to log in|resend code|or get the code on whatsapp instead)$/i.test(label)) {
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
  if (container) container.setAttribute("aria-label", cleanName(frame.name));
}

async function render() {
  if (!index.size) return;
  const version = ++renderVersion;
  const route = location.hash.match(/^#\/([\w-]+)$/)?.[1] || "a01";
  const wanted = index.has(route) ? route : "a01";
  const target = displayRoute(wanted, index, {
    narrow: narrow.matches, compact: compact.matches, dark,
  });
  const view = index.get(target) || index.get(wanted);
  const currentRole = roleFor(view.route);
  if (currentRole) {
    role = currentRole;
    savePreference("role", role);
  }
  const title = cleanName(view.name);
  frame = view;
  document.title = title + " | PayShare";
  screen.setAttribute("aria-busy", "true");
  screen.dataset.route = view.route;
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
    if (version !== renderVersion) return;
    const template = document.createElement("template");
    template.innerHTML = html;
    screen.replaceChildren(template.content);
    screen.querySelectorAll("a[href]").forEach(node => {
      if (!node.getAttribute("href").startsWith("#/")) node.removeAttribute("href");
    });
    wireScreen(view.route);
    if (!hideChrome && screen.classList.contains("sample-payment")) {
      const banner = element("p", demoMessages.payment);
      banner.className = "payment-note";
      screen.prepend(banner);
    }
    if (document.activeElement?.id !== "explore") screen.focus({ preventScroll:true });
    window.scrollTo(0,0);
  } catch (error) {
    if (version === renderVersion) screen.replaceChildren(element("p", error.message));
  } finally {
    if (version === renderVersion) screen.removeAttribute("aria-busy");
  }
}
function setCatalogItems() {
  const phrase = normalize(search.value);
  list.replaceChildren();
  for (const [id, name] of Object.entries(groups)) {
    const items = frames.filter(view => view.page === id && normalize(cleanName(view.name)).includes(phrase));
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
function showCatalog() {
  setCatalogItems();
  if (!catalog.open) catalog.showModal();
  search.focus();
}
function switchTheme(next = !dark) {
  dark = next;
  savePreference("theme", dark ? "dark" : "light");
  const current = location.hash.match(/^#\/([\w-]+)$/)?.[1];
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
document.querySelector("#explore").addEventListener("click", showCatalog);
document.querySelector("#close-catalog").addEventListener("click", () => catalog.close());
document.querySelector("#theme").addEventListener("click", () => switchTheme());
search.addEventListener("input", setCatalogItems);
window.addEventListener("hashchange", render);
window.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && event.target.matches("#screen input") && event.target.type !== "file") {
    const action = (screen.querySelector('[role="dialog"]') || screen).querySelector("[data-submit]");
    if (action) { event.preventDefault(); action.click(); }
  }
  if (event.key === "Escape" && !catalog.open && screen.querySelector('[role="dialog"]')) history.back();
});
narrow.addEventListener("change", render);
compact.addEventListener("change", render);
if (hideChrome) document.querySelector("#demo").hidden = true;
render();
