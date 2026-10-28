import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireAccount } from "@/lib/auth";
import { formatPhone, normalizePhone } from "@/lib/contact";
import { guestCounts, linkUnlinked } from "@/lib/guests";
import { formatDate } from "@/lib/time";

export const metadata: Metadata = { title: "Ospiti" };

const PAGE = 100;

export default async function GuestsPage({ searchParams }: PageProps<"/app/ospiti">) {
  const { restaurant } = await requireAccount();
  const q = String((await searchParams).q ?? "").trim().slice(0, 80);
  await linkUnlinked(restaurant.id);

  const db = await getDb();
  const g = schema.guests;
  const like = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
  const phone = normalizePhone(q);
  const guests = await db
    .select()
    .from(g)
    .where(
      and(
        eq(g.restaurantId, restaurant.id),
        q ? or(ilike(g.name, like), ilike(g.email, like), phone ? ilike(g.phone, `%${phone.slice(-7)}%`) : undefined) : undefined,
      ),
    )
    .orderBy(desc(g.updatedAt))
    .limit(PAGE);
  const counts = await guestCounts(restaurant.id, guests.map((x) => x.id));

  return (
    <>
      <div className="spread">
        <h1>Ospiti</h1>
        <a className="btn btn-small" href="/app/ospiti/export" download>
          Esporta (CSV)
        </a>
      </div>
      <form className="row" action="/app/ospiti">
        <input className="input" style={{ flex: "1 1 260px", width: "auto" }} type="search" name="q" defaultValue={q} placeholder="Cerca per nome, telefono o email" aria-label="Cerca ospiti" />
        <button className="btn" type="submit">Cerca</button>
      </form>
      {guests.length === 0 ? (
        <div className="empty">
          {q ? `Nessun ospite trovato per “${q}”.` : "Qui compariranno gli ospiti: si crea una scheda da sola per chiunque prenoti con telefono o email."}
        </div>
      ) : (
        <ul className="guest-list">
          {guests.map((x) => {
            const c = counts.get(x.id);
            return (
              <li key={x.id}>
                <Link href={`/app/ospiti/${x.id}`}>
                  <span className="guest-name">
                    {x.name}
                    {x.vip && <span className="tag tag-ok">VIP</span>}
                  </span>
                  <span className="small muted">{[x.phone && formatPhone(x.phone), x.email].filter(Boolean).join(" · ")}</span>
                  <span className="small">
                    {c?.visits ? `${c.visits} ${c.visits === 1 ? "visita" : "visite"}` : "Nessuna visita"}
                    {c?.noShows ? <span className="tag tag-alert" style={{ marginLeft: 6 }}>{c.noShows} no-show</span> : null}
                    {c?.lastVisit && <span className="muted"> · ultima {formatDate(c.lastVisit, { year: true })}</span>}
                  </span>
                  {x.allergies && <span className="small allergy">Allergie: {x.allergies}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {guests.length === PAGE && <p className="small muted">Mostro i {PAGE} più recenti: cerca per trovare gli altri.</p>}
    </>
  );
}
