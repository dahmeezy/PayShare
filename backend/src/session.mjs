import { createHash, randomBytes } from "node:crypto";
import { preferencesFor } from "./preferences.mjs";
import { readUsers, writeUsers } from "./users-store.mjs";

const cookieName = "payshare_session";
const lifetime = 7 * 24 * 60 * 60 * 1000;
const shortLifetime = 24 * 60 * 60 * 1000;
const digest = token => createHash("sha256").update(token).digest("hex");
const cookieOptions = { httpOnly: true, sameSite: "strict", secure: process.env.PAYSHARE_SECURE_COOKIES === "true", path: "/" };

export function publicUser(user) {
  const { id, name, email, role, stellar_address, trustline_ok, created_at } = user;
  const [first, ...rest] = name.split(/\s+/);
  return {
    id, name, email, role, stellar_address, trustline_ok, created_at,
    firstName: user.first_name ?? first,
    lastName: user.last_name ?? rest.join(" "),
    emailVerified: Boolean(user.email_verified_at),
    verificationRequired: user.email_verified_at === null,
    onboarded: user.onboarded_at !== null,
    tourPending: user.tour_seen_at === null,
    invited: user.role_source === "invitation",
    preferences: preferencesFor(user),
  };
}

function sessionHash(req) {
  const token = (req.get("cookie") || "").match(/(?:^|;\s*)payshare_session=([\w-]{43})(?:;|$)/)?.[1];
  return token ? digest(token) : null;
}

export function sessionUser(req) {
  const hash = sessionHash(req);
  if (!hash) return null;
  return Object.values(readUsers()).find(user => user.sessions?.[hash] > Date.now()) || null;
}

// Any signed-in account, including one that still has to verify its email.
export function requireAccount(req, res, next) {
  try {
    const user = sessionUser(req);
    if (!user) return res.status(401).json({ error: "No active session" });
    req.user = publicUser(user);
    next();
  } catch (error) {
    next(error);
  }
}

// A signed-in account that may use PayShare.
export function requireSession(req, res, next) {
  requireAccount(req, res, error => {
    if (error) return next(error);
    if (req.user.verificationRequired) return res.status(403).json({ error: "Verify your email address to continue" });
    next();
  });
}

// "Keep me logged in" off gives a cookie that ends with the browser session.
export function startSession(req, res, email, remember = true) {
  const users = readUsers();
  const token = randomBytes(32).toString("base64url");
  const oldHash = sessionHash(req);
  for (const user of Object.values(users)) {
    for (const [hash, expires] of Object.entries(user.sessions || {})) {
      if (expires <= Date.now() || hash === oldHash) delete user.sessions[hash];
    }
  }
  const user = users[email];
  user.sessions ||= {};
  user.sessions[digest(token)] = Date.now() + (remember ? lifetime : shortLifetime);
  writeUsers(users);
  res.cookie(cookieName, token, { ...cookieOptions, ...(remember && { maxAge: lifetime }) });
}

// Signs the account out everywhere except the browser making this request.
export function endOtherSessions(req, user) {
  const hash = sessionHash(req);
  user.sessions = hash && user.sessions?.[hash] ? { [hash]: user.sessions[hash] } : {};
}

export function endSession(req, res) {
  const hash = sessionHash(req);
  if (hash) {
    const users = readUsers();
    const user = Object.values(users).find(entry => entry.sessions?.[hash]);
    if (user) {
      delete user.sessions[hash];
      writeUsers(users);
    }
  }
  res.clearCookie(cookieName, cookieOptions);
}
