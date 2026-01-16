import type { Response } from "express";
import dotenv from "dotenv";
dotenv.config();

//Setting our cookie to hold the refeshToken

export const REFRESH_COOKIE_NAME = "refresh_token";

export function setRefreshCookie(res: Response, token: string) {
  const isProd = process.env.NODE_ENV === "production";

  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/api/auth", //Cookie goes to all auth paths
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearRefreshCookie(res: Response) {
  const isProd = process.env.NODE_ENV === "production";

  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/api/auth",  //Cookie goes all to auth paths            
  });
}
