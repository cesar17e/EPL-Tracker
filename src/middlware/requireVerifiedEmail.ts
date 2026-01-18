import type { Response, NextFunction } from "express";
import type { AuthedRequest } from "./requireAuth.js";

/**
 * Middleware that ensures the authenticated user has a verified email.
 * Intended only for email related feature.
 *
 * Auth flow: requireAuth --> requireVerifiedEmail --> handler
 */
export function requireVerifiedEmail(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.user) {
    // Should never happen if requireAuth ran first
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!req.user.email_verified) {
    return res.status(403).json({
      error: "Email address not verified",
      action: "Please verify your email to enable this feature",
    });
  }

  next();
}
