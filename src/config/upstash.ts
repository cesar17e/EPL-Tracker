import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type RateLimiterClient = {
  limit: (identifier: string) => Promise<{ success: boolean }>;
};

function createNoopLimiter(name: string): RateLimiterClient {
  console.warn(`[rate-limit] ${name} limiter disabled (missing Upstash env).`);
  return {
    limit: async () => ({ success: true }),
  };
}

const hasUpstashEnv = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
);

let ratelimit: RateLimiterClient;
let adminSyncLimit: RateLimiterClient;

if (!hasUpstashEnv) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Missing Upstash configuration. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN."
    );
  }

  ratelimit = createNoopLimiter("general");
  adminSyncLimit = createNoopLimiter("admin-sync");
} else {
  const redis = Redis.fromEnv();

  ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, "1 m"),
    analytics: true,
  });

  adminSyncLimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(1, "1 d"), // once per day per admin
    analytics: true,
  });
}

export { adminSyncLimit };

export default ratelimit;
