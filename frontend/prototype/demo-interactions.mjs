import { demoMessages } from "./mock-data.mjs";
import { normalize } from "./navigation.mjs";

const preferences = new Map();
const fileSelections = new Map();

function button(text, action) {
  const node = document.createElement("button");
  node.type = "button";
  node.textContent = text;
  node.className = "demo-dialog-button";
  node.addEventListener("click", action);
  return node;
}

export function openDialog(title, render) {
  const dialog = document.createElement("dialog");
  dialog.className = "demo-dialog";
  const heading = document.createElement("h2");
  heading.textContent = title;
  heading.id = "demo-dialog-title";
  dialog.setAttribute("aria-labelledby", heading.id);
  dialog.append(heading);
  render(dialog);
  dialog.append(button("Close", () => dialog.close()));
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}

export function messageDialog(title, description) {
  return openDialog(title, dialog => {
    const text = document.createElement("p");
    text.textContent = description;
    dialog.append(text);
  });
}

export function editorDialog(title, label, onSave) {
  return openDialog(title, dialog => {
    const form = document.createElement("form");
    const field = document.createElement("label");
    const input = document.createElement("textarea");
    const submit = document.createElement("button");
    field.textContent = label;
    input.required = true;
    input.maxLength = 280;
    submit.textContent = "Save in demo";
    submit.className = "demo-dialog-button";
    field.append(input);
    form.append(field, submit);
    form.addEventListener("submit", event => {
      event.preventDefault();
      if (!input.value.trim()) return;
      onSave(input.value.trim());
      dialog.close();
    });
    dialog.append(form);
  });
}

export function pickFiles(scope, announce, { multiple = true, accept = "" } = {}) {
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = multiple;
  input.accept = accept;
  input.hidden = true;
  input.addEventListener("change", () => {
    showFiles(scope, input.files, announce);
    input.remove();
  }, { once: true });
  input.addEventListener("cancel", () => input.remove(), { once: true });
  scope.append(input);
  input.click();
}

export function showFiles(scope, files, announce) {
  if (!files.length) return;
  const names = [...files].map(file => file.name);
  const route = document.querySelector("#screen").dataset.route;
  fileSelections.set(route, names);
  const container = scope.closest('[data-layer^="Upload" i], [data-layer="Form"], [data-layer="Modal"]')
    || document.querySelector("#screen > [data-figma]");
  container.querySelector(".selection-details")?.remove();
  const details = document.createElement("p");
  details.className = "selection-details";
  details.textContent = "Selected locally: " + names.join(", ");
  container.append(details);
  announce("Files selected for this demo. Nothing was uploaded.");
}

export function saveMockFields(scope, route, announce) {
  const values = [...scope.querySelectorAll(".demo-input, [data-demo-choice] input")]
    .filter(input => !input.closest("[hidden]") &&
      !/password|pin|verification|search|email|phone|whatsapp|contact/i.test(input.getAttribute("aria-label") || ""))
    .map(input => [input.getAttribute("aria-label"), input.type === "checkbox" ? input.checked : input.value]);
  preferences.set(route, { values, files: fileSelections.get(route) || [] });
  announce(demoMessages.saved);
}

export function restoreMockFields(scope, route) {
  const saved = preferences.get(route);
  if (!saved) return;
  const values = new Map(saved.values);
  for (const input of scope.querySelectorAll(".demo-input, [data-demo-choice] input")) {
    const label = input.getAttribute("aria-label");
    if (!values.has(label)) continue;
    if (input.type === "checkbox") input.checked = values.get(label);
    else input.value = values.get(label);
  }
}

export function wireChoices(scope) {
  for (const row of scope.querySelectorAll('[data-layer="Checkbox"], [data-layer="Option"], [data-layer^="Switch" i]')) {
    const layer = row.dataset.layer.toLowerCase();
    const isOption = layer === "option";
    const isSwitch = layer.startsWith("switch");
    if (isSwitch && row.parentElement.closest('[data-layer^="Switch" i]')) continue;
    const text = row.querySelector("p");
    const label = text?.textContent.trim() || row.parentElement.querySelector("p")?.textContent.trim();
    if (!label) continue;
    const input = document.createElement("input");
    input.type = isOption ? "radio" : "checkbox";
    input.setAttribute("aria-label", label);
    if (isSwitch) input.setAttribute("role", "switch");
    if (isOption) {
      input.name = "demo-option";
      input.disabled = /not available|non-transferable/i.test(row.textContent);
    }
    input.required = /^I agree to the terms/i.test(label);
    input.checked = !input.required && (layer === "switch on" || !!row.querySelector('[data-layer="icon/check"]'));
    input.className = "demo-choice-input";
    row.dataset.demoChoice = "";
    row.prepend(input);
    row.addEventListener("click", event => {
      if (event.target.closest("a,button,input,select,textarea")) return;
      input.focus();
      input.click();
    });
  }
}

export function filterItems(scope, phrase, query = "") {
  const label = normalize(phrase).replace(/\s*\(?\d+\)?$/, "");
  const aliases = {
    active: /active|in progress/i, invited: /invited|awaiting acceptance/i,
    attention: /attention|extension|awaiting|change requested/i,
    "needs attention": /attention|extension|awaiting|change requested/i,
    done: /complete|done|paid/i, new: /new|awaiting acceptance/i,
    review: /review|submitted/i, waiting: /waiting|pending|awaiting/i,
    ready: /ready|approved/i, payments: /paid|payment|payout|USDC/i, unread: /unread/i,
  };
  const items = scope.querySelectorAll('[data-layer="Table"] [data-layer="Row"], [data-layer="Worker card"], [data-layer="Notification item"], [data-layer="Task card"], [data-layer="Activity"] > [data-layer="Row"]');
  let visible = 0;
  for (const item of items) {
    const content = item.textContent;
    const matches = !label || label === "all" || (aliases[label] || { test: value => normalize(value).includes(label) }).test(content) ||
      (label === "unread" && !!item.querySelector('[data-layer="Unread"]'));
    item.hidden = !matches || !normalize(content).includes(normalize(query));
    if (!item.hidden) visible++;
  }
  return { count: items.length, visible };
}

export function downloadSample(scope, label, announce) {
  const text = scope.querySelector('[data-layer="Table"], [data-layer="Receipt"], [data-layer="Content"]')?.innerText || "";
  const file = new Blob(["PayShare demo · Sample data only\nNo live transaction or receipt.\n\n", text], { type: "text/plain" });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = "payshare-demo.txt";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  announce(label + " is available as a sample text download.");
}
