"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import type { ActionResult } from "@/components/ActionForm";
import { currentSessionId, endSession, endSessionsOf, hashPassword, requireAccount, verifyPassword } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { TERMS_VERSION } from "@/lib/legal";
import { isPin, isWeakPin, setPin } from "@/lib/pins";
import { deleteRestaurant } from "@/lib/team";

async function passwordOk(userId: string, password: string) {
  const db = await getDb();
  const [u] = await db.select({ hash: schema.users.passwordHash }).from(schema.users).where(eq(schema.users.id, userId));
  return !!u?.hash && (await verifyPassword(password, u.hash));
}

/** After an account is gone: drop the cookie and any pages the browser kept. */
async function signedOut(to: string): Promise<never> {
  (await cookies()).delete("coperto_session");
  revalidatePath("/", "layout");
  redirect(to);
}

export async function acceptTerms() {
  const { restaurant } = await requireAccount("account");
  const db = await getDb();
  await db
    .update(schema.restaurants)
    .set({ termsAcceptedAt: new Date(), termsVersion: TERMS_VERSION })
    .where(eq(schema.restaurants.id, restaurant.id));
  revalidatePath("/app", "layout");
}

export async function saveName(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { user } = await requireAccount();
  const name = z.string().trim().min(2, "Scrivi il tuo nome.").max(80).safeParse(data.get("name"));
  if (!name.success) return { error: name.error.issues[0].message };
  const db = await getDb();
  await db.update(schema.users).set({ name: name.data }).where(eq(schema.users.id, user.id));
  revalidatePath("/app", "layout");
  return { ok: "Salvato." };
}

export async function changePassword(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { user } = await requireAccount();
  const next = String(data.get("next") ?? "");
  if (!(await passwordOk(user.id, String(data.get("current") ?? "")))) return { error: "La password attuale non è corretta." };
  if (next.length < 8) return { error: "La nuova password deve avere almeno 8 caratteri." };
  const db = await getDb();
  await db.update(schema.users).set({ passwordHash: await hashPassword(next) }).where(eq(schema.users.id, user.id));
  await endSessionsOf(user.id, await currentSessionId());
  return { ok: "Password cambiata. Sei uscito da tutti gli altri dispositivi." };
}

/** For someone on more than one team: work in another restaurant from now on, on this device. */
export async function switchRestaurant(data: FormData) {
  const { user } = await requireAccount();
  const id = z.uuid().parse(data.get("restaurantId"));
  const db = await getDb();
  const [member] = await db
    .select({ id: schema.members.id })
    .from(schema.members)
    .where(and(eq(schema.members.userId, user.id), eq(schema.members.restaurantId, id)));
  const session = await currentSessionId();
  if (member && session) await db.update(schema.sessions).set({ restaurantId: id }).where(eq(schema.sessions.id, session));
  revalidatePath("/", "layout");
  redirect("/app");
}

/** Leaves the current restaurant's team. With no other team left, the account itself is deleted. */
export async function leaveRestaurant() {
  const { restaurant, role, user } = await requireAccount();
  if (role === "owner") redirect("/app/account");
  const db = await getDb();
  await db.delete(schema.members).where(and(eq(schema.members.userId, user.id), eq(schema.members.restaurantId, restaurant.id)));
  const [other] = await db.select({ id: schema.members.id }).from(schema.members).where(eq(schema.members.userId, user.id)).limit(1);
  if (other) {
    revalidatePath("/", "layout");
    redirect("/app");
  }
  await db.delete(schema.users).where(eq(schema.users.id, user.id));
  await signedOut("/account-eliminato");
}

/** Deletes the user's own account. An owner first deletes the restaurant or hands it to someone else. */
export async function deleteMyAccount(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { user } = await requireAccount();
  if (!(await passwordOk(user.id, String(data.get("password") ?? "")))) return { error: "Password non corretta." };
  const db = await getDb();
  const [owned] = await db.select({ name: schema.restaurants.name }).from(schema.restaurants).where(eq(schema.restaurants.ownerId, user.id));
  if (owned) return { error: `Sei il titolare di ${owned.name}: prima elimina il ristorante (in Impostazioni) o passa la proprietà a un responsabile (in Team).` };
  await db.delete(schema.users).where(eq(schema.users.id, user.id));
  await signedOut("/account-eliminato");
  return null;
}

/**
 * The owner closes the restaurant's Coperto account: everything is deleted at once and for good, after the
 * password and the restaurant's name typed out. A confirmation goes to the owner.
 */
export async function closeRestaurant(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { restaurant, user } = await requireAccount("account");
  if (!(await passwordOk(user.id, String(data.get("password") ?? "")))) return { error: "Password non corretta." };
  if (String(data.get("confirmName") ?? "").trim().toLowerCase() !== restaurant.name.trim().toLowerCase()) {
    return { error: `Scrivi il nome del ristorante esattamente così: ${restaurant.name}` };
  }
  await deleteRestaurant(restaurant.id);
  if (user.email) await sendEmail({
    to: user.email,
    subject: `${restaurant.name} è stato eliminato da Coperto`,
    text: [
      `Ciao ${user.name},`,
      ``,
      `come hai chiesto, abbiamo eliminato ${restaurant.name} da Coperto: prenotazioni, ospiti, pianta della sala e team.`,
      `Il link di prenotazione non funziona più. Le copie di sicurezza del database si cancellano da sole entro 30 giorni.`,
      ``,
      `Grazie per aver usato Coperto.`,
    ].join("\n"),
  });
  await endSession();
  await signedOut(`/account-eliminato?ristorante=${encodeURIComponent(restaurant.name)}`);
  return null;
}

/** Chooses one's own 6-digit PIN for the room tablet of the restaurant they're working in. */
export async function setMyPin(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { restaurant, user } = await requireAccount();
  const pin = String(data.get("pin") ?? "").trim();
  if (!isPin(pin)) return { error: "Il PIN è fatto di 6 cifre." };
  if (isWeakPin(pin)) return { error: "Troppo facile da indovinare: evita cifre tutte uguali o in fila." };
  if (pin !== String(data.get("again") ?? "").trim()) return { error: "I due PIN non coincidono." };
  const db = await getDb();
  const [member] = await db
    .select({ id: schema.members.id })
    .from(schema.members)
    .where(and(eq(schema.members.userId, user.id), eq(schema.members.restaurantId, restaurant.id)));
  if (!member) return { error: "Non fai parte di questo team." };
  await setPin(member.id, pin);
  return { ok: "PIN salvato. Usalo sul tablet della sala." };
}
