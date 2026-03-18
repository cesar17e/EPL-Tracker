import type { Response } from "express";
import dotenv from "dotenv";
dotenv.config();

//Setting our cookie to hold the refeshToken

export const REFRESH_COOKIE_NAME = "refresh_token";
const DEFAULT_REFRESH_DAYS = 7;

type CookieSameSite = "lax" | "strict" | "none";

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  if (value.toLowerCase() === "true") return true;
  if (value.toLowerCase() === "false") return false;
  return undefined;
}

function getCookieSecurityConfig() {
  const isProd = process.env.NODE_ENV === "production";
  const configuredSecure = parseBoolean(process.env.COOKIE_SECURE);
  const secure = configuredSecure ?? isProd;

  const sameSiteRaw = (process.env.COOKIE_SAMESITE ?? (isProd ? "none" : "lax")).toLowerCase();
  const sameSite: CookieSameSite =
    sameSiteRaw === "strict" || sameSiteRaw === "none" ? sameSiteRaw : "lax";

  if (sameSite === "none" && !secure) {
    console.warn("COOKIE_SAMESITE is 'none' but COOKIE_SECURE is false. Browsers may block the cookie.");
  }

  return { secure, sameSite };
}

function getRefreshMaxAgeMs() {
  const parsed = Number(process.env.REFRESH_COOKIE_DAYS ?? DEFAULT_REFRESH_DAYS);
  const days = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_REFRESH_DAYS;
  return days * 24 * 60 * 60 * 1000;
}

export function setRefreshCookie(res: Response, token: string) {
  const { secure, sameSite } = getCookieSecurityConfig();

  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure,
    sameSite,
    path: "/api/auth", //Cookie goes to all auth paths
    maxAge: getRefreshMaxAgeMs(),
  });
}

export function clearRefreshCookie(res: Response) {
  const { secure, sameSite } = getCookieSecurityConfig();

  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure,
    sameSite,
    path: "/api/auth",  //Cookie goes all to auth paths            
  });
}
