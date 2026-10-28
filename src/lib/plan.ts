import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

/** Groups of joined tables with their table ids, ordered like the tables, and a label like "T6+T7". */
function withTables(
  combos: (typeof schema.tableCombinations.$inferSelect)[],
  links: { combinationId: string; tableId: string }[],
  tables: { id: string; label: string }[],
) {
  const order = new Map(tables.map((t, i) => [t.id, i]));
  const label = new Map(tables.map((t) => [t.id, t.label]));
  return combos.map((c) => {
    const tableIds = links
      .filter((l) => l.combinationId === c.id)
      .map((l) => l.tableId)
      .sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
    return { ...c, tableIds, label: tableIds.map((id) => label.get(id)).join("+") };
  });
}

/** Everything drawn for a restaurant: floors in order, with their zones, fixtures and tables. */
export async function loadPlan(restaurantId: string) {
  const db = await getDb();
  const [floors, zones, fixtures, tables, combos, links] = await Promise.all([
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
    db.select().from(schema.tableCombinations).where(eq(schema.tableCombinations.restaurantId, restaurantId)),
    db
      .select({ combinationId: schema.combinationTables.combinationId, tableId: schema.combinationTables.tableId })
      .from(schema.combinationTables)
      .innerJoin(schema.tableCombinations, eq(schema.tableCombinations.id, schema.combinationTables.combinationId))
      .where(eq(schema.tableCombinations.restaurantId, restaurantId)),
  ]);
  return { floors, zones, fixtures, tables, combos: withTables(combos, links, tables) };
}

export type Plan = Awaited<ReturnType<typeof loadPlan>>;

/**
 * Places for pickers and labels: single tables ("T4", value "t:<id>") and joined tables ("T6+T7", value "c:<id>"),
 * with their floor and zone ("Piano terra · Sala"), in plan order.
 */
export async function tableOptions(restaurantId: string) {
  const { floors, zones, tables, combos } = await loadPlan(restaurantId);
  const zoneName = new Map(zones.map((z) => [z.id, z.name]));
  const floorOrder = new Map(floors.map((f, i) => [f.id, i]));
  const floorName = new Map(floors.map((f) => [f.id, f.name]));
  const groupOf = (t: (typeof tables)[number]) =>
    [floors.length > 1 ? floorName.get(t.floorId) : null, t.zoneId ? zoneName.get(t.zoneId) : null].filter(Boolean).join(" · ") || "Tavoli";
  const singles = tables.map((t) => ({
    value: `t:${t.id}`,
    id: t.id,
    combinationId: null as string | null,
    label: t.label,
    seats: t.seats,
    zone: t.zoneId ? (zoneName.get(t.zoneId) ?? null) : null,
    group: groupOf(t),
    order: floorOrder.get(t.floorId) ?? 0,
  }));
  const byId = new Map(tables.map((t) => [t.id, t]));
  const joined = combos
    .filter((c) => c.tableIds.length > 1 && c.tableIds.every((id) => byId.has(id)))
    .map((c) => {
      const first = byId.get(c.tableIds[0])!;
      return {
        value: `c:${c.id}`,
        id: null as string | null,
        combinationId: c.id,
        label: c.label,
        seats: c.maxCovers,
        zone: first.zoneId ? (zoneName.get(first.zoneId) ?? null) : null,
        group: "Tavoli uniti",
        order: 1000,
      };
    });
  return [...singles, ...joined].sort(
    (a, b) => a.order - b.order || a.group.localeCompare(b.group) || a.label.localeCompare(b.label, "it", { numeric: true }),
  );
}

export type TableOption = Awaited<ReturnType<typeof tableOptions>>[number];

/** Names of the areas closed on this date. */
export async function closedAreas(restaurantId: string, date: string) {
  const db = await getDb();
  const rows = await db
    .select({ name: schema.zoneClosures.zoneName })
    .from(schema.zoneClosures)
    .where(and(eq(schema.zoneClosures.restaurantId, restaurantId), eq(schema.zoneClosures.date, date)));
  return rows.map((r) => r.name);
}
