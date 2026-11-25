export const demoCode = "481026";
const eye = new URL("assets/146768e0def859c5.svg", import.meta.url);

const nameHint = "Enter your full name";
const emailHint = "e.g. name@example.com";
const passwordLengthHint = "At least 8 characters";
const phoneHint = "e.g. +234 801 234 5678";
const placeholders = new Map([
  ["Full name", nameHint],
  ["Your name", nameHint],
  ["Email address", emailHint],
  ["Email or WhatsApp number", emailHint],
  ["Email or WhatsApp", emailHint],
  ["Password", "Enter your password"],
  ["Create a password", passwordLengthHint],
  ["Strong password", passwordLengthHint],
  ["New password", passwordLengthHint],
  ["Confirm password", "Re-enter your password"],
  ["Phone number", phoneHint],
  ["WhatsApp number", phoneHint],
  ["Public Stellar wallet", "Enter your public Stellar address (G...)"],
  ["Profile name", "Enter your display name"],
  ["Business name (optional)", "Enter your business name"],
]);

export function applyAuthPlaceholders(root) {
  for (const input of root.querySelectorAll("input")) {
    const label = input.getAttribute("aria-label") || input.labels?.[0]?.textContent.trim();
    const placeholder = placeholders.get(label);
    if (!placeholder) continue;
    input.placeholder = placeholder;
    input.classList.add("auth-input");
  }
}

export function addPasswordToggle(input, icon) {
  const button = document.createElement("button");
  const image = document.createElement("img");
  button.type = "button";
  button.className = "password-toggle";
  button.setAttribute("aria-label", "Show password");
  button.setAttribute("aria-pressed", "false");
  image.src = eye;
  image.alt = "";
  button.append(image);
  if (icon) icon.replaceWith(button);
  else input.after(button);
  button.addEventListener("click", () => {
    const reveal = input.type === "password";
    input.type = reveal ? "text" : "password";
    button.setAttribute("aria-pressed", String(reveal));
    button.setAttribute("aria-label", reveal ? "Hide password" : "Show password");
  });
}

export function validContact(value) {
  const contact = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) ||
    /^\+?\d{7,15}$/.test(contact.replace(/[ ()-]/g, ""));
}

// Digit-by-digit entry with paste, autofill, arrows and backspace. Returns a reader.
export function wireCodeInputs(inputs, feedback) {
  const clearError = () => {
    for (const input of inputs) input.removeAttribute("aria-invalid");
    feedback.textContent = "";
  };
  const focus = (index) => {
    inputs[index]?.focus();
    inputs[index]?.select();
  };
  const spread = (digits, index) => {
    const start = digits.length >= inputs.length ? 0 : index;
    [...digits.slice(0, inputs.length)].forEach((digit, offset) => {
      if (inputs[start + offset]) inputs[start + offset].value = digit;
    });
    clearError();
    focus(Math.min(start + digits.length, inputs.length - 1));
  };
  inputs.forEach((input, index) => {
    input.inputMode = "numeric";
    // The first box takes a whole code from the browser or keyboard autofill.
    input.maxLength = index ? 1 : inputs.length;
    input.pattern = "[0-9]";
    input.autocomplete ||= "off";
    input.addEventListener("focus", () => input.select());
    input.addEventListener("input", () => {
      const digits = input.value.replace(/\D/g, "");
      if (digits.length > 2) return spread(digits, index);
      input.value = digits.slice(-1);
      clearError();
      if (input.value && index < inputs.length - 1) focus(index + 1);
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Backspace" && !input.value && index > 0) {
        event.preventDefault();
        focus(index - 1);
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        focus(index + (event.key === "ArrowLeft" ? -1 : 1));
      }
    });
    input.addEventListener("paste", (event) => {
      event.preventDefault();
      const digits = event.clipboardData.getData("text").replace(/\D/g, "");
      if (digits) spread(digits, index);
    });
  });
  return () => inputs.map(input => input.value).join("");
}

// The sample-data prototype checks against its fixed demo code.
export function wireCode(inputs, feedback) {
  const read = wireCodeInputs(inputs, feedback);
  const focus = (index) => {
    inputs[index]?.focus();
    inputs[index]?.select();
  };
  return () => {
    const code = read();
    if (code === demoCode) return true;
    feedback.textContent = code.length < inputs.length
      ? "Enter all six digits." : "That code doesn’t match. Try demo code " + demoCode + ".";
    const firstEmpty = inputs.findIndex(input => !input.value);
    inputs.forEach(input => {
      if (!input.value || firstEmpty < 0) input.setAttribute("aria-invalid", "true");
    });
    focus(firstEmpty < 0 ? 0 : firstEmpty);
    return false;
  };
}
