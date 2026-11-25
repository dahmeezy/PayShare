import express from "express";
import { StrKey } from "@stellar/stellar-sdk";
import { createMailer } from "./email.mjs";
import { createUser, hashPassword, loginUser, readUsers, verifyPassword, writeUsers } from "./users-store.mjs";
import { authRateLimiter } from "./rate-limit.mjs";
import { endOtherSessions, endSession, publicUser, requireAccount, requireSession, startSession } from "./session.mjs";
import { projectError } from "./project-store.mjs";
import { endpoint } from "./money-api.mjs";
import { invitedRole } from "./invitations.mjs";
import { mergePreferences } from "./preferences.mjs";
import { checkCode, sendCode, verificationStatus } from "./verification.mjs";
import { readWorkspace } from "./workspace-store.mjs";

// Bump when the draft Terms or Privacy Policy change in a way people must accept again.
export const TERMS_VERSION = "draft-2026-11";
const roles = ["contractor", "worker", "client"];

export const validEmail = email => typeof email === "string" && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
function personName(value, label) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 60) throw projectError(`${label} is required (up to 60 characters)`);
  return value.trim();
}
function newPassword(password) {
  if (typeof password !== "string" || password.trim().length < 8 || password.length > 128) {
    throw projectError("Use a password with 8 to 128 characters");
  }
  return password;
}

export function createAuthRouter(mailer = createMailer()) {
  const router = express.Router();
  router.use(express.json({ limit: "16kb" }));
  router.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });

  // The signed-in account, plus the state of its email verification when one is outstanding.
  const account = user => ({
    ...publicUser(user),
    ...(!user.email_verified_at && { verification: verificationStatus(user, mailer) }),
  });
  const current = req => account(readUsers()[req.user.email]);
  const change = (req, edit) => {
    const users = readUsers();
    const user = users[req.user.email];
    edit(user);
    user.updated_at = new Date().toISOString();
    writeUsers(users);
    return account(user);
  };

  router.post("/register", authRateLimiter("register"), endpoint(async (req, res) => {
    const { email, role, stellarAddress, password, invitationToken, acceptTerms } = req.body ?? {};
    const firstName = personName(req.body?.firstName, "First name");
    const lastName = personName(req.body?.lastName, "Last name");
    if (!validEmail(email)) throw projectError("Enter a valid email address");
    newPassword(password);
    if (acceptTerms !== true) throw projectError("Agree to the Terms and Privacy Policy to create an account");
    // An invitation decides the role. Otherwise it may be chosen now or during onboarding.
    const invited = invitationToken !== undefined;
    const accountRole = invited ? await invitedRole(invitationToken, email) : role;
    if (accountRole !== undefined && !roles.includes(accountRole)) throw projectError("Choose a valid role");
    const user = createUser({
      firstName, lastName, email, role: accountRole, stellarAddress, password,
      role_source: invited ? "invitation" : "self",
      terms_accepted_at: new Date().toISOString(), terms_version: TERMS_VERSION,
    });
    startSession(req, res, user.email);
    try { await sendCode(user.email, mailer); }
    catch (error) { if (error.status !== 429) throw error; }
    res.status(201).json(account(readUsers()[user.email]));
  }));

  router.post("/login", authRateLimiter("login"), endpoint((req, res) => {
    const { email, password, remember = true } = req.body ?? {};
    if (!validEmail(email) || typeof password !== "string" || !password || password.length > 128) {
      throw projectError("Email and password are required");
    }
    const user = loginUser(email, password);
    if (!user) throw projectError("Invalid credentials", 401);
    startSession(req, res, user.email, remember !== false);
    res.json(account(readUsers()[user.email]));
  }));

  router.post("/logout", endpoint((req, res) => {
    endSession(req, res);
    res.json({ success: true });
  }));
  router.get("/session", requireAccount, endpoint((req, res) => res.json(current(req))));
  router.get("/users", requireAccount, (req, res) => res.json([req.user]));

  router.post("/verify", authRateLimiter("verify"), requireAccount, endpoint((req, res) => {
    if (!req.user.emailVerified) checkCode(req.user.email, req.body?.code);
    res.json(current(req));
  }));
  router.post("/verify/resend", authRateLimiter("resend"), requireAccount, endpoint(async (req, res) => {
    if (req.user.emailVerified) return res.json(current(req));
    if (!mailer.available) throw projectError("Email delivery is not configured on this server, so no code was sent.", 503);
    if (!await sendCode(req.user.email, mailer)) throw projectError("The email could not be sent. Try again shortly.", 502);
    res.json(current(req));
  }));

  router.put("/profile", requireSession, endpoint((req, res) => {
    const firstName = personName(req.body?.firstName, "First name");
    const lastName = personName(req.body?.lastName, "Last name");
    const { stellarAddress } = req.body;
    if (stellarAddress !== undefined && (typeof stellarAddress !== "string" ||
        (stellarAddress && !StrKey.isValidEd25519PublicKey(stellarAddress)))) {
      throw projectError("Enter a valid public Stellar account");
    }
    res.json(change(req, user => {
      if (stellarAddress !== undefined) {
        if (user.stellar_address !== (stellarAddress || null)) user.trustline_ok = false;
        user.stellar_address = stellarAddress || null;
      }
      Object.assign(user, { first_name: firstName, last_name: lastName, name: `${firstName} ${lastName}` });
    }));
  }));

  router.put("/preferences", requireSession, endpoint((req, res) => {
    res.json(change(req, user => { user.preferences = mergePreferences(user, req.body); }));
  }));

  router.put("/password", authRateLimiter("password"), requireSession, endpoint((req, res) => {
    const { currentPassword, password } = req.body ?? {};
    newPassword(password);
    res.json(change(req, user => {
      if (typeof currentPassword !== "string" || !verifyPassword(currentPassword, user.password_salt, user.password_hash)) {
        throw projectError("Your current password is not correct", 403);
      }
      const { salt, hash } = hashPassword(password);
      Object.assign(user, { password_salt: salt, password_hash: hash });
      endOtherSessions(req, user);
    }));
  }));

  // ── Onboarding ─────────────────────────────────────────────
  router.put("/onboarding/role", requireSession, endpoint(async (req, res) => {
    const role = req.body?.role;
    if (!roles.includes(role)) throw projectError("Choose a valid role");
    if (req.user.invited) throw projectError("Your role was set by your invitation", 409);
    // The role can be changed while setting up, but never once the account has been used.
    if (req.user.role) {
      const used = req.user.onboarded ||
        (await readWorkspace()).projects.some(project => project.members.some(member => member.id === req.user.id));
      if (used) throw projectError("Your role is already set", 409);
    }
    res.json(change(req, user => { user.role = role; }));
  }));
  router.post("/onboarding/complete", requireSession, endpoint((req, res) => {
    if (!req.user.role) throw projectError("Choose your role first", 409);
    res.json(change(req, user => { user.onboarded_at ||= new Date().toISOString(); }));
  }));
  router.post("/onboarding/tour", requireSession, endpoint((req, res) => {
    const status = req.body?.status;
    if (!["completed", "skipped"].includes(status)) throw projectError("Finish or skip the tour");
    res.json(change(req, user => Object.assign(user, { tour_status: status, tour_seen_at: new Date().toISOString() })));
  }));

  router.post("/forgot", authRateLimiter("forgot"), endpoint((req, res) => {
    if (!validEmail(req.body?.email)) throw projectError("Enter a valid email address");
    res.json({ success: true, deliveryAvailable: false, message: "Password recovery is unavailable. No message was sent." });
  }));
  return router;
}
