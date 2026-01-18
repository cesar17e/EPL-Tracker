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
