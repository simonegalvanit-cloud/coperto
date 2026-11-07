"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import type { ActionResult } from "@/components/ActionForm";
import { logAdmin, requireAdmin } from "@/lib/admin";
import { isDate } from "@/lib/time";

async function restaurant(id: unknown) {
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return null;
  const db = await getDb();
  const [r] = await db.select().from(schema.restaurants).where(eq(schema.restaurants.id, parsed.data));
  return r ?? null;
}

const day = (d: Date) => new Intl.DateTimeFormat("it-IT", { dateStyle: "long", timeZone: "Europe/Rome" }).format(d);

/** Gives a restaurant more days of free trial, counted from today or from the current end, whichever is later. */
export async function extendTrial(_: ActionResult, data: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const r = await restaurant(data.get("id"));
  const days = z.coerce.number().int().min(1).max(365).safeParse(data.get("days"));
  if (!r || !days.success) return { error: "Scegli quanti giorni (da 1 a 365)." };
  const from = Math.max(Date.now(), r.trialEndsAt.getTime());
  const trialEndsAt = new Date(from + days.data * 86_400_000);
  const db = await getDb();
  await db
    .update(schema.restaurants)
    .set({ trialEndsAt, trialReminderSentAt: null, trialEndedNoticeAt: null })
    .where(eq(schema.restaurants.id, r.id));
  await logAdmin(admin, `Ha allungato la prova di ${days.data} giorni`, r.name);
  revalidatePath("/admin", "layout");
  return { ok: `Prova allungata fino al ${day(trialEndsAt)}.` };
}

/** Free access granted by Coperto (a pilot restaurant, a partner) until a date, with the reason. */
export async function grantFreeAccess(_: ActionResult, data: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const r = await restaurant(data.get("id"));
  const until = String(data.get("until") ?? "");
  const note = String(data.get("note") ?? "").trim().slice(0, 200);
  if (!r) return { error: "Ristorante non trovato." };
  if (!isDate(until) || new Date(`${until}T23:59:59Z`) <= new Date()) return { error: "Scegli una data futura." };
  if (!note) return { error: "Scrivi il motivo (per esempio: ristorante pilota)." };
  const db = await getDb();
  await db
    .update(schema.restaurants)
    .set({ compUntil: new Date(`${until}T23:59:59Z`), compNote: note })
    .where(eq(schema.restaurants.id, r.id));
  await logAdmin(admin, `Ha dato accesso gratuito fino al ${until} (${note})`, r.name);
  revalidatePath("/admin", "layout");
  return { ok: "Accesso gratuito attivo." };
}

export async function endFreeAccess(data: FormData) {
  const admin = await requireAdmin();
  const r = await restaurant(data.get("id"));
  if (!r) return;
  const db = await getDb();
  await db.update(schema.restaurants).set({ compUntil: null, compNote: "" }).where(eq(schema.restaurants.id, r.id));
  await logAdmin(admin, "Ha tolto l’accesso gratuito", r.name);
  revalidatePath("/admin", "layout");
}
