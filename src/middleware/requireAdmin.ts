import type { Response, NextFunction } from "express";
import type { AuthedRequest } from "./requireAuth.js";

//Just verfies if the requested user is an admin

export function requireAdmin(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.user) {
    // Should not happen if requireAuth ran first
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!req.user.is_admin) {
    return res.status(403).json({ error: "Admin access required" });
  }

  return next();
}
