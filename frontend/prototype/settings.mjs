// Settings for all three roles, laid out like the Figma "C33 · Settings" frame: page
// header, tabs, the active section on the left and the account summary on the right.
import { api } from "./api.mjs";
import { initials } from "./live-elements.mjs";
import { button, el, field, notificationChannels, onSubmit, say, status } from "./ui-kit.mjs";

const roleNames = { client: "Client", contractor: "Contractor", worker: "Worker" };
export const settingsTabs = [["profile", "Profile"], ["appearance", "Appearance"], ["notifications", "Notifications"],
  ["security", "Security"], ["wallet", "Payout wallet"]];
const walletHelp = {
  client: "The public Stellar account you fund testnet projects from. PayShare matches your deposit against it.",
  contractor: "Your own public Stellar account. Workers are paid from the project funding account, never from this one.",
  worker: "The public Stellar account that receives your testnet payouts. Save it before a testnet task is assigned to you.",
};

const card = (title, description, ...children) => el("section", { class: "ps-card" },
  el("div", { class: "ps-card-head" }, el("h2", {}, title), description && el("p", {}, description)), ...children);
const fact = (name, value) => el("div", { class: "ps-fact" }, el("dt", {}, name), el("dd", {}, value));
const shorten = address => address.slice(0, 6) + "…" + address.slice(-6);

const sections = {
  profile({ user, updated }, summary) {
    const first = field({ label: "First name", name: "firstName", required: true, maxlength: 60, autocomplete: "given-name", value: user.firstName, placeholder: "Enter your first name" });
    const last = field({ label: "Last name", name: "lastName", required: true, maxlength: 60, autocomplete: "family-name", value: user.lastName, placeholder: "Enter your last name" });
    const email = field({ label: "Email address", name: "email", type: "email", value: user.email, readonly: true,
      hint: "Your email identifies your account and can’t be changed here." });
    const save = button("Save profile", { type: "submit" });
    const feedback = status();
    const form = el("form", {}, card("Profile", "How your team sees you.", el("div", { class: "ps-row" }, first.root, last.root), email.root,
      el("dl", {}, fact("Role", roleNames[user.role])), el("div", { class: "ps-actions" }, save), feedback));
    onSubmit(form, save, "Saving…", feedback, () => [first, last], async () => {
      summary(updated(await api("/profile", "PUT", { firstName: first.value(), lastName: last.value() })));
      return "Profile saved.";
    });
    return [form];
  },

  appearance({ user, updated, setAppearance, appearance }) {
    const feedback = status();
    const save = (change, apply) => {
      apply();
      return api("/preferences", "PUT", change).then(result => { updated(result); say(feedback, "Appearance saved.", "success"); })
        .catch(error => say(feedback, error.message, "error"));
    };
    const current = appearance();
    const themes = [["light", "Light"], ["dark", "Dark"], ["system", "Match device"]].map(([value, text]) => el("label", { class: "ps-theme" },
      el("span", { class: "ps-theme-preview ps-theme-" + value, "aria-hidden": "true" }, el("i"), el("i"), el("i")),
      el("span", { class: "ps-theme-name" },
        el("input", { type: "radio", name: "appearance", value, checked: current === value,
          onchange: () => save({ appearance: value }, () => setAppearance(value)) }), text)));
    const sizes = [["default", "Default"], ["large", "Large"], ["extra-large", "Extra large"]].map(([value, text]) => el("label", { class: "ps-chip" },
      el("input", { type: "radio", name: "textSize", value, checked: user.preferences.textSize === value,
        onchange: () => save({ textSize: value }, () => { document.documentElement.dataset.demoTextSize = value === "default" ? "" : value; }) }),
      el("span", {}, text)));
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Your device time zone";
    return [
      card("Appearance", "Choose how PayShare looks. Your choice follows your account.",
        el("fieldset", { class: "ps-themes" }, el("legend", { class: "ps-visually-hidden" }, "Theme"), themes),
        el("p", { class: "ps-hint" }, "Dark mode uses the same colours, tuned for low light. Amounts and statuses keep the same meaning in both modes."),
        el("fieldset", { class: "ps-chips" }, el("legend", {}, "Text size"), sizes), feedback),
      card("Language & region", null, el("dl", {}, fact("Language", "English (the only supported language)"), fact("Time zone", zone + " · from your device"))),
    ];
  },

  notifications({ user, updated }) {
    const feedback = status();
    const channels = notificationChannels(user.preferences.notifications, (key, enabled, input) => {
      input.disabled = true;
      api("/preferences", "PUT", { notifications: { [key]: enabled } })
        .then(result => { updated(result); say(feedback, "Notification preference saved.", "success"); })
        .catch(error => { input.checked = !enabled; say(feedback, error.message, "error"); })
        .finally(() => { input.disabled = false; });
    });
    return [card("Notifications", "Changes save as you make them.",
      el("div", { class: "ps-toggles" }, Object.values(channels).map(channel => channel.root)), feedback)];
  },

  security({ user, updated, capabilities, startTour }) {
    const current = field({ label: "Current password", name: "currentPassword", type: "password", required: true, autocomplete: "current-password", placeholder: "Enter your current password" });
    const next = field({ label: "New password", name: "newPassword", type: "password", required: true, maxlength: 128, autocomplete: "new-password",
      placeholder: "At least 8 characters", check: value => value.trim().length < 8 ? "Use at least 8 characters." : "" });
    const save = button("Change password", { type: "submit" });
    const feedback = status();
    const password = el("form", {}, card("Password", "Changing it signs you out on your other devices.", current.root, next.root,
      el("div", { class: "ps-actions" }, save), feedback));
    onSubmit(password, save, "Saving…", feedback, () => [current, next], async () => {
      updated(await api("/password", "PUT", { currentPassword: current.value(), password: next.value() }));
      password.reset();
      return "Password changed.";
    });
    const blocks = [password];
    if (user.role === "contractor") {
      const pin = options => field({ type: "password", required: true, maxlength: 6, inputmode: "numeric", pattern: "\\d{6}",
        title: "Use exactly six digits.", autocomplete: "off", placeholder: "6 digits", ...options });
      const old = pin({ label: "Current payout PIN", name: "currentPin" });
      const fresh = pin({ label: "New payout PIN", name: "pin" });
      const submit = button(capabilities.payoutPinSet ? "Change payout PIN" : "Create payout PIN", { type: "submit" });
      const note = status();
      old.root.hidden = !capabilities.payoutPinSet;
      const form = el("form", {}, card("Payout PIN", "Every payout needs this PIN. A signed-in session alone can’t release money.",
        old.root, fresh.root, el("div", { class: "ps-actions" }, submit), note));
      onSubmit(form, submit, "Saving…", note, () => capabilities.payoutPinSet ? [old, fresh] : [fresh], async () => {
        await api("/workspace/pin", "PUT", { pin: fresh.value(), currentPin: capabilities.payoutPinSet ? old.value() : undefined });
        capabilities.payoutPinSet = true;
        form.reset();
        old.root.hidden = false;
        submit.textContent = "Change payout PIN";
        return "Payout PIN saved.";
      });
      blocks.push(form);
    }
    blocks.push(card("Two-step sign-in", null, el("p", { class: "ps-hint" }, "Not available yet.")),
      card("Help", null, el("div", { class: "ps-actions" }, button("Replay the product tour", { variant: "secondary", onclick: startTour }))));
    return blocks;
  },

  wallet({ user, updated }, summary) {
    const wallet = field({ label: "Public Stellar wallet", name: "stellarAddress", maxlength: 56, autocomplete: "off", spellcheck: "false",
      value: user.stellar_address || "", placeholder: "Enter your public Stellar address (G...)", pattern: "G[A-Z2-7]{55}",
      title: "A public Stellar address starts with G and has 56 characters.", hint: "Stellar testnet. Never enter a secret key (starting with S)." });
    const save = button("Save wallet", { type: "submit" });
    const feedback = status();
    const form = el("form", {}, card("Payout wallet", walletHelp[user.role], wallet.root, el("div", { class: "ps-actions" }, save), feedback));
    onSubmit(form, save, "Saving…", feedback, () => [wallet], async () => {
      summary(updated(await api("/profile", "PUT", { firstName: user.firstName, lastName: user.lastName, stellarAddress: wallet.value() })));
      return wallet.value() ? "Wallet saved." : "Wallet removed.";
    });
    return [form];
  },
};

export function renderSettings(content, context) {
  let { user } = context;
  const active = settingsTabs.some(([id]) => id === context.tab) ? context.tab : "profile";
  const rail = el("aside", { class: "ps-rail", "aria-label": "Account summary" });
  function summary(latest = user) {
    user = latest;
    rail.replaceChildren(
      el("section", { class: "ps-card" },
        el("div", { class: "ps-profile-head" }, el("span", { class: "ps-avatar", "aria-hidden": "true" }, initials(user.name)),
          el("p", {}, el("strong", {}, user.name), el("span", {}, roleNames[user.role]))),
        el("dl", {}, fact("Email", user.email), fact("Verified", user.emailVerified ? "Email" : "Not verified"),
          fact("Wallet", user.stellar_address ? shorten(user.stellar_address) : "Not configured"))),
      card("Security", null, el("p", { class: "ps-hint" }, user.role === "contractor"
        ? "Payouts always need your PIN in PayShare. A message can never approve money on its own."
        : "Payments are released only after the agreed approvals and the contractor’s PIN."),
      button("Sign out", { variant: "secondary", onclick: event => context.logout(event.target) })));
    return user;
  }
  summary();
  const tabs = el("nav", { class: "ps-tabs", "aria-label": "Settings sections" }, settingsTabs.map(([id, text]) =>
    el("a", { href: "#/" + context.route + "?tab=" + id, "aria-current": id === active ? "page" : false }, text)));
  const body = sections[active]({ ...context, user }, summary);
  content.replaceChildren(
    el("header", { class: "ps-page-header" }, el("p", {}, "Settings"), el("h1", {}, "Settings"),
      el("p", {}, "Your profile, appearance, notifications and security.")),
    tabs, el("div", { class: "ps-columns" }, el("div", { class: "ps-stack" }, body), rail));
  content.classList.add("ps-page");
  // Keep the chosen tab in view where the tab row scrolls.
  tabs.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
}
