import "server-only";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

/** Everything drawn for a restaurant: floors in order, with their zones, fixtures and tables. */
export async function loadPlan(restaurantId: string) {
  const db = await getDb();
  const [floors, zones, fixtures, tables] = await Promise.all([
    db
      .select()
      .from(schema.floors)
      .where(eq(schema.floors.restaurantId, restaurantId))
      .orderBy(asc(schema.floors.position), asc(schema.floors.level)),
    db.select().from(schema.zones).where(eq(schema.zones.restaurantId, restaurantId)),
    db.select().from(schema.fixtures).where(eq(schema.fixtures.restaurantId, restaurantId)),
    db
      .select()
      .from(schema.diningTables)
      .where(eq(schema.diningTables.restaurantId, restaurantId))
      .orderBy(asc(schema.diningTables.label)),
  ]);
  return { floors, zones, fixtures, tables };
}

export type Plan = Awaited<ReturnType<typeof loadPlan>>;

/** Tables for pickers and labels: "T4", with its floor and zone ("Piano terra · Sala"), in plan order. */
export async function tableOptions(restaurantId: string) {
  const { floors, zones, tables } = await loadPlan(restaurantId);
  const zoneName = new Map(zones.map((z) => [z.id, z.name]));
  const floorOrder = new Map(floors.map((f, i) => [f.id, i]));
  const floorName = new Map(floors.map((f) => [f.id, f.name]));
  return tables
    .map((t) => ({
      id: t.id,
      label: t.label,
      seats: t.seats,
      zone: t.zoneId ? (zoneName.get(t.zoneId) ?? null) : null,
      group: [floors.length > 1 ? floorName.get(t.floorId) : null, t.zoneId ? zoneName.get(t.zoneId) : null].filter(Boolean).join(" · ") || "Tavoli",
      order: floorOrder.get(t.floorId) ?? 0,
    }))
    .sort((a, b) => a.order - b.order || a.group.localeCompare(b.group) || a.label.localeCompare(b.label, "it", { numeric: true }));
}

export type TableOption = Awaited<ReturnType<typeof tableOptions>>[number];
