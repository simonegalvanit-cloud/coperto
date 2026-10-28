"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { endSession, hashPassword, startSession, verifyPassword } from "@/lib/auth";
import { uniqueSlug } from "@/lib/restaurant";
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

export async function signup(_: ActionResult, data: FormData): Promise<ActionResult> {
  const parsed = signupSchema.safeParse(Object.fromEntries(data));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const input = parsed.data;

  const db = await getDb();
  const [existing] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, input.email));
  if (existing) return { error: "Esiste già un account con questa email. Accedi invece di registrarti." };

  const passwordHash = await hashPassword(input.password);
  const slug = await uniqueSlug(input.restaurant);
  const userId = await db.transaction(async (tx) => {
    const [user] = await tx.insert(schema.users).values({ email: input.email, name: input.name, passwordHash }).returning();
    const [restaurant] = await tx
      .insert(schema.restaurants)
      .values({ ownerId: user.id, slug, name: input.restaurant, city: input.city, notifyEmail: input.email })
      .returning();
    await tx.insert(schema.serviceHours).values(DEFAULT_HOURS.map((h) => ({ ...h, restaurantId: restaurant.id })));
    return user.id;
  });

  await startSession(userId);
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
