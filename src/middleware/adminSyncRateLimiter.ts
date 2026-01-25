import type { Response, NextFunction } from "express";
import type { AuthedRequest } from "./requireAuth.js";
import { adminSyncLimit } from "../config/upstash.js";

export default async function adminSyncRateLimiter(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = req.user?.id ?? "unknown";
    const identifier = `admin_sync:user_${userId}`;

    const result = await adminSyncLimit.limit(identifier);

    if (!result.success) {
      return res.status(429).json({
        error: "Admin sync limit reached. Try again later.",
      });
    }

    return next();
  } catch (err) {
    console.error("Admin sync rate limiter error:", err);
    return next(); // fail-open
  }
}
