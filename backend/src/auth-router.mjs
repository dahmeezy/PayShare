import express from "express";
import { createUser, getUserByEmail, loginUser, hasPassword, countUsers, listUsers } from "./users-store.mjs";

const endpoint = (fn) => (req, res, next) => Promise.resolve().then(() => fn(req, res)).catch(next);

const authRouter = express.Router();

authRouter.use(express.json({ limit: "16kb" }));

// POST /auth/register - Register a new user
authRouter.post("/register", endpoint(async (req, res) => {
  const { name, email, role, stellarAddress, password } = req.body ?? {};

  if (!name || name.trim().length === 0) {
    throw new Error("Name is required");
  }
  if (!email || !email.includes("@")) {
    throw new Error("Valid email is required");
  }
  if (!role || !["contractor", "worker", "client"].includes(role)) {
    throw new Error("Valid role is required (contractor, worker, client)");
  }
  if (!password || password.trim().length < 6) {
    throw new Error("Password must be at least 6 characters");
  }

  const user = createUser({ name, email, role, stellarAddress, password });

  res.status(201).json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    stellar_address: user.stellar_address,
    trustline_ok: user.trustline_ok,
    created_at: user.created_at,
  });
}));

// POST /auth/login - Login user
authRouter.post("/login", endpoint(async (req, res) => {
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    throw new Error("Email and password are required");
  }

  const user = loginUser(email, password);

  if (!user) {
    throw new Error("Invalid credentials");
  }

  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    stellar_address: user.stellar_address,
    trustline_ok: user.trustline_ok,
  });
}));

// POST /auth/logout - Logout user (client-side session clear)
authRouter.post("/logout", endpoint(async (req, res) => {
  res.json({ success: true });
}));

// GET /auth/session - Get current session user
authRouter.get("/session", endpoint(async (req, res) => {
  res.json({ error: "No active session" });
}));

// GET /auth/users - List users (admin/debug)
authRouter.get("/users", endpoint(async (req, res) => {
  const role = req.query.role ? req.query.role : null;
  const users = listUsers(role);
  const safeUsers = users.map(({ password_hash, password_salt, ...rest }) => rest);
  res.json(safeUsers);
}));

export { authRouter };
