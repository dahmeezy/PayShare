// User storage using JSON file persistence (same pattern as project-state).
// Passwords are never stored directly; only the hash is kept. Password is set
// during registration and verified during login. Password is never logged.

import { randomUUID, pbkdf2Sync, timingSafeEqual } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const USERS_FILE = path.resolve(process.env.PAYSHARE_USERS_FILE || "users.json");
const SALT_ROUNDS = 10;

const emptyUsers = () => ({});

// Hash password using PBKDF2 (built-in Node.js, no extra deps)
// Returns: { salt, hash } as hex strings
export const hashPassword = (password) => {
  const salt = randomUUID().substring(0, 16);
  const hash = pbkdf2Sync(password, salt, SALT_ROUNDS, 64, "sha256");
  return {
    salt,
    hash: hash.toString("hex"),
  };
};

export const verifyPassword = (password, salt, storedHash) => {
  const hash = pbkdf2Sync(password, salt, SALT_ROUNDS, 64, "sha256");
  const expected = Buffer.from(storedHash, "hex");
  return expected.length === hash.length && timingSafeEqual(hash, expected);
};

const validateUser = (user) => {
  const errors = [];
  if (!user || typeof user.id !== "string") errors.push("Valid id required");
  if (!user || typeof user.name !== "string" || user.name.trim().length === 0)
    errors.push("Valid name required");
  if (!user || typeof user.email !== "string") errors.push("Valid email required");
  if (!user || !["contractor", "worker", "client"].includes(user.role))
    errors.push('Role must be one of: contractor, worker, client');
  if (user.stellar_address && !/^G[A-Z0-9]{56}$/.test(user.stellar_address))
    errors.push("Stellar address must be a valid public key (G...)");
  return errors;
};

export function readUsers() {
  let saved;
  try {
    saved = JSON.parse(readFileSync(USERS_FILE, "utf8"));
  } catch {
    saved = emptyUsers();
  }
  return { ...emptyUsers(), ...saved };
}

export function writeUsers(users) {
  writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), { mode: 0o600 });
}

export function createUser({ name, email, role, stellarAddress, password }) {
  const users = readUsers();

  // Check uniqueness
  const lowerEmail = email.toLowerCase().trim();
  if (users[lowerEmail]) throw new Error("Email already registered");

  const passwordHash = hashPassword(password || "");

  const user = {
    id: `user_${randomUUID()}`,
    name: name.trim(),
    email: lowerEmail,
    role,
    stellar_address: stellarAddress || null,
    trustline_ok: false,
    password_hash: passwordHash.hash,
    password_salt: passwordHash.salt,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
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
  const user = getUserByEmail(email);
  if (!user) return null;
  if (!verifyPassword(password, user.password_salt, user.password_hash)) return null;
  // Return user object without sensitive password data
  const { password_hash, password_salt, ...safeUser } = user;
  return safeUser;
}

// Check if user has a password set (for social/whatsApp auth paths)
export function hasPassword(user) {
  return !!(user && user.password_hash);
}
