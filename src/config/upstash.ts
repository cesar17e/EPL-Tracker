import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

/**
 * General-purpose rate limiter
 * Used for auth + normal user routes
 */
const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 m"),
  analytics: true,
});

/**
 * Very strict limiter for admin EPL sync
 * Prevents burning paid API calls
 */
export const adminSyncLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(1, "1 d"), // once per day per admin
  analytics: true,
});

export default ratelimit;
