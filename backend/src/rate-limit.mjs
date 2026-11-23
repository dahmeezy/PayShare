// Simple in-memory rate limiter for auth endpoints
// In production, use Redis or a dedicated rate limiting service

const LIMITS = {
  login: { max: 5, window: 15 * 60 * 1000 }, // 5 login attempts per 15 minutes
  forgot: { max: 3, window: 15 * 60 * 1000 }, // 3 forgot requests per 15 minutes
  verify: { max: 5, window: 15 * 60 * 1000 }, // 5 verify attempts per 15 minutes
};

const requestCounts = new Map();

function checkRateLimit(key, limits) {
  const now = Date.now();
  const countInfo = requestCounts.get(key) || { count: 0, firstTry: now };
  
  // Reset if outside the window
  if (now - countInfo.firstTry > limits.window) {
    requestCounts.delete(key);
    requestCounts.set(key, { count: 1, firstTry: now });
    return { allowed: true, remaining: limits.max - 1 };
  }
  
  countInfo.count++;
  
  if (countInfo.count > limits.max) {
    return { 
      allowed: false, 
      remaining: 0,
      resetAt: countInfo.firstTry + limits.window 
    };
  }
  
  return { 
    allowed: true, 
    remaining: limits.max - countInfo.count,
    resetAt: countInfo.firstTry + limits.window 
  };
}

export function authRateLimiter(limitType) {
  const limit = LIMITS[limitType];
  if (!limit) throw new Error(`Unknown rate limit type: ${limitType}`);
  
  return (req, res, next) => {
    // Create a key based on IP + endpoint type
    const key = `${req.ip || 'unknown'}:${limitType}`;
    const result = checkRateLimit(key, limit);
    
    if (!result.allowed) {
      return res.status(429).json({ 
        error: "Too many attempts. Please try again later.",
        resetAt: new Date(result.resetAt).toLocaleTimeString()
      });
    }
    
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', new Date(result.resetAt).toISOString());
    next();
  };
}
