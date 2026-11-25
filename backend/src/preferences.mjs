// Per-account preferences. Channels without a delivery service (WhatsApp, SMS) are not stored.
import { projectError } from "./project-store.mjs";

export const defaultPreferences = () => ({
  notifications: { email: false, inApp: true },
  appearance: null,
  textSize: "default",
});

export function preferencesFor(user) {
  const defaults = defaultPreferences();
  const saved = user.preferences || {};
  return { ...defaults, ...saved, notifications: { ...defaults.notifications, ...saved.notifications } };
}

export function mergePreferences(user, change) {
  const invalid = () => projectError("Choose a supported preference");
  if (!change || typeof change !== "object" || Array.isArray(change)) throw invalid();
  const next = preferencesFor(user);
  for (const [key, value] of Object.entries(change)) {
    if (key === "notifications" && value && typeof value === "object") {
      for (const [channel, enabled] of Object.entries(value)) {
        if (!["email", "inApp"].includes(channel) || typeof enabled !== "boolean") throw invalid();
        next.notifications[channel] = enabled;
      }
    } else if (key === "appearance" && ["light", "dark", "system"].includes(value)) next.appearance = value;
    else if (key === "textSize" && ["default", "large", "extra-large"].includes(value)) next.textSize = value;
    else throw invalid();
  }
  return next;
}
