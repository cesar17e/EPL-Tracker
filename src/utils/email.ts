import dns from "dns/promises";

/**
 * Checks whether an emails domain has MX records (i.e, can receive mail).
 * NOTE: This does not prove ownership; it's just a domain validity check, this will help from stop making the db overloaded with fake emails
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
