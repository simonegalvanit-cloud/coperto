import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireAccount } from "@/lib/auth";
import { FloorEditor } from "./FloorEditor";

export const metadata: Metadata = { title: "Disegna la sala" };

export default async function EditFloorPage() {
  const { restaurant } = await requireAccount();
  const db = await getDb();
  const tables = await db
    .select()
    .from(schema.diningTables)
    .where(eq(schema.diningTables.restaurantId, restaurant.id))
    .orderBy(asc(schema.diningTables.label));
  return (
    <>
      <div>
        <Link href="/app/sala">‹ Sala</Link>
        <h1 style={{ marginTop: 8 }}>Disegna la sala</h1>
      </div>
      <FloorEditor initial={tables} />
    </>
  );
}
