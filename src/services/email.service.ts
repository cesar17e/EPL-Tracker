import { Resend } from "resend";
import { getEmailMode } from "../config/env.js";

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  return apiKey ? new Resend(apiKey) : null;
}

type SendEmailResult =
  | { mode: "demo"; verifyLink: string }
  | { mode: "live"; sent: true }
  | { mode: "live"; sent: false; error: unknown };

export async function sendVerifyEmail(to: string, verifyLink: string): Promise<SendEmailResult> {
  const mode = getEmailMode();

  // DEMO MODE: don't send, just return link
  if (mode === "demo") {
    console.log(`\n[VERIFY EMAIL - DEMO]\nTo: ${to}\nLink: ${verifyLink}\n`);
    return { mode: "demo", verifyLink };
  }

  // LIVE MODE (production sending)
  const resend = getResendClient();
  if (!resend) {
    console.warn("RESEND_API_KEY not set. Falling back to demo-like behavior.");
    console.log(`\n[VERIFY EMAIL FALLBACK]\nTo: ${to}\nLink: ${verifyLink}\n`);
    return { mode: "live", sent: false, error: "RESEND_API_KEY missing" };
  }

  const from = process.env.EMAIL_FROM || "PremTracker <noreply@premtracker.pro>";

  const { error } = await resend.emails.send({
    from,
    to: [to],
    subject: "Verify your PremTracker account",
    html: `
      <p>Welcome to PremTracker.</p>
      <p>Verify your email by clicking the link below:</p>
      <p><a href="${verifyLink}">${verifyLink}</a></p>
      <p>If you didn’t create an account, you can ignore this email.</p>
    `,
  });

  if (error) {
    console.error("Resend error:", error);
    console.log(`\n[VERIFY EMAIL FALLBACK]\nTo: ${to}\nLink: ${verifyLink}\n`);
    return { mode: "live", sent: false, error };
  }

  return { mode: "live", sent: true };
}

type SendPasswordResetResult =
  | { mode: "demo"; resetLink: string }
  | { mode: "live"; sent: true }
  | { mode: "live"; sent: false; error: unknown };

export async function sendPasswordResetEmail(
  to: string,
  resetLink: string
): Promise<SendPasswordResetResult> {
  const mode = getEmailMode();

  if (mode === "demo") {
    console.log(`\n[PASSWORD RESET - DEMO]\nTo: ${to}\nLink: ${resetLink}\n`);
    return { mode: "demo", resetLink };
  }

  const resend = getResendClient();
  if (!resend) {
    console.warn("RESEND_API_KEY not set. Falling back to demo-like behavior.");
    console.log(`\n[PASSWORD RESET FALLBACK]\nTo: ${to}\nLink: ${resetLink}\n`);
    return { mode: "live", sent: false, error: "RESEND_API_KEY missing" };
  }

  const from = process.env.EMAIL_FROM || "PremTracker <noreply@premtracker.pro>";

  const { error } = await resend.emails.send({
    from,
    to: [to],
    subject: "Reset your PremTracker password",
    html: `
      <p>We received a request to reset your PremTracker password.</p>
      <p>Use the link below to continue:</p>
      <p><a href="${resetLink}">${resetLink}</a></p>
      <p>This link expires in 1 hour and can only be used once.</p>
      <p>If you did not request this, you can ignore this email.</p>
    `,
  });

  if (error) {
    console.error("Resend error:", error);
    console.log(`\n[PASSWORD RESET FALLBACK]\nTo: ${to}\nLink: ${resetLink}\n`);
    return { mode: "live", sent: false, error };
  }

  return { mode: "live", sent: true };
}


//!------For upcoming game sending email---

type FixtureDigestItem = {
  team: { id: number; name: string; shortName: string | null };
  fixture: null | {
    startTime: string;
    home: { name: string | null; shortName: string | null };
    away: { name: string | null; shortName: string | null };
  };
};

type FixtureDigestPayload = {
  timeZone: string;
  items: FixtureDigestItem[];
};

type SendDigestResult =
  | { mode: "demo"; preview: string }
  | { mode: "live"; sent: true }
  | { mode: "live"; sent: false; error: unknown };

function formatFixtureKickoff(iso: string, timeZone: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatFixtureLine(item: FixtureDigestItem, timeZone: string) {
  const teamLabel = item.team.shortName ? `${item.team.name} (${item.team.shortName})` : item.team.name;

  if (!item.fixture) {
    return `<li><b>${teamLabel}</b>: No upcoming fixture found.</li>`;
  }

  const h = item.fixture.home.shortName || item.fixture.home.name || "Home";
  const a = item.fixture.away.shortName || item.fixture.away.name || "Away";
  const when = formatFixtureKickoff(item.fixture.startTime, timeZone);

  return `<li><b>${teamLabel}</b>: ${h} vs ${a} — <code>${when}</code></li>`;
}

export async function sendFixtureDigestEmail(
  to: string,
  payload: FixtureDigestPayload
): Promise<SendDigestResult> {
  const mode = getEmailMode();

  const subject = "Your favorite teams — next fixture";
  const html = `
    <p>Here is the next upcoming fixture for each of your favorite teams.</p>
    <p><i>Timezone:</i> ${payload.timeZone}</p>
    <ul>
      ${payload.items.map((item) => formatFixtureLine(item, payload.timeZone)).join("\n")}
    </ul>
    <p>You can disable these emails anytime in settings.</p>
  `;

  // DEMO MODE
  if (mode === "demo") {
    console.log(`\n[FIXTURE DIGEST - DEMO]\nTo: ${to}\nSubject: ${subject}\n\n${html}\n`);
    return { mode: "demo", preview: html };
  }

  // LIVE MODE
  const resend = getResendClient();
  if (!resend) {
    console.warn("RESEND_API_KEY not set. Falling back to demo-like behavior.");
    console.log(`\n[FIXTURE DIGEST FALLBACK]\nTo: ${to}\nSubject: ${subject}\n\n${html}\n`);
    return { mode: "live", sent: false, error: "RESEND_API_KEY missing" };
  }

  const from = process.env.EMAIL_FROM || "PremTracker <noreply@premtracker.pro>";

  const { error } = await resend.emails.send({
    from,
    to: [to],
    subject,
    html,
  });

  if (error) {
    console.error("Resend error:", error);
    console.log(`\n[FIXTURE DIGEST FALLBACK]\nTo: ${to}\nSubject: ${subject}\n\n${html}\n`);
    return { mode: "live", sent: false, error };
  }

  return { mode: "live", sent: true };
}
