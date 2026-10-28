"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { requireAccount } from "@/lib/auth";
import { SERVICE_NAMES } from "@/lib/hours";
import { isDate, isTime, toMinutes } from "@/lib/time";
import type { ActionResult } from "@/components/ActionForm";

const detailsSchema = z.object({
  name: z.string().trim().min(2, "Scrivi il nome del ristorante.").max(80),
  address: z.string().trim().max(120),
  city: z.string().trim().max(60),
  phone: z.string().trim().max(40),
  notifyEmail: z.email("Controlla l’email per le notifiche.").trim().toLowerCase(),
});

export async function saveDetails(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { restaurant } = await requireAccount();
  const parsed = detailsSchema.safeParse(Object.fromEntries(data));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const db = await getDb();
  await db.update(schema.restaurants).set(parsed.data).where(eq(schema.restaurants.id, restaurant.id));
  revalidatePath("/app", "layout");
  return { ok: "Salvato." };
}

const int = (min: number, max: number, msg: string) => z.coerce.number().int(msg).min(min, msg).max(max, msg);

const rulesSchema = z.object({
  bookingOpen: z.literal("on").optional(),
  capacity: int(1, 2000, "I posti in sala devono essere tra 1 e 2000."),
  maxCoversPerSlot: z.union([z.literal(""), int(1, 2000, "Il limite di arrivi deve essere un numero positivo.")]),
  slotMinutes: z.coerce.number().pipe(z.union([z.literal(15), z.literal(30), z.literal(60)])),
  durationMinutes: int(30, 360, "La durata deve essere tra 30 e 360 minuti."),
  maxPartySize: int(1, 200, "Il gruppo massimo deve essere tra 1 e 200."),
  minNoticeMinutes: int(0, 10080, "Il preavviso deve essere tra 0 e 10080 minuti."),
  maxDaysAhead: int(1, 365, "Si può prenotare da 1 a 365 giorni in anticipo."),
});

export async function saveRules(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { restaurant } = await requireAccount();
  const parsed = rulesSchema.safeParse(Object.fromEntries(data));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { bookingOpen, maxCoversPerSlot, ...rest } = parsed.data;
  const db = await getDb();
  await db
    .update(schema.restaurants)
    .set({ ...rest, bookingOpen: bookingOpen === "on", maxCoversPerSlot: maxCoversPerSlot === "" ? null : maxCoversPerSlot })
    .where(eq(schema.restaurants.id, restaurant.id));
  revalidatePath("/app", "layout");
  return { ok: "Salvato." };
}

/** The hours grid posts d{weekday}_{service}_{on|start|end} for every day and service. */
export async function saveHours(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { restaurant } = await requireAccount();
  const rows: (typeof schema.serviceHours.$inferInsert)[] = [];
  for (let weekday = 0; weekday < 7; weekday++) {
    for (const [i, name] of SERVICE_NAMES.entries()) {
      if (data.get(`d${weekday}_${i}_on`) !== "on") continue;
      const startTime = String(data.get(`d${weekday}_${i}_start`) ?? "");
      const endTime = String(data.get(`d${weekday}_${i}_end`) ?? "");
      if (!isTime(startTime) || !isTime(endTime)) return { error: `Controlla gli orari: ${name.toLowerCase()} ha un orario mancante.` };
      if (toMinutes(endTime) < toMinutes(startTime)) {
        return { error: `${name}: l’ultimo arrivo (${endTime}) è prima dell’apertura (${startTime}).` };
      }
      rows.push({ restaurantId: restaurant.id, weekday, name, startTime, endTime });
    }
  }
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.delete(schema.serviceHours).where(eq(schema.serviceHours.restaurantId, restaurant.id));
    if (rows.length) await tx.insert(schema.serviceHours).values(rows);
  });
  revalidatePath("/app", "layout");
  return { ok: "Orari salvati." };
}

export async function addClosure(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { restaurant } = await requireAccount();
  const date = String(data.get("date") ?? "");
  const note = String(data.get("note") ?? "").trim().slice(0, 120);
  if (!isDate(date)) return { error: "Scegli una data." };
  const db = await getDb();
  await db.insert(schema.closures).values({ restaurantId: restaurant.id, date, note }).onConflictDoNothing();
  revalidatePath("/app", "layout");
  return { ok: "Chiusura aggiunta." };
}

export async function removeClosure(data: FormData) {
  const { restaurant } = await requireAccount();
  const id = z.uuid().parse(data.get("id"));
  const db = await getDb();
  await db.delete(schema.closures).where(and(eq(schema.closures.id, id), eq(schema.closures.restaurantId, restaurant.id)));
  revalidatePath("/app", "layout");
}
