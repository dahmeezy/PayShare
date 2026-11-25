// User storage using JSON file persistence (same pattern as project-state).
// Passwords are never stored directly; only the hash is kept. Password is set
// during registration and verified during login. Password is never logged.

import { randomBytes, randomUUID, pbkdf2Sync, timingSafeEqual } from "node:crypto";
import { readFileSync, writeFileSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { StrKey } from "@stellar/stellar-sdk";

const USERS_FILE = path.resolve(process.env.PAYSHARE_USERS_FILE || "users.json");
const PASSWORD_ITERATIONS = 600_000;

// Hash password using PBKDF2 (built-in Node.js, no extra deps)
// Returns: { salt, hash } as hex strings
export const hashPassword = (password) => {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, 32, "sha256");
  return {
    salt,
    hash: hash.toString("hex"),
  };
};

export const verifyPassword = (password, salt, storedHash) => {
  if (typeof salt !== "string" || typeof storedHash !== "string" || !/^(?:[a-f0-9]{64}|[a-f0-9]{128})$/.test(storedHash)) return false;
  const expected = Buffer.from(storedHash, "hex");
  const iterations = expected.length === 64 ? 10 : PASSWORD_ITERATIONS;
  const hash = pbkdf2Sync(password, salt, iterations, expected.length, "sha256");
  return expected.length === hash.length && timingSafeEqual(hash, expected);
};

const validateUser = (user) => {
  const errors = [];
  if (!user || typeof user.id !== "string") errors.push("Valid id required");
  if (!user || typeof user.name !== "string" || user.name.trim().length === 0)
    errors.push("Valid name required");
  if (!user || typeof user.email !== "string") errors.push("Valid email required");
  // The role stays empty until the person chooses it during onboarding.
  if (!user || (user.role !== null && !["contractor", "worker", "client"].includes(user.role)))
    errors.push('Role must be one of: contractor, worker, client');
  if (user.stellar_address && !StrKey.isValidEd25519PublicKey(user.stellar_address))
    errors.push("Stellar address must be a valid public key (G...)");
  return errors;
};

export function readUsers() {
  try {
    const saved = JSON.parse(readFileSync(USERS_FILE, "utf8"));
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) throw new Error("Invalid user store");
    return Object.assign(Object.create(null), saved);
  } catch (error) {
    if (error.code === "ENOENT") return Object.create(null);
    throw Object.assign(new Error("User records are unavailable"), { status: 503 });
  }
}

export function writeUsers(users) {
  const temporary = USERS_FILE + "." + randomUUID() + ".tmp";
  try {
    writeFileSync(temporary, JSON.stringify(users, null, 2), { mode: 0o600, flag: "wx" });
    renameSync(temporary, USERS_FILE);
  } finally {
    rmSync(temporary, { force: true });
  }
}

export function createUser({ firstName, lastName, email, role = null, stellarAddress, password, ...account }) {
  const users = readUsers();

  // Check uniqueness
  const lowerEmail = email.toLowerCase().trim();
  // A sign-up that never proved ownership of the address can be started again.
  const pending = users[lowerEmail]?.email_verified_at === null;
  if (users[lowerEmail] && !pending) throw new Error("Email already registered");

  const passwordHash = hashPassword(password || "");

  const user = {
    id: `user_${randomUUID()}`,
    first_name: firstName.trim(),
    last_name: lastName.trim(),
    name: `${firstName.trim()} ${lastName.trim()}`,
    email: lowerEmail,
    role,
    stellar_address: stellarAddress || null,
    trustline_ok: false,
    password_hash: passwordHash.hash,
    password_salt: passwordHash.salt,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    // null means "not done yet". Accounts created before these fields existed lack them
    // entirely and keep working without being asked to verify or onboard again.
    email_verified_at: null,
    onboarded_at: null,
    tour_seen_at: null,
    ...account,
    // Keeps the resend cooldown when a pending sign-up is restarted.
    ...(pending && users[lowerEmail].verification && { verification: users[lowerEmail].verification }),
  };

  const validation = validateUser(user);
  if (validation.length > 0) throw new Error(validation.join(". "));

  users[lowerEmail] = user;
  writeUsers(users);
  return user;
}

export function getUserByEmail(email) {
  const users = readUsers();
  const lowerEmail = email.toLowerCase().trim();
  return users[lowerEmail] || null;
}

export function getUserById(id) {
  const users = readUsers();
  const lowerId = id.toLowerCase();
  return Object.values(users).find(
    (u) => u.id.toLowerCase() === lowerId || u.email.toLowerCase() === lowerId
  ) || null;
}

export function updateUserTrustline(id, ok) {
  const users = readUsers();
  const lowerId = id.toLowerCase();
  const user = Object.values(users).find(
    (u) => u.id.toLowerCase() === lowerId
  );
  if (!user) return null;
  user.trustline_ok = ok;
  user.updated_at = new Date().toISOString();
  writeUsers(users);
  return user;
}

export function existsByEmail(email) {
  const users = readUsers();
  const lowerEmail = email.toLowerCase().trim();
  return lowerEmail in readUsers();
}

export function countUsers() {
  return Object.keys(readUsers()).length;
}

export function listUsers(role) {
  const users = readUsers();
  return Object.values(users).filter((u) => role ? u.role === role : true);
}

// Login: verify email/password and return user without password
export function loginUser(email, password) {
  const users = readUsers();
  const key = email.toLowerCase().trim();
  const user = users[key];
  if (!user || !verifyPassword(password, user.password_salt, user.password_hash)) return null;
  if (user.password_hash.length === 128) {
    const { hash, salt } = hashPassword(password);
    user.password_hash = hash;
    user.password_salt = salt;
    writeUsers(users);
  }
  const { password_hash, password_salt, sessions, ...safeUser } = user;
  return safeUser;
}

// Check if user has a password set (for social/whatsApp auth paths)
export function hasPassword(user) {
  return !!(user && user.password_hash);
}
