import { createHash } from "node:crypto";
import { projectError } from "./project-store.mjs";
import { readWorkspace } from "./workspace-store.mjs";

export const tokenHash = token => createHash("sha256").update(token).digest("hex");

export function findInvitation(state, token) {
  if (typeof token !== "string" || !/^[\w-]{43}$/.test(token)) throw projectError("Invalid invitation", 404);
  const hash = tokenHash(token);
  for (const project of state.projects) {
    const invitation = project.invitations.find(entry => entry.hash === hash);
    if (invitation?.status === "pending" && invitation.expiresAt > Date.now()) return { project, invitation };
  }
  throw projectError("Invitation has expired or has already been used", 404);
}

export async function invitedRole(token, email) {
  const { invitation } = findInvitation(await readWorkspace(), token);
  if (invitation.email !== email.trim().toLowerCase()) {
    throw projectError("Use the email address on the invitation", 403);
  }
  return invitation.role;
}
