// Small building blocks for the screens PayShare renders itself (sign-up, onboarding,
// settings and notifications). Styles are in app-screens.css and follow the Figma frames.
import { addPasswordToggle } from "./auth-controls.mjs";

export function el(tag, attributes = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined || value === null || value === false) continue;
    if (name.startsWith("on")) node.addEventListener(name.slice(2), value);
    else if (name === "class") node.className = value;
    else if (name === "value") node.value = value;
    else if (name === "checked") node.checked = value;
    else node.setAttribute(name, value === true ? "" : value);
  }
  node.append(...children.flat().filter(child => child !== undefined && child !== null && child !== false));
  return node;
}

// Figma icons already bundled with the screens.
export const icons = {
  bell: "0507175fcf34a594", mail: "4b0a0977ca944975", message: "4666ab532501dc4a",
};
export const icon = (file, size = 18) => el("img", { src: "prototype/assets/" + file + ".svg", alt: "", width: size, height: size });

let nextId = 0;
export function field({ label, name, type = "text", hint, check, ...attributes }) {
  const id = "ps-" + name + "-" + ++nextId;
  const control = el("input", { id, name, type, class: "ps-input auth-input", "aria-describedby": id + "-note", ...attributes });
  const note = el("p", { id: id + "-note", class: "ps-hint" }, hint || "");
  const wrap = el("div", { class: "ps-input-wrap" }, control);
  const root = el("div", { class: "ps-field" }, el("label", { for: id }, label), wrap, note);
  if (type === "password") addPasswordToggle(control, null);
  const validate = () => {
    let message = "";
    if (control.required && !control.value.trim()) message = "Enter " + label.toLowerCase().replace(/^(your|a) /, "your ") + ".";
    else if (control.validity.typeMismatch && type === "email") message = "Enter a valid email address.";
    else if (control.validity.patternMismatch) message = control.title;
    else message = check?.(control.value) || "";
    control.setAttribute("aria-invalid", String(Boolean(message)));
    note.textContent = message || hint || "";
    note.classList.toggle("ps-error", Boolean(message));
    return !message;
  };
  // Once a problem is shown, clear it as soon as it is fixed.
  control.addEventListener("input", () => { if (control.getAttribute("aria-invalid") === "true") validate(); });
  return { root, control, validate, value: () => type === "password" ? control.value : control.value.trim() };
}

export function button(label, attributes = {}) {
  const { variant = "primary", ...rest } = attributes;
  return el("button", { type: "button", class: "ps-button ps-button-" + variant, ...rest }, label);
}

export const status = () => el("p", { class: "ps-status", role: "status" });
export function say(node, message, tone = "info") {
  node.textContent = message;
  node.dataset.tone = tone;
}

// Runs an action once at a time with a visible busy state and readable errors.
export async function busy(control, label, feedback, action) {
  if (control.getAttribute("aria-busy") === "true") return;
  const original = control.textContent;
  control.setAttribute("aria-busy", "true");
  control.disabled = true;
  if (label) control.textContent = label;
  say(feedback, "");
  try {
    const message = await action();
    if (message) say(feedback, message, "success");
  } catch (error) {
    say(feedback, error.message, "error");
  } finally {
    control.removeAttribute("aria-busy");
    control.disabled = false;
    if (label) control.textContent = original;
  }
}

export function onSubmit(form, submit, label, feedback, fields, action) {
  form.noValidate = true;
  form.addEventListener("submit", event => {
    event.preventDefault();
    const invalid = fields().filter(item => !item.validate());
    if (invalid.length) return invalid[0].control.focus();
    void busy(submit, label, feedback, action);
  });
}

export function steps(current, total) {
  return el("div", { class: "ps-steps" },
    Array.from({ length: total }, (_, index) => el("span", { class: index < current ? "done" : "", "data-current": index === current - 1 })),
    el("p", {}, "Step " + current + " of " + total));
}

export function heading(title, text) {
  return el("div", { class: "ps-heading" }, el("h1", {}, title), text && el("p", {}, text));
}

export function toggle({ label, description, checked, disabled, badge, onchange }) {
  const id = "ps-toggle-" + ++nextId;
  const input = el("input", { type: "checkbox", role: "switch", id, checked, disabled,
    "aria-describedby": id + "-note", onchange: onchange && (() => onchange(input.checked, input)) });
  return { input, root: el("label", { class: "ps-toggle" + (disabled ? " is-disabled" : ""), for: id },
    el("span", { class: "ps-toggle-text" },
      el("span", { class: "ps-toggle-title" }, label, badge && el("span", { class: "ps-badge" }, badge)),
      el("span", { class: "ps-toggle-note", id: id + "-note" }, description)),
    input, el("span", { class: "ps-switch", "aria-hidden": "true" })) };
}

// The channels, shared by onboarding and settings. English is the only message language,
// so there is nothing to choose.
export function notificationChannels(preferences, onchange) {
  const channel = (key, iconFile, options) => {
    const row = toggle({ ...options, checked: options.disabled ? false : preferences[key],
      onchange: onchange && ((value, input) => onchange(key, value, input)) });
    row.root.prepend(el("span", { class: "ps-icon-box" }, icon(iconFile)));
    row.root.dataset.channel = key;
    return row;
  };
  return {
    whatsapp: channel("whatsapp", icons.message, { label: "WhatsApp", disabled: true, badge: "Not available yet",
      description: "WhatsApp messages aren’t sent by PayShare." }),
    email: channel("email", icons.mail, { label: "Email",
      description: "Saves your choice. Update emails aren’t sent yet; only sign-up codes are." }),
    inApp: channel("inApp", icons.bell, { label: "In-app notifications",
      description: "Show tasks, approvals and payments in PayShare, in English." }),
  };
}
