// Sign-up, log-in, email verification and onboarding. The navy brand panel is the Figma
// frame's; the form beside it is built here so every control is real and accessible.
import { api } from "./api.mjs";
import { wireCodeInputs } from "./auth-controls.mjs";
import { passwordStrength } from "./password-strength.mjs";
import { busy, button, el, field, heading, notificationChannels, onSubmit, say, status, steps } from "./ui-kit.mjs";
import { initials } from "./live-elements.mjs";

const link = (route, text) => el("a", { href: "#/" + route, class: "ps-link" }, text);
const clock = milliseconds => {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
};
// Invited people never choose a role, so their setup is one step shorter.
const step = (user, position) => user.invited ? steps(position - 1, 2) : steps(position, 3);

function strengthMeter(control) {
  const bars = Array.from({ length: 4 }, () => el("span"));
  const label = el("p", { class: "ps-strength-label", "aria-live": "polite" });
  const root = el("div", { class: "ps-strength", "data-score": "0" }, el("div", { class: "ps-strength-bars", "aria-hidden": "true" }, bars), label);
  const update = () => {
    const result = passwordStrength(control.value);
    root.dataset.score = String(result.score);
    label.textContent = [result.label, result.tip].filter(Boolean).join(" · ");
  };
  control.addEventListener("input", update);
  update();
  return root;
}

function signUp(form, { signedIn, invitation }) {
  const first = field({ label: "First name", name: "firstName", required: true, maxlength: 60, autocomplete: "given-name", placeholder: "Enter your first name" });
  const last = field({ label: "Last name", name: "lastName", required: true, maxlength: 60, autocomplete: "family-name", placeholder: "Enter your last name" });
  const email = field({ label: "Email address", name: "email", type: "email", required: true, maxlength: 254, autocomplete: "email", placeholder: "e.g. name@example.com" });
  const password = field({ label: "Create a password", name: "password", type: "password", required: true, maxlength: 128, autocomplete: "new-password",
    placeholder: "At least 8 characters", check: value => value.trim().length < 8 ? "Use at least 8 characters." : "" });
  password.root.insertBefore(strengthMeter(password.control), password.root.lastChild);
  const agree = el("input", { type: "checkbox", id: "ps-agree", name: "acceptTerms", "aria-describedby": "ps-agree-note" });
  const agreeNote = el("p", { id: "ps-agree-note", class: "ps-hint" });
  const terms = {
    control: agree,
    validate() {
      agree.setAttribute("aria-invalid", String(!agree.checked));
      agreeNote.textContent = agree.checked ? "" : "Agree to the Terms and Privacy Policy to continue.";
      agreeNote.classList.toggle("ps-error", !agree.checked);
      return agree.checked;
    },
  };
  agree.addEventListener("change", () => { if (agree.getAttribute("aria-invalid") === "true") terms.validate(); });
  const policy = (file, text) => el("a", { href: "legal/" + file + ".html", target: "_blank", rel: "noopener", class: "ps-link" }, text);
  const submit = button("Create account", { type: "submit" });
  const feedback = status();
  const banner = el("p", { class: "ps-callout", hidden: true });
  invitation?.then(result => {
    if (!result) return;
    banner.hidden = false;
    banner.textContent = "You’re invited to " + result.name + " as a " + result.role + ". Sign up with the invited email address.";
  });
  form.append(heading("Create your account", "We’ll email you a code to confirm your address."), banner,
    el("div", { class: "ps-row" }, first.root, last.root), email.root, password.root,
    el("div", {}, el("div", { class: "ps-check" }, agree,
      el("label", { for: "ps-agree" }, "I agree to the ", policy("terms", "Terms"), " and ", policy("privacy", "Privacy Policy"))), agreeNote),
    submit, feedback, el("p", { class: "ps-foot" }, "Already have an account? ", link("a03", "Log in")));
  onSubmit(form, submit, "Creating account…", feedback, () => [first, last, email, password, terms], async () => {
    // An expired or used invitation left in this tab must not block an ordinary sign-up.
    const invited = invitation && await invitation;
    await signedIn(await api("/register", "POST", {
      firstName: first.value(), lastName: last.value(), email: email.value(), password: password.value(),
      acceptTerms: agree.checked, invitationToken: invited ? sessionStorage.getItem("payshare-invitation") : undefined,
    }));
  });
  return first.control;
}

function logIn(form, { signedIn, problem }) {
  const email = field({ label: "Email address", name: "email", type: "email", required: true, autocomplete: "username", placeholder: "e.g. name@example.com" });
  const password = field({ label: "Password", name: "password", type: "password", required: true, autocomplete: "current-password", placeholder: "Enter your password" });
  const remember = el("input", { type: "checkbox", id: "ps-remember", checked: true });
  const submit = button("Log in", { type: "submit" });
  const feedback = status();
  if (problem) say(feedback, problem, "error");
  form.append(heading("Log in", "Good to see you again."), email.root, password.root,
    el("div", { class: "ps-between" }, el("div", { class: "ps-check" }, remember, el("label", { for: "ps-remember" }, "Keep me logged in")),
      link("a04", "Forgot password?")),
    submit, feedback, el("p", { class: "ps-foot" }, "New to PayShare? ", link("a02", "Create an account")));
  onSubmit(form, submit, "Logging in…", feedback, () => [email, password], async () => {
    await signedIn(await api("/login", "POST", { email: email.value(), password: password.value(), remember: remember.checked }));
  });
  return email.control;
}

function forgot(form) {
  const email = field({ label: "Email address", name: "email", type: "email", required: true, autocomplete: "email", placeholder: "e.g. name@example.com" });
  const submit = button("Check recovery availability", { type: "submit" });
  const feedback = status();
  form.append(link("a03", "← Back to log in"), heading("Reset your password", "Password recovery isn’t available yet. No reset message will be sent."),
    email.root, submit, feedback);
  onSubmit(form, submit, "Checking…", feedback, () => [email], async () => {
    say(feedback, (await api("/forgot", "POST", { email: email.value() })).message);
  });
  return email.control;
}

function verify(form, context) {
  const { user, signedIn, signOut } = context;
  let state = user.verification;
  const intro = el("p");
  const inputs = Array.from({ length: 6 }, (_, index) => el("input", {
    class: "ps-digit", "aria-label": "Verification digit " + (index + 1), autocomplete: index ? "off" : "one-time-code",
  }));
  const digitError = el("p", { class: "auth-feedback ps-error", role: "alert" });
  const read = wireCodeInputs(inputs, digitError);
  const expiry = el("p", { class: "ps-hint" });
  const submit = button("Verify", { type: "submit" });
  const resend = button("Resend code", { variant: "text" });
  const feedback = status();

  function describe() {
    intro.textContent = state.sent ? "We sent a 6-digit code to " + user.email + "."
      : state.deliveryAvailable ? "A code couldn’t be sent to " + user.email + ". Choose Resend code to try again."
        : "Email delivery isn’t set up on this PayShare server, so no code was sent to " + user.email + ". Your account stays locked until the team enables it.";
    intro.classList.toggle("ps-callout", !state.sent);
  }
  function tick() {
    const wait = (state.resendAt || 0) - Date.now();
    const resending = resend.getAttribute("aria-busy") === "true";
    if (!resending) {
      resend.disabled = !state.deliveryAvailable || wait > 0;
      resend.textContent = wait > 0 && state.deliveryAvailable ? "Resend in " + clock(wait) : "Resend code";
    }
    const left = (state.expiresAt || 0) - Date.now();
    expiry.textContent = !state.sent ? "" : left > 0 ? "The code expires in " + clock(left) + "." : "This code has expired. Request a new one.";
    submit.disabled = !state.sent || submit.getAttribute("aria-busy") === "true";
  }
  resend.addEventListener("click", () => busy(resend, "Sending…", feedback, async () => {
    const updated = await api("/verify/resend", "POST", {});
    if (updated.emailVerified) return signedIn(updated);
    state = updated.verification;
    for (const input of inputs) input.value = "";
    describe();
    inputs[0].focus();
    return "A new code is on its way. Earlier codes no longer work.";
  }).then(tick));

  form.noValidate = true;
  form.addEventListener("submit", event => {
    event.preventDefault();
    const code = read();
    if (code.length < 6) {
      digitError.textContent = "Enter all six digits.";
      (inputs.find(input => !input.value) || inputs[0]).focus();
      return;
    }
    void busy(submit, "Verifying…", feedback, async () => {
      try { await signedIn(await api("/verify", "POST", { code })); }
      catch (error) {
        for (const input of inputs) input.setAttribute("aria-invalid", "true");
        inputs[0].focus();
        throw error;
      }
    }).then(tick);
  });
  form.append(el("span", { class: "ps-icon-circle" }, el("img", { src: "prototype/assets/ca8ac9a2d8463235.svg", alt: "" })),
    el("div", { class: "ps-heading" }, el("h1", {}, "Enter your code"), intro),
    el("div", { class: "ps-code", role: "group", "aria-label": "Verification code" }, inputs), digitError, expiry, submit, feedback,
    el("p", { class: "ps-foot" }, "Didn’t get it? ", resend),
    button("Use a different email", { variant: "text", onclick: () => signOut("a02") }));
  describe();
  tick();
  const timer = setInterval(() => { if (form.isConnected) tick(); else clearInterval(timer); }, 500);
  return inputs[0];
}

const roleCards = [
  ["client", "I’m a client", "I fund projects and confirm deliverables."],
  ["contractor", "I manage projects (contractor)", "I set budgets, assign tasks and pay my team."],
  ["worker", "I do the work (worker)", "I accept tasks and get paid my agreed share."],
];
function chooseRole(form, { user, updated, go }, art) {
  for (const image of art) image.removeAttribute("class");
  const options = roleCards.map(([role, title, text], index) => {
    const input = el("input", { type: "radio", name: "role", value: role, checked: user.role === role });
    return el("label", { class: "ps-role" }, el("span", { class: "ps-icon-box" }, art[index]),
      el("span", { class: "ps-role-text" }, el("strong", {}, title), el("span", {}, text)), input, el("span", { class: "ps-radio", "aria-hidden": "true" }));
  });
  const submit = button("Continue", { type: "submit" });
  const feedback = status();
  form.append(steps(1, 3), heading("How will you use PayShare?", "Your role decides what you can see and do. You can change it until setup is finished."),
    el("fieldset", { class: "ps-roles" }, el("legend", { class: "ps-visually-hidden" }, "Account role"), options), submit, feedback);
  form.addEventListener("submit", event => {
    event.preventDefault();
    const role = form.querySelector('input[name="role"]:checked')?.value;
    if (!role) return say(feedback, "Choose how you will use PayShare.", "error");
    void busy(submit, "Saving…", feedback, async () => {
      updated(await api("/onboarding/role", "PUT", { role }));
      go("a08");
    });
  });
  // No automatic focus: a focus ring on the first card would look like a choice already made.
}

function profile(form, { user, updated, go }) {
  const first = field({ label: "First name", name: "firstName", required: true, maxlength: 60, autocomplete: "given-name", value: user.firstName, placeholder: "Enter your first name" });
  const last = field({ label: "Last name", name: "lastName", required: true, maxlength: 60, autocomplete: "family-name", value: user.lastName, placeholder: "Enter your last name" });
  const wallet = field({ label: "Public Stellar wallet", name: "stellarAddress", maxlength: 56, autocomplete: "off", spellcheck: "false",
    value: user.stellar_address || "", placeholder: "Enter your public Stellar address (G...)", pattern: "G[A-Z2-7]{55}",
    title: "A public Stellar address starts with G and has 56 characters.",
    hint: "Optional. PayShare never asks for a private key." });
  const avatar = el("span", { class: "ps-avatar", "aria-hidden": "true" }, initials(user.name));
  for (const item of [first, last]) item.control.addEventListener("input", () => { avatar.textContent = initials(first.value() + " " + last.value()); });
  const submit = button("Continue", { type: "submit" });
  const feedback = status();
  form.append(step(user, 2), heading("Set up your profile", "This helps your team recognise you."),
    el("div", { class: "ps-profile-head" }, avatar, el("p", {}, user.email, el("span", { class: "ps-badge ps-badge-good" }, "Email verified"))),
    el("div", { class: "ps-row" }, first.root, last.root), wallet.root,
    el("div", { class: "ps-actions" },
      !user.invited && button("Back", { variant: "secondary", onclick: () => go("a07") }),
      el("span", { class: "ps-spacer" }), button("Skip for now", { variant: "text", onclick: () => go("a09") }), submit),
    feedback);
  onSubmit(form, submit, "Saving…", feedback, () => [first, last, wallet], async () => {
    updated(await api("/profile", "PUT", { firstName: first.value(), lastName: last.value(), stellarAddress: wallet.value() }));
    go("a09");
  });
  return first.control;
}

function reachYou(form, { user, updated, go, finished }) {
  const channels = notificationChannels(user.preferences.notifications);
  const submit = button("Finish setup", { type: "submit" });
  const feedback = status();
  form.append(step(user, 3), heading("How should we reach you?", "Agreements and payments always stay in PayShare. Notifications only tell you something changed."),
    el("div", { class: "ps-toggles" }, Object.values(channels).map(channel => channel.root)),
    el("div", { class: "ps-actions" }, button("Back", { variant: "secondary", onclick: () => go("a08") }), el("span", { class: "ps-spacer" }), submit),
    feedback);
  onSubmit(form, submit, "Finishing…", feedback, () => [], async () => {
    updated(await api("/preferences", "PUT", { notifications: { email: channels.email.input.checked, inApp: channels.inApp.input.checked } }));
    await finished(await api("/onboarding/complete", "POST", {}));
  });
  return channels.email.input;
}

const screens = { a02: signUp, a03: logIn, a04: forgot, a05: verify, a07: chooseRole, a08: profile, a09: reachYou };
export const rendersAuth = route => Object.hasOwn(screens, route);

export function renderAuth(root, route, context) {
  const original = root.querySelector('[data-layer="Form"]');
  if (!original) return;
  // Keep the Figma role icons before the sample content is replaced.
  const art = [...original.querySelectorAll('[data-layer="Role"] [data-layer="box"] img')];
  const form = el("form", { class: "ps-form", "data-layer": "Form" });
  const target = screens[route](form, context, art);
  const home = el("a", { href: "#/a01", class: "ps-mobile-logo" }, "PayShare");
  original.replaceWith(form);
  form.prepend(home);
  // Focus once the screen is interactive again.
  requestAnimationFrame(() => requestAnimationFrame(() => target?.isConnected && target.focus({ preventScroll: true })));
}
