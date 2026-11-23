import express from "express";
import { createUser, getUserByEmail, loginUser, hashPassword, verifyPassword, hasPassword, countUsers, listUsers } from "./users-store.mjs";
import { authRateLimiter } from "./rate-limit.mjs";

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

// POST /auth/login - Login user with rate limiting
authRouter.post("/login", authRateLimiter('login'), endpoint(async (req, res) => {
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
  res.status(401).json({ error: "No active session" });
}));

// POST /auth/forgot - Request password reset (email or WhatsApp code) with rate limiting
authRouter.post("/forgot", authRateLimiter('forgot'), endpoint(async (req, res) => {
  const { email } = req.body ?? {};

  if (!email || !email.includes("@")) {
    throw new Error("Valid email is required");
  }

  const user = getUserByEmail(email);
  if (!user) {
    // Don't reveal if email exists; use generic success message
    res.json({ success: true, message: "If an account with that email exists, a reset link has been sent." });
    return;
  }

  // In a full implementation, send a 6-digit code via email or WhatsApp
  // For now, simulate with a stored code and timer
  const resetCode = String(Math.floor(100000 + Math.random() * 899999)).split('').map(String);
  const codeExpiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes

  res.json({ 
    success: true, 
    code: resetCode,  // In prod: don't return the code, just trigger delivery
    method: user.stellar_address ? "whatsapp" : "email",
    expiresAt: codeExpiresAt 
  });
}));

// POST /auth/verify - Verify 6-digit code with rate limiting
authRouter.post("/verify", authRateLimiter('verify'), endpoint(async (req, res) => {
  const { code } = req.body ?? {};

  if (!code || code.length !== 6) {
    throw new Error("Valid 6-digit code is required");
  }

  // In production, verify against the stored code and check expiration
  // For now, accept any 6-digit code for demo purposes
  res.json({ 
    success: true, 
    userId: "user_demo", 
    sessionToken: "session_demo_" + Date.now()
  });
}));

// GET /auth/users - List users (admin/debug)
authRouter.get("/users", endpoint(async (req, res) => {
  const role = req.query.role ? req.query.role : null;
  const users = listUsers(role);
  const safeUsers = users.map(({ password_hash, password_salt, ...rest }) => rest);
  res.json(safeUsers);
}));

export { authRouter };
