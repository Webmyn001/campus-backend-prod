// Small in-memory rate limiter. On serverless platforms this limits per
// instance; pair it with a shared store if you need global limits later.
const buckets = new Map();

const CLEANUP_INTERVAL = 60 * 1000;
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, CLEANUP_INTERVAL);
if (typeof cleanupTimer.unref === "function") cleanupTimer.unref();

function clientKey(req) {
  return req.ip || req.socket?.remoteAddress || "unknown";
}

function rateLimit({
  windowMs = 60 * 1000,
  max = 60,
  prefix = "global",
  message = "Too many requests. Please try again later.",
  keyGenerator = clientKey,
} = {}) {
  return function rateLimitMiddleware(req, res, next) {
    if (process.env.DISABLE_RATE_LIMIT === "true") return next();

    const now = Date.now();
    const key = `${prefix}:${keyGenerator(req)}`;
    let bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    const remaining = Math.max(0, max - bucket.count);

    res.set("RateLimit-Limit", String(max));
    res.set("RateLimit-Remaining", String(remaining));
    res.set("RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > max) {
      res.set("Retry-After", String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
      return res.status(429).json({ success: false, message });
    }

    return next();
  };
}

module.exports = rateLimit;
