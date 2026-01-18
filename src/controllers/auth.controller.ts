import type { Request, Response } from "express";
import { signAccessToken } from "../utils/tokens.js";
import { clearRefreshCookie, setRefreshCookie, REFRESH_COOKIE_NAME } from "../utils/cookies.js";
import {
  createUser,
  findUserByEmail,
  verifyPassword,
  storeRefreshToken,
  revokeRefreshToken,
  rotateRefreshToken,
  createEmailVerificationToken,
  consumeEmailVerificationToken,
  markUserEmailVerified,
} from "../services/auth.service.js";

import { pool } from "../db/pool.js";
import type { User } from "../db/types.js";
import crypto from "crypto";

import validator from "validator";
import { hasMxRecord } from "../utils/email.js";

//---Helpers ---

/**
 * Parse and validate email/password from the request body.
 * Returns null if missing or invalid types.
 */
function parseEmailPassword(req: Request) {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) return null;
  if (typeof email !== "string" || typeof password !== "string") return null;
  return { email, password };
}

/**
 * Generate a random refresh token.
 * This raw token is stored in an httpOnly cookie, only its hash is stored in the DB.
 */
function generateRefreshToken() {
  return crypto.randomBytes(32).toString("base64url");
}

/**
 * Fetch a user by id. Used by /refresh to embed email into a new access token.
 */
async function getUserById(id: number): Promise<User | null> {
  const r = await pool.query<User>(`SELECT * FROM users WHERE id = $1`, [id]);
  return r.rows[0] ?? null;
}

//Email helpers

function buildVerifyLink(rawToken: string) {
  const baseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 8000}`;
  // Your API base is /api already in server.ts
  return `${baseUrl}/api/auth/verify-email?token=${rawToken}`;
}

function sendVerifyEmailDev(email: string, link: string) {
  // Minimal “emailer” for now: just log the link.
  // Later we can swap this to Resend/Nodemailer with same signature.
  console.log(`\n[VERIFY EMAIL]\nTo: ${email}\nLink: ${link}\n`);
}

//-------End of Helpers------

/**
 * Register a new user and starts a session:
 *      Create user row
 *      Create refresh token session (DB + httpOnly cookie)
 *      Return acess token in JSON 
 *      Uses the mx checker for valid domian type
 *
 * Req --> The user will send a password and an email as their username in json format
 * 
 * Response --> Will send to the client the users id, their email and a json token
 */
export async function register(req: Request, res: Response) {
  const parsed = parseEmailPassword(req); 
  if (!parsed) return res.status(400).json({ error: "email and password are required" });

  //Level 1: format check using validator
  if (!validator.isEmail(parsed.email)) {
    return res.status(400).json({ error: "Invalid email format" });
  }

  //Level 2: domain can receive mail (MX records)
  if (!(await hasMxRecord(parsed.email))) {
    return res.status(400).json({ error: "Email domain does not accept mail" });
  }

  const existing = await findUserByEmail(parsed.email);
  if (existing) return res.status(409).json({ error: "Email already in use" });

  const user = await createUser(parsed.email, parsed.password);

  // Create verification token (24h) and "send" link (dev logs) for now
  const verifyExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const rawVerifyToken = await createEmailVerificationToken(user.id, verifyExpiresAt);
  const verifyLink = buildVerifyLink(rawVerifyToken);
  sendVerifyEmailDev(user.email, verifyLink);

  //Give them a refresh token
  const refreshToken = generateRefreshToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await storeRefreshToken(user.id, refreshToken, expiresAt);

  setRefreshCookie(res, refreshToken); 

  //Now give them a jwt 
  const accessToken = signAccessToken(user.id, user.email);

  return res.status(201).json({
    user: { id: user.id, email: user.email },
    accessToken,
  });
}


/**
 * Log a user in:
 * - verify credentials
 * - create refresh session (DB + cookie)
 * - return short-lived access token
 * 
 * Req --> Should include their eail and password in json format
 * 
 * Res --> Will send to the client the users id, their email and a json token 
 */
export async function login(req: Request, res: Response) {
  const parsed = parseEmailPassword(req);
  if (!parsed) return res.status(400).json({ error: "email and password are required" });

  const user = await findUserByEmail(parsed.email);
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const ok = await verifyPassword(user, parsed.password);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  const refreshToken = generateRefreshToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); //7 days
  await storeRefreshToken(user.id, refreshToken, expiresAt);

  //Give them a refresh cookie
  setRefreshCookie(res, refreshToken);

  //Give them a jwt
  const accessToken = signAccessToken(user.id, user.email);

  return res.json({
    user: { id: user.id, email: user.email },
    accessToken,
  });
}

/**
 * Refresh access token using the refresh_token cookie.
 *
 * With rotation enabled:
 * - the old refresh token becomes invalid (one-time use)
 * - a new refresh token is created and sent back as a new cookie
 * - a new short-lived access token is returned in JSON
 */
export async function refresh(req: Request, res: Response) {
  const raw = req.cookies?.[REFRESH_COOKIE_NAME];
  if (!raw) return res.status(401).json({ error: "Missing refresh cookie" });

  try {
    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // 1) Rotate refresh token (validate + revoke old + issue new)
    const { userId, newRefreshToken } = await rotateRefreshToken(raw, newExpiresAt);

    // 2) Replace refresh cookie with the new token
    setRefreshCookie(res, newRefreshToken);

    // 3) Mint new access token
    const user = await getUserById(userId);
    if (!user) return res.status(401).json({ error: "User no longer exists" });

    const accessToken = signAccessToken(user.id, user.email);
    return res.json({ accessToken });
  } catch (err: any) {
    if (err?.message === "REFRESH_INVALID") {
      // Invalid/expired/reused refresh token -> clear cookie and force re-login
      clearRefreshCookie(res);
      return res.status(401).json({ error: "Refresh token revoked/expired" });
    }
    console.error("Refresh error:", err);
    return res.status(500).json({ error: "Server error refreshing token" });
  }
}

/**
 * Logout:
 * - revoke refresh session in DB (server-side logout)
 * - clear refresh cookie (client-side cleanup)
 */
export async function logout(req: Request, res: Response) {
  const raw = req.cookies?.[REFRESH_COOKIE_NAME];
  if (raw) {
    await revokeRefreshToken(raw);
  }
  clearRefreshCookie(res);
  return res.json({ ok: true });
}



/**
 * Verify email using a token from the verification link.
 * This flips users.email_verified to true.
 */
export async function verifyEmail(req: Request, res: Response) {
  /*  
  How it works,
  When a request comes in, Express:
    Takes the URL, verify-email?token=abc123, Parses the query string (?token=abc123) Puts it on req.query as a plain JS object:
    req.query = {
      token: "abc123"
    }
    So we don’t have to manually parse the URL at all.
  */
  const token = req.query.token;
  if (!token || typeof token !== "string") {
    return res.status(400).json({ error: "Missing token" });
  }

  const userId = await consumeEmailVerificationToken(token);
  if (!userId) {
    return res.status(400).json({ error: "Invalid or expired token" });
  }

  await markUserEmailVerified(userId);
  return res.json({ ok: true, message: "Email verified" });
}

/**
 * Resend verification link (for unverified users).
 * Caller must be logged in (requireAuth), but still unverified.
 */
export async function requestVerify(req: Request, res: Response) {
  // requireAuth attaches req.user
  // @ts-expect-error (you can type this later with AuthedRequest)
  const userId = req.user?.id as number | undefined;

  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const user = await getUserById(userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  if (user.email_verified) {
    return res.json({ ok: true, message: "Email already verified" });
  }

  const verifyExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const rawVerifyToken = await createEmailVerificationToken(user.id, verifyExpiresAt);
  const verifyLink = buildVerifyLink(rawVerifyToken);
  sendVerifyEmailDev(user.email, verifyLink);

  return res.json({ ok: true, message: "Verification link sent" });
}
