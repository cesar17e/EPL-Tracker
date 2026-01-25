import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/tokens.js";
import { pool } from "../db/pool.js";

// Authentication middleware:
// Verifies JWT
// Loads current user state from DB

export interface AuthedRequest extends Request {
  user?: {
    id: number;
    email: string;
    email_verified: boolean;
    is_admin: boolean; //Added
  };
}

export async function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing Authorization Bearer token" });
  }

  const token = header.slice("Bearer ".length);

  try {
    // Verify JWT
    const payload = verifyAccessToken(token);
    const userId = Number(payload.sub);

    // Load user state from DB 
    const result = await pool.query<{
      id: number;
      email: string;
      email_verified: boolean;
      is_admin: boolean; //Added
    }>(
      `
      SELECT id, email, email_verified, is_admin
      FROM users
      WHERE id = $1
      `,
      [userId]
    );

    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: "User no longer exists" });
    }

  //Appends new json object to the request before sending it off to the next location
    req.user = user; 
    return next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
