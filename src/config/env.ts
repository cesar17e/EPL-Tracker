function normalizeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    return url.toString().replace(/\/$/, "");
  } catch {
    return trimmed.replace(/\/$/, "");
  }
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  if (value.toLowerCase() === "true") return true;
  if (value.toLowerCase() === "false") return false;
  return undefined;
}

export function getPort() {
  const parsed = Number(process.env.PORT || 3001);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 3001;
}

export function getAllowedOrigins() {
  const combined = [process.env.FRONTEND_ORIGINS, process.env.FRONTEND_ORIGIN]
    .filter(Boolean)
    .join(",");

  const values = (combined || "http://localhost:3000")
    .split(",")
    .map((origin) => normalizeUrl(origin))
    .filter(Boolean);

  return [...new Set(values)];
}

export function isAllowedOrigin(origin: string) {
  return getAllowedOrigins().includes(normalizeUrl(origin));
}

export function getPublicBaseUrl() {
  const configured =
    process.env.PUBLIC_BASE_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    `http://localhost:${getPort()}`;

  return normalizeUrl(configured);
}

export function getEmailMode(): "demo" | "live" {
  const raw = (
    process.env.EMAIL_MODE ||
    (process.env.NODE_ENV === "production" ? "live" : "demo")
  ).toLowerCase();

  return raw === "live" ? "live" : "demo";
}

export function buildEmailVerificationRedirectUrl(
  status: "success" | "error",
  message: string
) {
  const base = process.env.EMAIL_VERIFY_REDIRECT_URL?.trim();
  if (!base) return null;

  const url = new URL(base);
  url.searchParams.set("status", status);
  url.searchParams.set("message", message);
  return url.toString();
}

export function buildPasswordResetRedirectUrl(token: string) {
  const base = process.env.PASSWORD_RESET_REDIRECT_URL?.trim();
  if (!base) return null;

  const url = new URL(base);
  url.searchParams.set("token", token);
  return url.toString();
}

export function validateStartupConfig() {
  const warnings: string[] = [];
  const isProd = process.env.NODE_ENV === "production";
  const emailMode = getEmailMode();

  if (process.env.EMAIL_VERIFY_REDIRECT_URL) {
    try {
      new URL(process.env.EMAIL_VERIFY_REDIRECT_URL);
    } catch {
      if (isProd) {
        throw new Error("EMAIL_VERIFY_REDIRECT_URL must be a valid absolute URL.");
      }
      warnings.push("EMAIL_VERIFY_REDIRECT_URL is not a valid absolute URL.");
    }
  }

  if (process.env.PASSWORD_RESET_REDIRECT_URL) {
    try {
      new URL(process.env.PASSWORD_RESET_REDIRECT_URL);
    } catch {
      if (isProd) {
        throw new Error("PASSWORD_RESET_REDIRECT_URL must be a valid absolute URL.");
      }
      warnings.push("PASSWORD_RESET_REDIRECT_URL is not a valid absolute URL.");
    }
  }

  if (emailMode === "live" && !process.env.RESEND_API_KEY) {
    if (isProd) {
      throw new Error("EMAIL_MODE=live requires RESEND_API_KEY.");
    }
    warnings.push("EMAIL_MODE=live without RESEND_API_KEY. Email will fail closed into preview logging.");
  }

  if (emailMode === "live" && !process.env.EMAIL_FROM) {
    warnings.push("EMAIL_FROM is not set. The default sender will be used.");
  }

  if (!process.env.PUBLIC_BASE_URL && !process.env.RENDER_EXTERNAL_URL) {
    warnings.push("PUBLIC_BASE_URL is not set. Email links will fall back to localhost outside Render.");
  }

  if (isProd && !process.env.FRONTEND_ORIGINS && !process.env.FRONTEND_ORIGIN) {
    warnings.push("No frontend origin configured. Browser CORS requests will only work from the localhost default.");
  }

  const configuredSecure = parseBoolean(process.env.COOKIE_SECURE);
  const secure = configuredSecure ?? isProd;
  const sameSite = (process.env.COOKIE_SAMESITE ?? (isProd ? "none" : "lax")).toLowerCase();

  if (sameSite === "none" && !secure) {
    warnings.push("COOKIE_SAMESITE=none with COOKIE_SECURE=false will be blocked by browsers.");
  }

  return warnings;
}
