import "server-only";
import { createHash } from "node:crypto";
import { and, eq, gt, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { getDb, schema, type DB } from "@/db";
import { randomToken } from "./auth";
import { normalizeEmail, normalizePhone } from "./contact";
import { marketingWording, profileWording, RETENTION } from "./consent-wording";

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type ConsentSource = "online" | "staff" | "guest_link";

// The wording is stored with every consent, so a later change of wording never changes what someone agreed to.
export { marketingWording, profileWording };

export async function logConsent(
  db: DB | Tx,
  guestId: string,
  kind: "profile" | "marketing",
  action: "granted" | "withdrawn",
  source: ConsentSource,
  wording: string,
) {
  await db.insert(schema.consentLog).values({ guestId, kind, action, source, wording });
}

/** Last nine digits of a phone number: enough to recognise the same number however it was typed. */
const phoneTail = (phone: string) => phone.replace(/\D/g, "").slice(-9);

/**
 * When a guest agrees to be remembered, their earlier bookings with the same phone or email join the profile,
 * so the first visit after saying yes already counts the ones before.
 */
async function linkPastBookings(db: DB | Tx, restaurantId: string, guestId: string, phone: string, email: string) {
  const r = schema.reservations;
  const byPhone = phone ? sql`right(regexp_replace(${r.guestPhone}, '[^0-9]', '', 'g'), 9) = ${phoneTail(phone)}` : undefined;
  const byEmail = email ? sql`lower(${r.guestEmail}) = ${email}` : undefined;
  await db
    .update(r)
    .set({ guestId })
    .where(and(eq(r.restaurantId, restaurantId), isNull(r.guestId), or(byPhone, byEmail)));
}

/**
 * The guest profile a booking belongs to, respecting consent:
 * - with consent given now: the existing profile (consent recorded on it if it didn't have one) or a new one;
 * - without: only a profile that already has consent (the guest said yes before), never a new one.
 * A booking never adds an email to an existing profile: that address is where the guest's private data link
 * goes, so someone booking with another person's phone number must not be able to redirect it.
 */
export async function guestFor(
  db: DB | Tx,
  restaurant: { id: string; name: string },
  contact: { guestName: string; guestPhone: string; guestEmail: string },
  consent?: { profile: boolean; marketing?: boolean; source: ConsentSource },
): Promise<string | null> {
  const phone = normalizePhone(contact.guestPhone);
  const email = normalizeEmail(contact.guestEmail);
  if (!phone && !email) return null;
  const g = schema.guests;
  const [byPhone] = phone ? await db.select().from(g).where(and(eq(g.restaurantId, restaurant.id), eq(g.phone, phone))).limit(1) : [];
  const [found] = byPhone ? [byPhone] : email ? await db.select().from(g).where(and(eq(g.restaurantId, restaurant.id), eq(g.email, email))).limit(1) : [];

  if (!consent?.profile) return found?.profileConsentAt ? found.id : null;

  const now = new Date();
  let id: string;
  if (found) {
    id = found.id;
    const patch: Partial<typeof g.$inferInsert> = { updatedAt: now };
    if (phone && !found.phone) patch.phone = phone;
    if (!found.profileConsentAt) {
      patch.profileConsentAt = now;
      patch.profileConsentSource = consent.source;
      await logConsent(db, id, "profile", "granted", consent.source, profileWording(restaurant.name));
    }
    if (consent.marketing && !found.marketingConsentAt) {
      patch.marketingConsentAt = now;
      await logConsent(db, id, "marketing", "granted", consent.source, marketingWording(restaurant.name));
    }
    await db.update(g).set(patch).where(eq(g.id, id));
  } else {
    [{ id }] = await db
      .insert(g)
      .values({
        restaurantId: restaurant.id,
        name: contact.guestName.trim() || "Ospite",
        phone,
        email,
        profileConsentAt: now,
        profileConsentSource: consent.source,
        marketingConsentAt: consent.marketing ? now : null,
      })
      .returning({ id: g.id });
    await logConsent(db, id, "profile", "granted", consent.source, profileWording(restaurant.name));
    if (consent.marketing) await logConsent(db, id, "marketing", "granted", consent.source, marketingWording(restaurant.name));
  }
  await linkPastBookings(db, restaurant.id, id, phone || found?.phone || "", email || found?.email || "");
  return id;
}

/**
 * Forgets a guest (they withdrew consent, or asked to be deleted): the profile and its consent records go;
 * past bookings keep only the numbers (no name, contacts or notes); upcoming bookings keep what's needed to
 * welcome them, but are no longer tied to a profile.
 */
export async function eraseGuest(restaurantId: string, guestId: string, today: string | SQL) {
  const db = await getDb();
  const r = schema.reservations;
  await db.transaction(async (tx) => {
    await tx
      .update(r)
      .set({ guestName: "Ospite cancellato", guestPhone: "", guestEmail: "", notes: "", updatedAt: new Date() })
      .where(and(eq(r.guestId, guestId), eq(r.restaurantId, restaurantId), lt(r.date, today)));
    await tx.update(r).set({ guestId: null }).where(and(eq(r.guestId, guestId), eq(r.restaurantId, restaurantId)));
    await tx.delete(schema.guests).where(and(eq(schema.guests.id, guestId), eq(schema.guests.restaurantId, restaurantId)));
  });
}

export async function setMarketing(guestId: string, on: boolean, source: ConsentSource, restaurantName: string) {
  const db = await getDb();
  await db
    .update(schema.guests)
    .set({ marketingConsentAt: on ? new Date() : null, updatedAt: new Date() })
    .where(eq(schema.guests.id, guestId));
  await logConsent(db, guestId, "marketing", on ? "granted" : "withdrawn", source, marketingWording(restaurantName));
}

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
const LINK_HOURS = 24;

/** A private link for the guest to see, download or delete their data; only its hash is stored. */
export async function createGuestLink(guestId: string) {
  const db = await getDb();
  const token = randomToken();
  await db.insert(schema.guestTokens).values({ id: tokenHash(token), guestId, expiresAt: new Date(Date.now() + LINK_HOURS * 3_600_000) });
  return token;
}

/** The guest and restaurant behind a private link, if it's valid and hasn't expired. */
export async function resolveGuestLink(token: string) {
  const db = await getDb();
  const [row] = await db
    .select({ guest: schema.guests, restaurant: schema.restaurants })
    .from(schema.guestTokens)
    .innerJoin(schema.guests, eq(schema.guests.id, schema.guestTokens.guestId))
    .innerJoin(schema.restaurants, eq(schema.restaurants.id, schema.guests.restaurantId))
    .where(and(eq(schema.guestTokens.id, tokenHash(token)), gt(schema.guestTokens.expiresAt, new Date())));
  return row ?? null;
}

/** Staff record a consent the guest gave them in person or on the phone (for a profile made before consent existed). */
export async function recordStaffConsent(restaurant: { id: string; name: string }, guestId: string) {
  const db = await getDb();
  const now = new Date();
  const [updated] = await db
    .update(schema.guests)
    .set({ profileConsentAt: now, profileConsentSource: "staff", updatedAt: now })
    .where(and(eq(schema.guests.id, guestId), eq(schema.guests.restaurantId, restaurant.id), isNull(schema.guests.profileConsentAt)))
    .returning({ id: schema.guests.id });
  if (updated) await logConsent(db, guestId, "profile", "granted", "staff", profileWording(restaurant.name));
}

/**
 * Daily retention cleanup, for every restaurant:
 * - bookings older than RETENTION.bookingMonths and not on a profile lose name, contacts and notes;
 * - profiles with consent and no booking in RETENTION.profileMonths are deleted (their bookings were already
 *   anonymised by the rule above once unlinked).
 * Profiles without consent (made before consent existed) are left for the restaurant to decide.
 */
export async function cleanupRetention() {
  const db = await getDb();
  const r = schema.reservations;
  const g = schema.guests;
  const { bookingMonths, profileMonths } = RETENTION;
  const stale = await db
    .select({ id: g.id, restaurantId: g.restaurantId })
    .from(g)
    .where(
      and(
        sql`${g.profileConsentAt} is not null`,
        lt(g.createdAt, sql`now() - make_interval(months => ${profileMonths})`),
        sql`not exists (select 1 from ${r} where ${r.guestId} = ${g.id} and ${r.date} >= (current_date - make_interval(months => ${profileMonths}))::date)`,
      ),
    );
  for (const s of stale) await eraseGuest(s.restaurantId, s.id, sql`current_date`);
  const anonymised = await db
    .update(r)
    .set({ guestName: "Ospite cancellato", guestPhone: "", guestEmail: "", notes: "", updatedAt: new Date() })
    .where(
      and(
        isNull(r.guestId),
        lt(r.date, sql`(current_date - make_interval(months => ${bookingMonths}))::date`),
        or(sql`${r.guestName} <> 'Ospite cancellato'`, sql`${r.guestPhone} <> ''`, sql`${r.guestEmail} <> ''`, sql`${r.notes} <> ''`),
      ),
    )
    .returning({ id: r.id });
  await db.delete(schema.guestTokens).where(lt(schema.guestTokens.expiresAt, new Date()));
  return { profilesDeleted: stale.length, bookingsAnonymised: anonymised.length };
}
