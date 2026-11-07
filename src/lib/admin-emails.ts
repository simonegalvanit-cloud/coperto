/** Coperto's own staff: the accounts whose email is listed in ADMIN_EMAILS (comma separated). */
export function isAdmin(email: string | null | undefined) {
  if (!email) return false;
  const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return admins.includes(email.toLowerCase());
}
