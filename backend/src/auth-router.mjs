import express from "express";
import { StrKey } from "@stellar/stellar-sdk";
import { createUser, loginUser, readUsers, writeUsers } from "./users-store.mjs";
import { authRateLimiter } from "./rate-limit.mjs";
import { endSession, publicUser, requireSession, startSession } from "./session.mjs";
import { projectError } from "./project-store.mjs";
import { endpoint } from "./money-api.mjs";
import { invitedRole } from "./invitations.mjs";

export const validEmail = email => typeof email === "string" && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
const validName = name => typeof name === "string" && name.trim().length > 0 && name.length <= 120;

export function createAuthRouter() {
  const router = express.Router();
  router.use(express.json({ limit: "16kb" }));
  router.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });

  router.post("/register", authRateLimiter("register"), endpoint(async (req, res) => {
    const { name, email, role, stellarAddress, password, invitationToken } = req.body ?? {};
    if (!validName(name)) throw projectError("Name is required");
    if (!validEmail(email)) throw projectError("Enter a valid email address");

    if (typeof password !== "string" || password.trim().length < 8 || password.length > 128) {
      throw projectError("Use a password with 8 to 128 characters");
    }
    const accountRole = invitationToken === undefined ? role : await invitedRole(invitationToken, email);
    if (!["contractor", "worker", "client"].includes(accountRole)) throw projectError("Choose a valid role");
    const user = createUser({ name, email, role: accountRole, stellarAddress, password });
    startSession(req, res, user.email);
    res.status(201).json(publicUser(user));
  }));

  router.post("/login", authRateLimiter("login"), endpoint((req, res) => {
    const { email, password } = req.body ?? {};
    if (!validEmail(email) || typeof password !== "string" || !password || password.length > 128) {
      throw projectError("Email and password are required");
    }
    const user = loginUser(email, password);
    if (!user) throw projectError("Invalid credentials", 401);
    startSession(req, res, user.email);
    res.json(publicUser(user));
  }));

  router.post("/logout", endpoint((req, res) => {
    endSession(req, res);
    res.json({ success: true });
  }));
  router.get("/session", requireSession, (req, res) => res.json(req.user));
  router.get("/users", requireSession, (req, res) => res.json([req.user]));

  router.put("/profile", requireSession, endpoint((req, res) => {
    const { name, stellarAddress } = req.body ?? {};
    if (!validName(name)) throw projectError("Name is required");
    if (typeof stellarAddress !== "string" || (stellarAddress && !StrKey.isValidEd25519PublicKey(stellarAddress))) {
      throw projectError("Enter a valid public Stellar account");
    }
    const users = readUsers();
    const user = users[req.user.email];
    if (user.stellar_address !== stellarAddress) user.trustline_ok = false;
    Object.assign(user, { name: name.trim(), stellar_address: stellarAddress || null, updated_at: new Date().toISOString() });
    writeUsers(users);
    res.json(publicUser(user));
  }));

  router.post("/forgot", authRateLimiter("forgot"), endpoint((req, res) => {
    if (!validEmail(req.body?.email)) throw projectError("Enter a valid email address");
    res.json({ success: true, deliveryAvailable: false, message: "Password recovery is unavailable. No message was sent." });
  }));
  router.post("/verify", authRateLimiter("verify"), endpoint((req, res) => {
    if (typeof req.body?.code !== "string" || !/^\d{6}$/.test(req.body.code)) throw projectError("Valid 6-digit code is required");
    // Preserve the input validation response for the prototype. No verified identity or session is issued.
    res.json({ success: true, verified: false, deliveryAvailable: false, message: "Account verification is unavailable." });
  }));
  return router;
}
