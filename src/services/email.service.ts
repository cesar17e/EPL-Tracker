import { Resend } from "resend";

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  return apiKey ? new Resend(apiKey) : null;
}

type SendEmailResult =
  | { mode: "demo"; verifyLink: string }
  | { mode: "live"; sent: true }
  | { mode: "live"; sent: false; error: unknown };

export async function sendVerifyEmail(to: string, verifyLink: string): Promise<SendEmailResult> {
  const mode = (process.env.EMAIL_MODE || "live").toLowerCase();

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

  const from = process.env.EMAIL_FROM || "SubTrack <onboarding@resend.dev>";

  const { error } = await resend.emails.send({
    from,
    to: [to],
    subject: "Verify your email",
    html: `
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

function formatFixtureLine(item: FixtureDigestItem) {
  const teamLabel = item.team.shortName ? `${item.team.name} (${item.team.shortName})` : item.team.name;

  if (!item.fixture) {
    return `<li><b>${teamLabel}</b>: No upcoming fixture found.</li>`;
  }

  const h = item.fixture.home.shortName || item.fixture.home.name || "Home";
  const a = item.fixture.away.shortName || item.fixture.away.name || "Away";
  const when = item.fixture.startTime;

  return `<li><b>${teamLabel}</b>: ${h} vs ${a} — <code>${when}</code></li>`;
}

export async function sendFixtureDigestEmail(
  to: string,
  payload: FixtureDigestPayload
): Promise<SendDigestResult> {
  const mode = (process.env.EMAIL_MODE || "live").toLowerCase();

  const subject = "Your favorite teams — next fixture";
  const html = `
    <p>Here is the next upcoming fixture for each of your favorite teams.</p>
    <p><i>Timezone:</i> ${payload.timeZone}</p>
    <ul>
      ${payload.items.map(formatFixtureLine).join("\n")}
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

  const from = process.env.EMAIL_FROM || "SubTrack <onboarding@resend.dev>";

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