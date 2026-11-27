// Six-digit email verification codes. Only a salted hash of the current code is stored.
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { projectError } from "./project-store.mjs";
import { readUsers, writeUsers } from "./users-store.mjs";

export const CODE_LIFETIME = 10 * 60_000;
export const RESEND_COOLDOWN = 60_000;
export const MAX_ATTEMPTS = 5;
export const MAX_SENDS_PER_HOUR = 5;

const digest = (salt, code) => createHash("sha256").update(`${salt}:${code}`).digest();

// What the browser may know about the current code. Never includes the code or its hash.
export function verificationStatus(user, mailer) {
  const record = user.verification;
  return {
    deliveryAvailable: mailer.available,
    sent: Boolean(record?.hash),
    expiresAt: record?.hash ? record.expiresAt : null,
    resendAt: record?.sentAt ? record.sentAt + RESEND_COOLDOWN : null,
  };
}

function update(email, change) {
  const users = readUsers();
  const user = users[email];
  if (!user) throw projectError("Account not found", 404);
  const result = change(user);
  writeUsers(users);
  return result;
}

// Creates a new code and emails it. Resolves to false when delivery is unavailable or fails,
// in which case no code is left behind.
export async function sendCode(email, mailer, now = Date.now()) {
  if (!mailer.available) return false;
  const code = String(randomInt(1_000_000)).padStart(6, "0");
  const salt = randomBytes(16).toString("hex");
  const previous = update(email, user => {
    const record = user.verification || {};
    const sends = (record.sends || []).filter(at => at > now - 3_600_000);
    if (record.sentAt && now < record.sentAt + RESEND_COOLDOWN) {
      throw projectError("Please wait a moment before requesting another code.", 429);
    }
    if (sends.length >= MAX_SENDS_PER_HOUR) throw projectError("Too many codes requested. Try again in an hour.", 429);
    user.verification = {
      salt, hash: digest(salt, code).toString("hex"), expiresAt: now + CODE_LIFETIME,
      attempts: 0, sentAt: now, sends: [...sends, now],
    };
    return record;
  });
  try {
    await mailer.send({
      to: email,
      subject: "Your PayShare verification code",
      text: `Your PayShare verification code is ${code}.\n\nIt expires in 10 minutes. If you did not create a PayShare account, you can ignore this email.`,
    });
    return true;
  } catch (error) {
    console.warn(`Verification email failed: ${error.message}`);
    update(email, user => {
      // A failed send leaves no code, doesn’t count towards the hourly limit and can be retried at once.
      if (user.verification?.salt === salt) user.verification = { sends: previous.sends || [] };
    });
    return false;
  }
}

export function checkCode(email, code, now = Date.now()) {
  if (typeof code !== "string" || !/^\d{6}$/.test(code)) throw projectError("Enter the 6-digit code");
  const failure = update(email, user => {
    const record = user.verification;
    if (!record?.hash) return projectError("Request a new code first.", 410);
    if (now > record.expiresAt) return projectError("This code has expired. Request a new one.", 410);
    if (record.attempts >= MAX_ATTEMPTS) return projectError("Too many wrong attempts. Request a new code.", 429);
    if (!timingSafeEqual(digest(record.salt, code), Buffer.from(record.hash, "hex"))) {
      record.attempts += 1;
      const left = MAX_ATTEMPTS - record.attempts;
      return left ? projectError(`That code doesn’t match. ${left} ${left === 1 ? "attempt" : "attempts"} left.`)
        : projectError("Too many wrong attempts. Request a new code.", 429);
    }
    user.email_verified_at = new Date(now).toISOString();
    user.updated_at = user.email_verified_at;
    delete user.verification;
    return null;
  });
  if (failure) throw failure;
}
