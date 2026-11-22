// Demo-only confirmation helper. Never use caller-supplied role headers as real authentication.
import fs from "node:fs/promises";

export function canConfirm(role, confirmed) {
  if (role !== "client") throw new Error("Only the client can confirm work");
  if (confirmed !== true) throw new Error("confirmed must be true");
}

export async function confirmDemoWork(file, role, confirmed) {
  canConfirm(role, confirmed);
  let state;
  try {
    state = JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    state = { payouts: {} };
  }
  if (state.clientConfirmed === true) return { clientConfirmed: true, already_confirmed: true };
  if (Object.values(state.payouts ?? {}).some((p) => p.status === "processing" || p.status === "paid")) {
    throw new Error("Cannot change confirmation after payment has started");
  }
  state.clientConfirmed = true;
  await fs.writeFile(file, JSON.stringify(state, null, 2));
  return { clientConfirmed: true, already_confirmed: false };
}
