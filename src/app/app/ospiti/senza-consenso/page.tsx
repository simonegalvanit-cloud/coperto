import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { ConfirmButton } from "@/components/ConfirmButton";
import { requireAccount } from "@/lib/auth";
import { formatPhone } from "@/lib/contact";
import { guestCounts } from "@/lib/guests";
import { formatDate } from "@/lib/time";
import { deleteUnconsented } from "../actions";

export const metadata: Metadata = { title: "Schede senza consenso" };

/** Profiles made before consent existed: switched off until staff record the guest's yes, or delete them. */
export default async function UnconsentedPage() {
  const { restaurant } = await requireAccount();
  const db = await getDb();
  const g = schema.guests;
  const guests = await db
    .select()
    .from(g)
    .where(and(eq(g.restaurantId, restaurant.id), isNull(g.profileConsentAt)))
    .orderBy(asc(g.name))
    .limit(500);
  const counts = await guestCounts(restaurant.id, guests.map((x) => x.id));

  return (
    <>
      <div>
        <Link href="/app/ospiti">‹ Ospiti</Link>
        <h1 style={{ marginTop: 8 }}>Schede senza consenso</h1>
      </div>
      <p className="muted">
        Queste schede sono state create prima che Coperto chiedesse il consenso. Per la legge sulla privacy servono il suo
        sì, soprattutto per le allergie, quindi sono spente: non compaiono sulle prenotazioni e non si aggiornano. Quando
        l’ospite torna, chiedigli se vuole essere ricordato e registra il consenso dalla sua scheda; altrimenti eliminala.
      </p>
      {guests.length === 0 ? (
        <div className="empty">Nessuna scheda senza consenso.</div>
      ) : (
        <form action={deleteUnconsented} className="stack">
          <ul className="list-plain">
            {guests.map((x) => {
              const c = counts.get(x.id);
              return (
                <li key={x.id}>
                  <label className="check check-top" style={{ fontWeight: 400 }}>
                    <input type="checkbox" name="id" value={x.id} aria-label={`Seleziona ${x.name}`} />
                    <span>
                      <Link href={`/app/ospiti/${x.id}`}><strong>{x.name}</strong></Link>
                      <span className="small muted" style={{ display: "block" }}>
                        {[x.phone && formatPhone(x.phone), x.email, c?.visits ? `${c.visits} ${c.visits === 1 ? "visita" : "visite"}` : "", c?.lastVisit && `ultima ${formatDate(c.lastVisit, { year: true })}`].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <div>
            <ConfirmButton className="btn btn-danger" question="Eliminare le schede selezionate? Le prenotazioni passate restano solo come numeri." confirmLabel="Elimina">
              Elimina le selezionate
            </ConfirmButton>
          </div>
        </form>
      )}
    </>
  );
}
