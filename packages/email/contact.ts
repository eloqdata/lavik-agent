export function normalizeContact(input: unknown) {
  if (!input || typeof input !== "object") return null;
  const r = input as Record<string, unknown>,
    p = r.properties as Record<string, unknown> | undefined;
  if (!p || typeof p.email !== "string") return null;
  const email = p.email.trim().toLowerCase();
  if (
    email.length > 254 ||
    !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/.test(
      email,
    ) ||
    email.includes("..")
  )
    return null;
  const clean = (v: unknown) =>
    typeof v === "string"
      ? v.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 100)
      : "";
  const rawDate = p.lastmodifieddate ?? r.updatedAt;
  const date =
    typeof rawDate === "string" && Number.isFinite(Date.parse(rawDate))
      ? new Date(rawDate).toISOString()
      : null;
  return {
    email,
    domain: email.split("@")[1],
    first_name: clean(p.firstname),
    last_name: clean(p.lastname),
    source_id: clean(String(r.id ?? p.hs_object_id ?? "")),
    source_updated_at: date,
    archived: r.archived === true,
    suppressed:
      p.hs_email_optout === true ||
      p.hs_email_optout === "true" ||
      !!p.hs_email_hard_bounce_reason,
  };
}
