import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getCurrentAccount } from "@/lib/auth";
import { guestCounts } from "@/lib/guests";
import { nowIn } from "@/lib/time";

/**
 * A cell safe for Excel: quoted, and never starting like a formula ("=…", "@…", "+HYPERLINK(…)"). A phone
 * number like "+39 333…" is only digits after the sign, can't run anything, and is kept as is.
 */
function cell(value: string | number | boolean | null): string {
  let s = value === null ? "" : String(value);
  if (/^[=@\t\r]/.test(s) || /^[+-](?![\d\s]*$)/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

/** All of a restaurant's guests as CSV: the data is theirs to take wherever they want. */
export async function GET() {
  const account = await getCurrentAccount();
  if (!account) return new Response("Non autorizzato", { status: 401 });
  const { restaurant } = account;
  const db = await getDb();
  const guests = await db.select().from(schema.guests).where(eq(schema.guests.restaurantId, restaurant.id)).orderBy(asc(schema.guests.name));
  const counts = await guestCounts(restaurant.id, guests.map((g) => g.id));
  const header = ["Nome", "Telefono", "Email", "Visite", "No-show", "Cancellazioni", "Ultima visita", "Allergie", "Note", "VIP", "Compleanno", "Anniversario", "Consenso scheda", "Consenso offerte"];
  const rows = guests.map((g) => {
    const c = counts.get(g.id);
    return [g.name, g.phone, g.email, c?.visits ?? 0, c?.noShows ?? 0, c?.cancellations ?? 0, c?.lastVisit ?? "", g.allergies, g.notes, g.vip ? "sì" : "", g.birthday, g.anniversary, day(g.profileConsentAt), day(g.marketingConsentAt)];
  });
  // Semicolons and a BOM so Excel in Italian opens it with the right columns and accents.
  const csv = "﻿" + [header, ...rows].map((r) => r.map(cell).join(";")).join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ospiti-${restaurant.slug}-${nowIn(restaurant.timezone).date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
