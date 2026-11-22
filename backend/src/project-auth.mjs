import { timingSafeEqual } from "node:crypto";
import { PROJECT } from "./project.mjs";
import { projectError } from "./project-store.mjs";

export function validToken(provided, expected) {
  if (!expected || expected.length < 32 || !provided) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function authenticateProject(req, res, next) {
  // Team A can provide req.auth after its session and project membership checks.
  if (req.auth?.projectId === "proj_demo") return next();
  const provided = req.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  const identities = [
    ["contractor", undefined, process.env.PAYSHARE_CONTRACTOR_TOKEN],
    ["client", undefined, process.env.PAYSHARE_CLIENT_TOKEN],
    ...PROJECT.workers.map(({ id }) => ["worker", id, process.env[`PAYSHARE_WORKER_${id.toUpperCase()}_TOKEN`]]),
  ];
  const identity = identities.filter(([, , token]) => validToken(provided, token));
  if (identity.length !== 1) return res.status(401).json({ error: "Project sign-in required" });
  const [role, workerId] = identity[0];
  req.auth = { role, workerId, projectId: "proj_demo" };
  next();
}

export function requireRole(req, ...roles) {
  if (!roles.includes(req.auth.role)) throw projectError("Forbidden", 403);
}
