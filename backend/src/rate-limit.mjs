// In-memory rate limits for the demo auth endpoints.
const LIMITS = {
  register: { max: 10, window: 15 * 60 * 1000 },
  login: { max: 5, window: 15 * 60 * 1000 },
  forgot: { max: 3, window: 15 * 60 * 1000 },
  verify: { max: 5, window: 15 * 60 * 1000 },
};

// Tests and seed scripts may raise limits; production leaves this unset.
const scale = Math.max(1, Math.floor(Number(process.env.PAYSHARE_RATE_LIMIT_MULTIPLIER)) || 1);

export function authRateLimiter(limitType) {
  const base = LIMITS[limitType];
  if (!base) throw new Error(`Unknown rate limit type: ${limitType}`);
  const limit = { ...base, max: base.max * scale };
  const attempts = new Map();

  return (req, res, next) => {
    const key = req.ip || "unknown";
    const now = Date.now();
    let entry = attempts.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + limit.window };
      attempts.set(key, entry);
    }

    if (entry.count >= limit.max) {
      return res.status(429).json({
        error: "Too many attempts. Please try again later.",
        resetAt: new Date(entry.resetAt).toLocaleTimeString(),
      });
    }

    entry.count++;
    res.setHeader("X-RateLimit-Remaining", limit.max - entry.count);
    res.setHeader("X-RateLimit-Reset", new Date(entry.resetAt).toISOString());
    next();
  };
}
