"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { randomUUID } from "node:crypto";
import { endSession, endSessionsOf, getDevice, hashPassword, newSession, setSessionCookie, startSession, verifyPassword } from "@/lib/auth";
import { resolvePasswordReset, sendPasswordReset } from "@/lib/team";
import { slugify, uniqueSlug } from "@/lib/restaurant";
import type { ActionResult } from "@/components/ActionForm";
import { databaseHealth } from "@/lib/health";
import { TERMS_VERSION } from "@/lib/legal";

const signupSchema = z.object({
  restaurant: z.string().trim().min(2, "Scrivi il nome del ristorante.").max(80),
  city: z.string().trim().max(60),
  name: z.string().trim().min(2, "Scrivi il tuo nome.").max(80),
  email: z.email("Controlla l’email.").trim().toLowerCase(),
  password: z.string().min(8, "La password deve avere almeno 8 caratteri.").max(200),
  terms: z.literal("on", "Per continuare accetta i Termini di servizio e l’Accordo sul trattamento dei dati."),
});

// A sensible starting week: closed Monday, lunch and dinner the other days.
const DEFAULT_HOURS = [1, 2, 3, 4, 5, 6].flatMap((weekday) => [
  { weekday, name: "Pranzo", startTime: "12:30", endTime: "14:00" },
  { weekday, name: "Cena", startTime: "19:30", endTime: "22:00" },
]);

/** Which unique rule an insert broke, if that's what failed ("users_email_unique", …). */
function uniqueViolation(err: unknown): string | null {
  for (let e = err as { code?: string; constraint_name?: string; constraint?: string; cause?: unknown } | undefined; e; e = e.cause as typeof e) {
    if (e.code === "23505") return e.constraint_name ?? e.constraint ?? "unique";
  }
  return null;
}

/**
 * Creates the account, the restaurant with a typical week, and the session in one statement, so signup costs
 * one trip to the database instead of a dozen. "Email already used" and
 * "web address taken" come from the database's unique rules rather than separate questions beforehand.
 */
export async function signup(_: ActionResult, data: FormData): Promise<ActionResult> {
  const parsed = signupSchema.safeParse(Object.fromEntries(data));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const input = parsed.data;

  let db;
  try {
    db = await getDb();
  } catch (err) {
    return explainFailure("signup", err);
  }
  const passwordHash = await hashPassword(input.password);
  const userId = randomUUID();
  const restaurantId = randomUUID();
  const session = newSession(userId);
  let slug = slugify(input.restaurant);

  for (let attempt = 0; ; attempt++) {
    try {
      // One statement: the account, the restaurant, its week and the session are created together or not at all,
      // in a single exchange with the database. Foreign keys are checked when the statement ends, so the
      // restaurant can point at the user created in the same statement.
      const hours = sql.join(
        DEFAULT_HOURS.map((h) => sql`(${restaurantId}::uuid, ${h.weekday}, ${h.name}, ${h.startTime}, ${h.endTime})`),
        sql`, `,
      );
      await db.execute(sql`
        with
          u as (
            insert into ${schema.users} (id, email, name, password_hash)
            values (${userId}::uuid, ${input.email}, ${input.name}, ${passwordHash})
          ),
          r as (
            insert into ${schema.restaurants} (id, owner_id, slug, name, city, notify_email, terms_accepted_at, terms_version)
            values (${restaurantId}::uuid, ${userId}::uuid, ${slug}, ${input.restaurant}, ${input.city}, ${input.email}, now(), ${TERMS_VERSION})
          ),
          m as (
            insert into ${schema.members} (restaurant_id, user_id, role) values (${restaurantId}::uuid, ${userId}::uuid, 'owner')
          ),
          h as (
            insert into ${schema.serviceHours} (restaurant_id, weekday, name, start_time, end_time) values ${hours}
          ),
          s as (
            insert into ${schema.sessions} (id, user_id, expires_at)
            values (${session.row.id}, ${userId}::uuid, ${session.row.expiresAt.toISOString()}::timestamptz)
          )
        select 1
      `);
      break;
    } catch (err) {
      const rule = uniqueViolation(err);
      if (rule?.includes("email")) return { error: "Esiste già un account con questa email. Accedi invece di registrarti." };
      // Another restaurant has this web address: find a free one ("trattoria-da-mario-2") and try again.
      if (rule?.includes("slug") && attempt < 3) {
        slug = await uniqueSlug(input.restaurant);
        continue;
      }
      return explainFailure("signup", err);
    }
  }

  await setSessionCookie(session.token, session.row.expiresAt);
  revalidatePath("/", "layout");
  redirect("/app/impostazioni?benvenuto=1");
}

// Compared against when the email is unknown, so both cases take the same time.
const DUMMY_HASH = hashPassword("not-a-real-password");

/**
 * Logs in from /accedi, or from a restaurant's staff page (/team/<slug>, with the slug in the form): there the
 * session opens on that restaurant, and someone not on its team is told so.
 */
export async function login(_: ActionResult, data: FormData): Promise<ActionResult> {
  const email = String(data.get("email") ?? "").trim().toLowerCase();
  const password = String(data.get("password") ?? "");
  const slug = String(data.get("slug") ?? "");
  try {
    const db = await getDb();
    const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
    const valid = await verifyPassword(password, user?.passwordHash ?? (await DUMMY_HASH));
    if (!user || !valid) return { error: "Email o password non corretti." };
    const teams = await db
      .select({ restaurantId: schema.members.restaurantId, slug: schema.restaurants.slug, name: schema.restaurants.name })
      .from(schema.members)
      .innerJoin(schema.restaurants, eq(schema.restaurants.id, schema.members.restaurantId))
      .where(eq(schema.members.userId, user.id));
    if (teams.length === 0) return { error: "Questo account non fa più parte di nessun ristorante. Chiedi al titolare di invitarti di nuovo." };
    const here = slug ? teams.find((t) => t.slug === slug) : undefined;
    if (slug && !here) return { error: "Questo account non fa parte dello staff di questo ristorante." };
    await startSession(user.id, here?.restaurantId ?? null);
  } catch (err) {
    return explainFailure("login", err);
  }
  // A new account on this device: drop any pages the browser kept from the previous one.
  revalidatePath("/", "layout");
  redirect("/app");
}

/**
 * When logging in or signing up fails on the server, says why in words (database not set, unreachable or not
 * updated) instead of a blank error page; the details go to the server log.
 */
async function explainFailure(what: string, err: unknown): Promise<ActionResult> {
  console.error(`[${what}] failed`, err);
  const health = await databaseHealth();
  return { error: health.ok ? "Qualcosa è andato storto sul server. Riprova tra un attimo." : `Problema del server: ${health.message}` };
}

export async function requestPasswordReset(_: ActionResult, data: FormData): Promise<ActionResult> {
  const email = z.email().safeParse(String(data.get("email") ?? "").trim().toLowerCase());
  if (!email.success) return { error: "Controlla l’email." };
  await sendPasswordReset(email.data);
  // The same answer whether or not the address has an account, so the form can't be used to find out.
  return { ok: `Se ${email.data} ha un account Coperto, ti abbiamo mandato un link per scegliere una nuova password. Vale un’ora.` };
}

/** Sets the new password, uses up the link, logs out every other device and logs in here. */
export async function resetPassword(_: ActionResult, data: FormData): Promise<ActionResult> {
  const token = String(data.get("token") ?? "");
  const password = String(data.get("password") ?? "");
  const user = await resolvePasswordReset(token);
  if (!user) return { error: "Il link è scaduto o è già stato usato. Chiedine uno nuovo." };
  if (password.length < 8) return { error: "La password deve avere almeno 8 caratteri." };
  const db = await getDb();
  await db.update(schema.users).set({ passwordHash: await hashPassword(password) }).where(eq(schema.users.id, user.id));
  await db.delete(schema.passwordResets).where(eq(schema.passwordResets.userId, user.id));
  await endSessionsOf(user.id);
  await startSession(user.id);
  revalidatePath("/", "layout");
  redirect("/app");
}

export async function logout() {
  await endSession();
  revalidatePath("/", "layout");
  redirect((await getDevice()) ? "/sala" : "/accedi");
}
