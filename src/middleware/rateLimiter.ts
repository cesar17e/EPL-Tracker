// src/middleware/rateLimiter.ts
import type { Request, Response, NextFunction } from "express";
import ratelimit from "../config/upstash.js";

/**
 * Rate-limiting middleware for Express.
 *
 * Minimal safety improvements:
 * 1) Use a more reliable IP fallback (handles proxy setups better when `trust proxy` is enabled).
 * 2) Add a route "bucket" prefix so /login spam doesn't rate-limit /refresh, etc.
 *
 * NOTE: In production, also add this once in server.ts:
 *   app.set("trust proxy", 1);
 */
function getClientIp(req: Request) {
  // If `app.set("trust proxy", 1)` is set, req.ip will reflect X-Forwarded-For properly.
  // This fallback helps in local/dev or misconfigured environments.
  const xff = (req.headers["x-forwarded-for"] as string | undefined)
    ?.split(",")[0]
    ?.trim();

  return req.ip || xff || req.socket.remoteAddress || "unknown";
}

export default async function rateLimiter(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // Base identifier: user id if authenticated, otherwise IP
    const baseIdentifier =
      (req as any).user?.id
        ? `user_${(req as any).user.id}`
        : `ip_${getClientIp(req)}`;

    /**
     * Route bucket prefix:
     * - Prevents different endpoints from "sharing" the same rate-limit bucket.
     * - Example: /login won't accidentally block /refresh.
     *
     * Use req.baseUrl + req.path so it stays consistent even when mounted under /api/auth.
     */
    const routeBucket = `${req.baseUrl}${req.path}`; // e.g. "/api/auth/login"
    const identifier = `route_${routeBucket}:${baseIdentifier}`;

    // Ask Upstash if this identifier is allowed to make a request.
    const result = await ratelimit.limit(identifier);

    if (!result.success) {
      return res.status(429).json({
        message: "Too many requests. Please slow down.",
      });
    }

    return next();
  } catch (err) {
    // Fail-open: don't block auth if Upstash errors out
    console.error("Rate limiter error:", err);
    return next();
  }
}
