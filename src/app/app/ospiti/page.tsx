import type { Metadata } from "next";
import Link from "next/link";
import { and, count, desc, eq, ilike, isNotNull, isNull, or } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireAccount } from "@/lib/auth";
import { formatPhone, normalizePhone } from "@/lib/contact";
import { guestCounts } from "@/lib/guests";
import { formatDate } from "@/lib/time";

export const metadata: Metadata = { title: "Ospiti" };

const PAGE = 100;

export default async function GuestsPage({ searchParams }: PageProps<"/app/ospiti">) {
  const { restaurant } = await requireAccount();
  const q = String((await searchParams).q ?? "").trim().slice(0, 80);

  const db = await getDb();
  const g = schema.guests;
  const like = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
  const phone = normalizePhone(q);
  const [guests, [{ legacy }]] = await Promise.all([
    db
    .select()
    .from(g)
    .where(
      and(
        eq(g.restaurantId, restaurant.id),
        isNotNull(g.profileConsentAt),
        q ? or(ilike(g.name, like), ilike(g.email, like), phone ? ilike(g.phone, `%${phone.slice(-7)}%`) : undefined) : undefined,
      ),
    )
    .orderBy(desc(g.updatedAt))
    .limit(PAGE),
    db.select({ legacy: count() }).from(g).where(and(eq(g.restaurantId, restaurant.id), isNull(g.profileConsentAt))),
  ]);
  const counts = await guestCounts(restaurant.id, guests.map((x) => x.id));

  return (
    <>
      <div className="spread">
        <h1>Ospiti</h1>
        <a className="btn btn-small" href="/app/ospiti/export" download>
          Esporta (CSV)
        </a>
      </div>
      <p className="small muted">
        Compaiono solo gli ospiti che hanno scelto di essere ricordati, prenotando online o dicendolo a voi. Chi non
        lo sceglie prenota normalmente, ma non ha una scheda.
      </p>
      {legacy > 0 && (
        <p className="panel">
          <strong>{legacy} {legacy === 1 ? "scheda" : "schede"} senza consenso</strong>, create prima che servisse. Sono spente:
          non compaiono sulle prenotazioni. <Link href="/app/ospiti/senza-consenso">Decidi cosa farne</Link>
        </p>
      )}
      <form className="row" action="/app/ospiti">
        <input className="input" style={{ flex: "1 1 260px", width: "auto" }} type="search" name="q" defaultValue={q} placeholder="Cerca per nome, telefono o email" aria-label="Cerca ospiti" />
        <button className="btn" type="submit">Cerca</button>
      </form>
      {guests.length === 0 ? (
        <div className="empty">
          {q ? `Nessun ospite trovato per “${q}”.` : "Qui compariranno gli ospiti che scelgono di essere ricordati: online spuntando “Ricordati di me”, oppure dicendolo a voi quando prenotano."}
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
