import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();

//Holds functions for signing jwt's

type AccessPayload = { sub: string; email: string };

const accessSecret = process.env.JWT_ACCESS_SECRET!;
if (!accessSecret) {
  throw new Error("Missing JWT_ACCESS_SECRET in env");
}

export function signAccessToken(userId: number, email: string) {
  const payload: AccessPayload = { sub: String(userId), email };
  return jwt.sign(payload, accessSecret, { expiresIn: process.env.ACCESS_TOKEN_TTL || "15m" });
}

export function verifyAccessToken(token: string) {
  return jwt.verify(token, accessSecret) as AccessPayload;
}
