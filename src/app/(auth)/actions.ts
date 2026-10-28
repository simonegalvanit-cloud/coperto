"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { randomUUID } from "node:crypto";
import { endSession, hashPassword, newSession, setSessionCookie, startSession, verifyPassword } from "@/lib/auth";
import { slugify, uniqueSlug } from "@/lib/restaurant";
import type { ActionResult } from "@/components/ActionForm";

const signupSchema = z.object({
  restaurant: z.string().trim().min(2, "Scrivi il nome del ristorante.").max(80),
  city: z.string().trim().max(60),
  name: z.string().trim().min(2, "Scrivi il tuo nome.").max(80),
  email: z.email("Controlla l’email.").trim().toLowerCase(),
  password: z.string().min(8, "La password deve avere almeno 8 caratteri.").max(200),
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

  const db = await getDb();
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
            insert into ${schema.restaurants} (id, owner_id, slug, name, city, notify_email)
            values (${restaurantId}::uuid, ${userId}::uuid, ${slug}, ${input.restaurant}, ${input.city}, ${input.email})
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
      throw err;
    }
  }

  await setSessionCookie(session.token, session.row.expiresAt);
  revalidatePath("/", "layout");
  redirect("/app/impostazioni?benvenuto=1");
}

// Compared against when the email is unknown, so both cases take the same time.
const DUMMY_HASH = hashPassword("not-a-real-password");

export async function login(_: ActionResult, data: FormData): Promise<ActionResult> {
  const email = String(data.get("email") ?? "").trim().toLowerCase();
  const password = String(data.get("password") ?? "");
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  const valid = await verifyPassword(password, user?.passwordHash ?? (await DUMMY_HASH));
  if (!user || !valid) return { error: "Email o password non corretti." };
  await startSession(user.id);
  // A new account on this device: drop any pages the browser kept from the previous one.
  revalidatePath("/", "layout");
  redirect("/app");
}

export async function logout() {
  await endSession();
  revalidatePath("/", "layout");
  redirect("/accedi");
}
