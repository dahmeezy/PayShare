// A guide for the person typing. The server's rule is only the 8 to 128 character length.
const common = /^(?:password|passw0rd|qwerty|letmein|welcome|admin|iloveyou|payshare)|12345678|^(.)\1+$/i;

export function passwordStrength(password) {
  if (!password) return { score: 0, label: "", tip: "Use at least 8 characters." };
  if (password.trim().length < 8) return { score: 1, label: "Too short", tip: "Use at least 8 characters." };
  if (common.test(password)) return { score: 1, label: "Weak password", tip: "Avoid common words and number runs." };
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter(kind => kind.test(password)).length;
  const points = kinds + (password.length >= 12) + (password.length >= 16);
  if (points <= 1) return { score: 1, label: "Weak password", tip: "Mix letters with numbers or symbols." };
  if (points === 2) return { score: 2, label: "Fair password", tip: "Make it longer, or add a number or symbol." };
  if (points === 3) return { score: 3, label: "Strong password", tip: "" };
  return { score: 4, label: "Very strong password", tip: "" };
}
