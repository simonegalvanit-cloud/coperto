import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { conflictOn, type Spot } from "./floor";
import { loadPlan } from "./plan";

async function loadDay(restaurantId: string, date: string) {
  const db = await getDb();
  return db
    .select()
    .from(schema.reservations)
    .where(and(eq(schema.reservations.restaurantId, restaurantId), eq(schema.reservations.date, date)));
}

/**
 * Checks a place (one table or a group of joined tables) belongs to this restaurant and is free for the
 * booking's stay. Shared by the floor view and the booking form.
 */
export async function checkSpot(
  restaurantId: string,
  spot: Spot,
  stay: { id: string; date: string; time: string; durationMinutes: number },
): Promise<{ error: string } | { tableIds: string[]; label: string }> {
  const { tables, combos } = await loadPlan(restaurantId);
  const byId = new Map(tables.map((t) => [t.id, t]));
  let tableIds: string[];
  let label: string;
  if (spot.combinationId) {
    const combo = combos.find((c) => c.id === spot.combinationId);
    if (!combo) return { error: "Tavoli uniti non trovati." };
    tableIds = combo.tableIds;
    label = `I tavoli ${combo.label}`;
  } else {
    const table = spot.tableId ? byId.get(spot.tableId) : undefined;
    if (!table) return { error: "Tavolo non trovato." };
    tableIds = [table.id];
    label = `Il tavolo ${table.label}`;
  }
  const clash = conflictOn(tableIds, stay, await loadDay(restaurantId, stay.date), combos);
  if (clash) return { error: `${label} ${tableIds.length > 1 ? "sono" : "è"} già di ${clash.guestName} dalle ${clash.time}. Scegli un altro posto.` };
  return { tableIds, label };
}
