import { addPasswordToggle, demoCode, validContact, wireCode } from "./auth-controls.mjs";

const form = document.querySelector("form");
const page = location.pathname.split("/").at(-1);
const feedback = document.querySelector("#auth-feedback");

for (const input of document.querySelectorAll('input[type="password"]')) {
  const field = document.createElement("span");
  field.className = "password-field";
  input.before(field);
  field.append(input);
  addPasswordToggle(input);
}

if (page === "verify.html") {
  const verify = wireCode([...document.querySelectorAll(".code-box")], feedback);
  form.addEventListener("submit", event => {
    event.preventDefault();
    if (verify()) location.assign("prototype.html#/" +
      (new URL(location.href).searchParams.get("purpose") === "reset" ? "reset-password" : "a07"));
  });
  for (const link of document.querySelectorAll("#resend-link, #resend-again")) {
    link.addEventListener("click", event => {
      event.preventDefault();
      feedback.textContent = "Demo code " + demoCode + ". No message was sent.";
    });
  }
} else if (form) {
  const contact = form.querySelector("[data-contact]");
  const password = form.querySelector("#password");
  const confirm = form.querySelector("#confirm-password");
  for (const input of [contact, password, confirm].filter(Boolean)) input.addEventListener("input", () => input.setCustomValidity(""));
  form.addEventListener("submit", event => {
    event.preventDefault();
    contact?.setCustomValidity(!validContact(contact?.value || "") ? "Enter an email address or a phone number with its country code." : "");
    confirm?.setCustomValidity(confirm.value !== password.value ? "The passwords must match." : "");
    if (!form.reportValidity()) return;
    const destination = page === "forgot.html" ? "verify.html?purpose=reset" : page === "signup.html" ? "verify.html" : "prototype.html#/c01";
    location.assign(destination);
  });
}
