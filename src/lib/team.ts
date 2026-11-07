import "server-only";
import { and, eq, gt, inArray, notExists, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { isAdmin } from "./admin-emails";
import { randomToken, tokenHash } from "./auth";
import { sendEmail } from "./email";
import { ROLE_LABEL, type MemberRole } from "./roles";
import { appUrl } from "./url";

const INVITE_DAYS = 7;
const RESET_MINUTES = 60;

/** Creates (or renews) an invitation and emails the link. Only the link's hash is stored. */
export async function sendInvite(
  restaurant: { id: string; name: string },
  invite: { email: string; name: string; role: MemberRole },
  invitedBy: { id: string; name: string },
) {
  const db = await getDb();
  const token = randomToken();
  const row = {
    id: tokenHash(token),
    restaurantId: restaurant.id,
    email: invite.email,
    name: invite.name,
    role: invite.role,
    invitedBy: invitedBy.id,
    expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
    createdAt: new Date(),
  };
  // One invitation per person: inviting again replaces the old link, which stops working.
  await db
    .insert(schema.invites)
    .values(row)
    .onConflictDoUpdate({ target: [schema.invites.restaurantId, schema.invites.email], set: row });
  const link = `${await appUrl()}/invito/${token}`;
  await sendEmail({
    to: invite.email,
    subject: `${invitedBy.name} ti invita nel team di ${restaurant.name} su Coperto`,
    text: [
      `Ciao ${invite.name},`,
      ``,
      `${invitedBy.name} ti ha aggiunto al team di ${restaurant.name} su Coperto, come ${ROLE_LABEL[invite.role]}.`,
      `Apri questo link per scegliere la tua password ed entrare (vale ${INVITE_DAYS} giorni):`,
      link,
      ``,
      `Se non ti aspettavi questo invito, ignora questa email.`,
    ].join("\n"),
  });
}

/** The invitation behind a link, with its restaurant, if it hasn't expired or been withdrawn. */
export async function resolveInvite(token: string) {
  const db = await getDb();
  const [row] = await db
    .select({ invite: schema.invites, restaurant: { id: schema.restaurants.id, name: schema.restaurants.name, slug: schema.restaurants.slug } })
    .from(schema.invites)
    .innerJoin(schema.restaurants, eq(schema.restaurants.id, schema.invites.restaurantId))
    .where(and(eq(schema.invites.id, tokenHash(token)), gt(schema.invites.expiresAt, new Date())));
  return row ?? null;
}

/**
 * Emails a link to set a new password, if the address has an account. At most one every two minutes, so the
 * form can't be used to flood someone's inbox. The caller always shows the same message either way, so the
 * form doesn't reveal who has an account.
 */
export async function sendPasswordReset(email: string) {
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (!user) return;
  const [recent] = await db
    .select({ id: schema.passwordResets.id })
    .from(schema.passwordResets)
    .where(and(eq(schema.passwordResets.userId, user.id), gt(schema.passwordResets.createdAt, new Date(Date.now() - 120_000))));
  if (recent) return;
  const token = randomToken();
  await db.insert(schema.passwordResets).values({ id: tokenHash(token), userId: user.id, expiresAt: new Date(Date.now() + RESET_MINUTES * 60_000) });
  await sendEmail({
    to: email,
    subject: "Scegli una nuova password per Coperto",
    text: [
      `Ciao ${user.name},`,
      ``,
      `per scegliere una nuova password apri questo link (vale un’ora e si usa una volta sola):`,
      `${await appUrl()}/password-nuova/${token}`,
      ``,
      `Se non l’hai chiesto tu, ignora questa email: la tua password resta quella di prima.`,
    ].join("\n"),
  });
}

/** The user a password link belongs to, if it's still valid. */
export async function resolvePasswordReset(token: string) {
  const db = await getDb();
  const [row] = await db
    .select({ user: { id: schema.users.id, email: schema.users.email, name: schema.users.name } })
    .from(schema.passwordResets)
    .innerJoin(schema.users, eq(schema.users.id, schema.passwordResets.userId))
    .where(and(eq(schema.passwordResets.id, tokenHash(token)), gt(schema.passwordResets.expiresAt, new Date())));
  return row?.user ?? null;
}

/**
 * Deletes a restaurant and everything in it (bookings, guests, floor plan, team), then the accounts of team
 * members who aren't on any other team. Someone who also works elsewhere keeps their account, and so does
 * Coperto's own staff.
 */
export async function deleteRestaurant(restaurantId: string) {
  const db = await getDb();
  await db.transaction(async (tx) => {
    const team = await tx
      .select({ userId: schema.members.userId, email: schema.users.email })
      .from(schema.members)
      .innerJoin(schema.users, eq(schema.users.id, schema.members.userId))
      .where(eq(schema.members.restaurantId, restaurantId));
    await tx.delete(schema.restaurants).where(eq(schema.restaurants.id, restaurantId));
    // Coperto's own staff keep their login: they use it for the admin panel.
    const ids = team.filter((m) => !isAdmin(m.email)).map((m) => m.userId);
    if (ids.length) {
      await tx
        .delete(schema.users)
        .where(
          and(
            inArray(schema.users.id, ids),
            notExists(tx.select({ one: sql`1` }).from(schema.members).where(eq(schema.members.userId, schema.users.id))),
          ),
        );
    }
  });
}

/** Everything a restaurant has in Coperto, for the owner to take with them (GDPR art. 20, and simply theirs). */
export async function exportRestaurant(restaurantId: string) {
  const db = await getDb();
  const r = restaurantId;
  const [[restaurant], hours, closures, floors, zones, fixtures, tables, combos, bookings, guests, consents, waitlist, team] = await Promise.all([
    db.select().from(schema.restaurants).where(eq(schema.restaurants.id, r)),
    db.select().from(schema.serviceHours).where(eq(schema.serviceHours.restaurantId, r)),
    db.select().from(schema.closures).where(eq(schema.closures.restaurantId, r)),
    db.select().from(schema.floors).where(eq(schema.floors.restaurantId, r)),
    db.select().from(schema.zones).where(eq(schema.zones.restaurantId, r)),
    db.select().from(schema.fixtures).where(eq(schema.fixtures.restaurantId, r)),
    db.select().from(schema.diningTables).where(eq(schema.diningTables.restaurantId, r)),
    db.select().from(schema.tableCombinations).where(eq(schema.tableCombinations.restaurantId, r)),
    db.select().from(schema.reservations).where(eq(schema.reservations.restaurantId, r)),
    db.select().from(schema.guests).where(eq(schema.guests.restaurantId, r)),
    db
      .select({ log: schema.consentLog })
      .from(schema.consentLog)
      .innerJoin(schema.guests, eq(schema.guests.id, schema.consentLog.guestId))
      .where(eq(schema.guests.restaurantId, r)),
    db.select().from(schema.waitlist).where(eq(schema.waitlist.restaurantId, r)),
    db
      .select({ name: schema.users.name, email: schema.users.email, role: schema.members.role, since: schema.members.createdAt })
      .from(schema.members)
      .innerJoin(schema.users, eq(schema.users.id, schema.members.userId))
      .where(eq(schema.members.restaurantId, r)),
  ]);
  const { termsAcceptedAt, termsVersion, ...details } = restaurant;
  return {
    esportatoIl: new Date().toISOString(),
    ristorante: details,
    terminiAccettati: { il: termsAcceptedAt, versione: termsVersion },
    orari: hours,
    chiusure: closures,
    pianta: { piani: floors, aree: zones, elementi: fixtures, tavoli: tables, tavoliUniti: combos },
    // Without the guests' private links to manage their bookings.
    prenotazioni: bookings.map((b) => ({ ...b, manageToken: undefined })),
    ospiti: guests,
    consensi: consents.map((c) => c.log),
    listaAttesa: waitlist,
    team,
  };
}
