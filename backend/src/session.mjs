import { createHash, randomBytes } from "node:crypto";
import { readUsers, writeUsers } from "./users-store.mjs";

const cookieName = "payshare_session";
const lifetime = 7 * 24 * 60 * 60 * 1000;
const digest = token => createHash("sha256").update(token).digest("hex");
const cookieOptions = { httpOnly: true, sameSite: "strict", secure: process.env.PAYSHARE_SECURE_COOKIES === "true", path: "/" };

export function publicUser(user) {
  const { id, name, email, role, stellar_address, trustline_ok, created_at } = user;
  return { id, name, email, role, stellar_address, trustline_ok, created_at, emailVerified: false };
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

export function requireSession(req, res, next) {
  try {
    const user = sessionUser(req);
    if (!user) return res.status(401).json({ error: "No active session" });
    req.user = publicUser(user);
    next();
  } catch (error) {
    next(error);
  }
}

export function startSession(req, res, email) {
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
  user.sessions[digest(token)] = Date.now() + lifetime;
  writeUsers(users);
  res.cookie(cookieName, token, { ...cookieOptions, maxAge: lifetime });
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
