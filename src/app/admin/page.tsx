import type { Metadata } from "next";
import Link from "next/link";
import { listRestaurants, overview, requireAdmin } from "@/lib/admin";
import { nowIn } from "@/lib/time";

export const metadata: Metadata = { title: "Panoramica" };

const day = (d: Date) => new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeZone: "Europe/Rome" }).format(d);

export default async function AdminHome() {
  await requireAdmin();
  const [o, latest] = await Promise.all([overview(nowIn("Europe/Rome").date), listRestaurants("", 8)]);
  const stat = (value: number, label: string, href?: string) => (
    <div>
      <strong>{value.toLocaleString("it-IT")}</strong>
      <span>{href ? <Link href={href}>{label}</Link> : label}</span>
    </div>
  );
  return (
    <>
      <h1>Panoramica</h1>
      <div className="totals">
        {stat(o.restaurants, "ristoranti", "/admin/ristoranti")}
        {stat(o.new7, "nuovi in 7 giorni")}
        {stat(o.new30, "nuovi in 30 giorni")}
        {stat(o.active7, "attivi in 7 giorni")}
        {stat(o.users, "utenti", "/admin/utenti")}
      </div>
      <div className="totals">
        {stat(o.today, "prenotazioni per oggi")}
        {stat(o.month, "prenotazioni create questo mese")}
        {stat(o.monthOnline, "di cui online")}
        {stat(o.guests, "schede ospite con consenso")}
        {stat(o.applications, "candidature", "/admin/candidature")}
      </div>
      {o.noTerms > 0 && (
        <p className="panel">
          <strong>{o.noTerms} {o.noTerms === 1 ? "ristorante non ha" : "ristoranti non hanno"} ancora accettato</strong> Termini e accordo sul
          trattamento dei dati: lo vedono come avviso nell’app al prossimo accesso del titolare.
        </p>
      )}
      <section className="panel settings-section">
        <header>
          <h2>Ultimi iscritti</h2>
        </header>
        {latest.length === 0 ? (
          <p className="muted">Ancora nessun ristorante.</p>
        ) : (
          <ul className="list-plain">
            {latest.map((r) => (
              <li key={r.id}>
                <span>
                  <Link href={`/admin/ristoranti/${r.id}`} prefetch={false}><strong>{r.name}</strong></Link>
                  <span className="small muted" style={{ display: "block" }}>
                    {[r.city, r.ownerEmail, `iscritto il ${day(r.createdAt)}`].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="small">{r.bookings} prenotazioni</span>
              </li>
            ))}
          </ul>
        )}
        <p><Link href="/admin/ristoranti">Tutti i ristoranti ›</Link></p>
      </section>
    </>
  );
}
