// Contractor payout PIN: authorizes every payout. Stored as a salted hash, never logged or returned.
import { randomBytes, timingSafeEqual, pbkdf2Sync } from "node:crypto";
import { projectError } from "./project-store.mjs";
import { getUserById, readUsers, writeUsers } from "./users-store.mjs";

const ITERATIONS = 120_000;
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;
const failures = new Map();

const digest = (pin, salt) => pbkdf2Sync(pin, salt, ITERATIONS, 32, "sha256");
export const validPin = pin => typeof pin === "string" && /^\d{6}$/.test(pin);
export const hasPin = userId => Boolean(getUserById(userId)?.pin_hash);

export function setPin(userId, pin, currentPin) {
  if (!validPin(pin)) throw projectError("The payout PIN must be exactly 6 digits");
  if (hasPin(userId)) checkPin(userId, currentPin, "Enter your current PIN to change it");
  const users = readUsers();
  const user = Object.values(users).find(entry => entry.id === userId);
  if (!user) throw projectError("User not found", 404);
  const salt = randomBytes(16);
  user.pin_salt = salt.toString("hex");
  user.pin_hash = digest(pin, salt).toString("hex");
  user.updated_at = new Date().toISOString();
  writeUsers(users);
  failures.delete(userId);
}

export function checkPin(userId, pin, missingMessage = "Enter your 6-digit payout PIN to authorize this payment") {
  const user = getUserById(userId);
  if (!user?.pin_hash) throw projectError("Create a payout PIN before authorizing payments", 409);
  const state = failures.get(userId) || { count: 0, until: 0 };
  if (state.until > Date.now()) throw projectError("Too many wrong PIN attempts. Try again in a few minutes.", 429);
  if (!validPin(pin)) throw projectError(missingMessage, 400);
  const expected = Buffer.from(user.pin_hash, "hex");
  const actual = digest(pin, Buffer.from(user.pin_salt, "hex"));
  if (expected.length === actual.length && timingSafeEqual(expected, actual)) {
    failures.delete(userId);
    return;
  }
  state.count += 1;
  if (state.count >= MAX_FAILURES) { state.count = 0; state.until = Date.now() + LOCK_MS; }
  failures.set(userId, state);
  throw projectError("Incorrect PIN", 403);
}
