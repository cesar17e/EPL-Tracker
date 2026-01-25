import type { Request, Response, NextFunction } from "express";


export function sundayOnly(req: Request, res: Response, next: NextFunction) {
  const tz = process.env.APP_TIMEZONE ?? "America/New_York";

  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
  }).format(new Date()); // "Sun", "Mon", ...

  if (weekday !== "Sun") {
    return res.status(403).json({ error: "Sync can only be run on Sunday" });
  }

  return next();
}
