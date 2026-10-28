// Pure helpers for matching guests, shared by the server and tests.

/**
 * One form for every way people type a phone number, so "333 123 4567", "+39 333-1234567" and
 * "0039 3331234567" are the same guest. Italian numbers without a country code get +39.
 * Returns "" for anything too short to be a phone number.
 */
export function normalizePhone(raw: string): string {
  let s = raw.trim().replace(/[^\d+]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  const digits = s.replace(/\D/g, "");
  if (digits.length < 6) return "";
  if (s.startsWith("+")) return "+" + digits;
  // Without a "+": Italian mobile (3…) and landline (0…) numbers, or a 39-prefixed one typed without the +.
  if (digits.startsWith("39") && digits.length >= 11) return "+" + digits;
  if (digits.startsWith("3") || digits.startsWith("0")) return "+39" + digits;
  return digits;
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** "+393331234567" → "+39 333 123 4567", for display. Other numbers are shown as stored. */
export function formatPhone(phone: string): string {
  const m = phone.match(/^\+39(3\d{2})(\d{3})(\d{3,4})$/);
  return m ? `+39 ${m[1]} ${m[2]} ${m[3]}` : phone;
}

/** Whether "MM-DD" falls on this date ("YYYY-MM-DD"). */
export function isSameDay(monthDay: string, date: string): boolean {
  return !!monthDay && date.slice(5) === monthDay;
}

/** Validates a day of the year typed as "MM-DD" (any year, so 29 February is allowed). */
export function isMonthDay(value: string): boolean {
  const m = value.match(/^(\d{2})-(\d{2})$/);
  if (!m) return false;
  const [month, day] = [Number(m[1]), Number(m[2])];
  const days = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
}
