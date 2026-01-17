import dns from "dns/promises";

/**
 * Checks whether an email's domain has MX records (i.e., can receive mail).
 * NOTE: This does not prove ownership; it's just a domain validity check.
 */
export async function hasMxRecord(email: string): Promise<boolean> {
  const domain = email.split("@")[1];
  if (!domain) return false;

  try {
    const records = await dns.resolveMx(domain);
    return records.length > 0;
  } catch {
    return false;
  }
}
