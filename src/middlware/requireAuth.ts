import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/tokens.js";

//Authetication middleware, it checks if the user has a valid jwt, then adds the users id and email to the request

export interface AuthedRequest extends Request {
  user?: { id: number; email: string };
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing Authorization Bearer token" });
  }

  const token = header.slice("Bearer ".length);

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: Number(payload.sub), email: payload.email }; //append to the request
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
