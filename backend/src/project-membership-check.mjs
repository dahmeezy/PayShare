// Project membership check middleware
// Verifies that the user is a member of the requested project
import { projectError } from "./project-store.mjs";

export function projectMembershipCheck(req, res, next) {
  const projectId = req.params.id || req.body?.projectId || req.query.projectId;
  
  if (!projectId) {
    return res.status(400).json({ error: "Project ID is required" });
  }
  
  // Check if the user is a member of this project
  // This is a simplified check; in production, query the database
  if (req.auth.projectId !== projectId) {
    return res.status(403).json({ error: "Forbidden: You are not a member of this project" });
  }
  
  next();
}
