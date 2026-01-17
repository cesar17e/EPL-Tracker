// src/middleware/rateLimiter.ts
import type { Request, Response, NextFunction } from "express";
import ratelimit from "../config/upstash.js";

/**
 * Rate-limiting middleware for Express.
 *
 * This middleware:
 * - Identifies the caller (user ID if authenticated, otherwise IP)
 * - Checks request allowance against Upstash Redis
 * - Blocks requests if the limit is exceeded
 */
export default async function rateLimiter(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    /**
     * Identify who is making the request.
     *
     * Priority:
     *  Authenticated user ID (strongest identifier)
     *  IP address (for unauthenticated routes like /login, /register)
     *
     */
    const identifier =
      (req as any).user?.id
        ? `user_${(req as any).user.id}` // logged-in user
        : req.ip || req.socket.remoteAddress || "unknown"; // anonymous client

    //Ask Upstash if this identifier is allowed to make a request.
    const result = await ratelimit.limit(identifier);

    /**
     * If the rate limit is exceeded:
     * - Return HTTP 429 (Too Many Requests)
     * - Do NOT call next()
     * - Stop request processing immediately
     */
    if (!result.success) {
      return res.status(429).json({
        message: "Too many requests. Please slow down.",
      });
    }

    /**
     * Request is within allowed limits.
     * Continue to the next middleware or route handler.
     */
    next();
  } catch (err) {
    /**
     * If the rate limiter fails (network issue, Upstash outage, etc):
     *
     * Log the error
     */
    console.error("Rate limiter error:", err);
    next();
  }
}
