// Authentication required middleware
// Ensures user is authenticated before accessing protected routes
import { authenticateProject } from "./project-auth.mjs";

export function authRequired(req, res, next) {
  // First apply project authentication
  authenticateProject(req, res, (err) => {
    if (err) return res.status(401).json({ error: "Project sign-in required" });
    next();
  });
}
