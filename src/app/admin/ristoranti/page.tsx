import type { Metadata } from "next";
import Link from "next/link";
import { listRestaurants, requireAdmin } from "@/lib/admin";
import { billingState, PLANS } from "@/lib/billing";

export const metadata: Metadata = { title: "Ristoranti" };

const day = (d: Date | string | null) => (d ? new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeZone: "Europe/Rome" }).format(new Date(d)) : "mai");

export default async function AdminRestaurants({ searchParams }: PageProps<"/admin/ristoranti">) {
  await requireAdmin();
  const q = String((await searchParams).q ?? "").trim().slice(0, 80);
  const list = await listRestaurants(q);
  return (
    <>
      <h1>Ristoranti</h1>
      <form className="row" action="/admin/ristoranti">
        <input className="input" style={{ flex: "1 1 260px", width: "auto" }} type="search" name="q" defaultValue={q} placeholder="Nome, città, indirizzo o email del titolare" aria-label="Cerca ristoranti" />
        <button className="btn" type="submit">Cerca</button>
      </form>
      {list.length === 0 ? (
        <p className="empty">{q ? `Nessun ristorante per “${q}”.` : "Ancora nessun ristorante."}</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Ristorante</th>
                <th>Titolare</th>
                <th>Iscritto</th>
                <th className="num">Team</th>
                <th className="num">Tavoli</th>
                <th className="num">Prenotazioni</th>
                <th>Ultima prenotazione</th>
                <th>Abbonamento</th>
                <th>Stato</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/admin/ristoranti/${r.id}`} prefetch={false}><strong>{r.name}</strong></Link>
                    {r.city && <span className="small muted" style={{ display: "block" }}>{r.city}</span>}
                  </td>
                  <td className="small">{r.ownerName}<span className="muted" style={{ display: "block" }}>{r.ownerEmail}</span></td>
                  <td className="small">{day(r.createdAt)}</td>
                  <td className="num">{r.team}</td>
                  <td className="num">{r.tables}</td>
                  <td className="num">{r.bookings}</td>
                  <td className="small">{day(r.lastBooking)}</td>
                  <td className="small">
                    <BillingTag r={r} />
                  </td>
                  <td>
                    {!r.bookingOpen && <span className="tag tag-alert">online sospeso</span>}{" "}
                    {!r.termsAccepted && <span className="tag">termini da accettare</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {list.length === 100 && <p className="small muted">Mostro i 100 più recenti: cerca per trovare gli altri.</p>}
    </>
  );
}

function BillingTag({ r }: { r: Parameters<typeof billingState>[0] }) {
  const s = billingState(r);
  if (s.kind === "trial") return <span className="tag">prova, {s.daysLeft} gg</span>;
  if (s.kind === "comp") return <span className="tag">gratis</span>;
  if (s.kind === "active") return <span className="tag tag-ok">{PLANS[s.plan].name} {s.interval === "year" ? "annuale" : "mensile"}</span>;
  if (s.kind === "past_due") return <span className="tag tag-alert">pagamento non riuscito</span>;
  return <span className="tag tag-alert">{s.reason === "trial_over" ? "prova scaduta" : "disdetto"}</span>;
}
