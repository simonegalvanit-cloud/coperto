import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin, revenue } from "@/lib/admin";
import { eur, PLANS } from "@/lib/billing";
import { paymentsEnabled } from "@/lib/stripe";

export const metadata: Metadata = { title: "Ricavi" };

const day = (d: Date) => new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeZone: "Europe/Rome" }).format(d);
const monthName = (ym: string) =>
  new Intl.DateTimeFormat("it-IT", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${ym}-01T00:00:00Z`));
const STATUS: Record<string, string> = { paid: "Pagata", failed: "Non riuscita" };

/** The last twelve months, every month present even when nothing was collected. */
function lastMonths(data: { month: string; net: number; count: number }[]) {
  const now = new Date();
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11 + i, 1));
    const ym = d.toISOString().slice(0, 7);
    const found = data.find((m) => m.month === ym);
    return { month: ym, net: found?.net ?? 0, count: found?.count ?? 0 };
  });
}

export default async function AdminRevenue() {
  await requireAdmin();
  const r = await revenue();
  const months = lastMonths(r.months);
  const max = Math.max(...months.map((m) => m.net), 1);
  const peak = months.reduce((a, b) => (b.net > a.net ? b : a), months[0]);
  const thisMonth = months[months.length - 1];
  const conversion = r.trialsEnded90 ? Math.round((r.converted90 / r.trialsEnded90) * 100) : null;
  const year = new Date().getFullYear();

  return (
    <>
      <div className="spread">
        <h1>Ricavi</h1>
        <a className="btn btn-small" href={`/admin/ricavi/export?anno=${year}`} download>Pagamenti {year} per il commercialista (CSV)</a>
      </div>
      {!paymentsEnabled() && (
        <p className="panel">
          <strong>I pagamenti non sono ancora collegati.</strong> Finché Stripe non è configurato (vedi Sistema), qui vedi solo prove e accessi
          gratuiti: nessun incasso.
        </p>
      )}
      <p className="small muted">Importi senza IVA. Ricorrenti: gli abbonamenti attivi oggi (un annuale vale un dodicesimo al mese).</p>

      <div className="totals">
        <div><strong className="money">{eur(r.mrr)}</strong><span>ricavi ricorrenti al mese</span></div>
        <div><strong className="money">{eur(r.arr)}</strong><span>all’anno, a questo ritmo</span></div>
        <div><strong className="money">{eur(thisMonth.net)}</strong><span>incassati questo mese</span></div>
        <div><strong className="money">{eur(r.collectedAllTime)}</strong><span>incassati in tutto</span></div>
      </div>

      <div className="totals">
        <div><strong>{r.byState.active}</strong><span>paganti</span></div>
        <div><strong>{r.byState.trial}</strong><span>in prova</span></div>
        <div><strong>{r.byState.past_due}</strong><span>pagamento non riuscito</span></div>
        <div><strong>{r.byState.expired}</strong><span>scaduti o disdetti</span></div>
        <div><strong>{r.byState.comp}</strong><span>gratis da Coperto</span></div>
      </div>

      <section className="panel settings-section">
        <header>
          <h2>Incassi per mese</h2>
          <p className="muted">Ultimi 12 mesi, senza IVA. Passa sopra una colonna per i dettagli.</p>
        </header>
        <div className="bars" role="img" aria-label={`Incassi per mese, ultimi 12 mesi: massimo ${eur(peak.net)} a ${monthName(peak.month)}`}>
          {months.map((m) => (
            <div key={m.month} className="bar-col" title={`${monthName(m.month)}: ${eur(m.net)} (${m.count} ${m.count === 1 ? "pagamento" : "pagamenti"})`}>
              <span className="bar-value">{m === peak && m.net > 0 ? eur(m.net) : m === thisMonth && m.net > 0 ? eur(m.net) : ""}</span>
              <span className="bar" style={{ height: `${Math.max(m.net > 0 ? 2 : 0, (m.net / max) * 100)}%` }} />
              <span className="bar-label">{monthName(m.month)}</span>
            </div>
          ))}
        </div>
        <details>
          <summary className="small">Vedi come tabella</summary>
          <table className="admin-table" style={{ minWidth: 0 }}>
            <thead><tr><th>Mese</th><th className="num">Pagamenti</th><th className="num">Incassato (senza IVA)</th></tr></thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.month}><td>{monthName(m.month)}</td><td className="num">{m.count}</td><td className="num">{eur(m.net)}</td></tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>

      <div className="grid-2">
        <section className="panel settings-section">
          <header><h2>Per piano</h2></header>
          <ul className="list-plain">
            {(Object.keys(PLANS) as (keyof typeof PLANS)[]).map((id) => (
              <li key={id}>
                <span><strong>{PLANS[id].name}</strong> <span className="muted small">· {r.byPlan[id].count} paganti</span></span>
                <span>{eur(r.byPlan[id].mrr)} / mese</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="panel settings-section">
          <header><h2>Prove e disdette</h2></header>
          <ul className="list-plain">
            <li>
              <span>Prove finite negli ultimi 90 giorni</span>
              <span>{r.trialsEnded90 ? `${r.converted90} su ${r.trialsEnded90} sono diventati clienti (${conversion}%)` : "nessuna"}</span>
            </li>
            <li><span>Disdetti, attivi fino a fine periodo</span><span>{r.cancelling}</span></li>
            <li><span>Abbonamenti terminati</span><span>{r.canceled}</span></li>
          </ul>
        </section>
      </div>

      <section className="panel settings-section">
        <header>
          <h2>Ultimi pagamenti</h2>
          {r.failedCount > 0 && <p className="form-error">{r.failedCount} pagamenti non riusciti: Stripe riprova da solo, e il titolare riceve un’email.</p>}
        </header>
        {r.recent.length === 0 ? (
          <p className="muted">Ancora nessun pagamento.</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>Data</th><th>Ristorante</th><th>Piano</th><th className="num">Senza IVA</th><th className="num">IVA</th><th className="num">Totale</th><th>Stato</th><th>Fattura</th></tr>
              </thead>
              <tbody>
                {r.recent.map((p) => (
                  <tr key={p.id}>
                    <td className="small">{day(p.createdAt)}</td>
                    <td>{p.restaurantId ? <Link href={`/admin/ristoranti/${p.restaurantId}`} prefetch={false}>{p.restaurantName}</Link> : p.restaurantName}</td>
                    <td className="small">{p.plan && PLANS[p.plan as keyof typeof PLANS] ? `${PLANS[p.plan as keyof typeof PLANS].name} ${p.interval === "year" ? "annuale" : "mensile"}` : "—"}</td>
                    <td className="num">{eur(p.amountNet)}</td>
                    <td className="num">{eur(p.amountTax)}</td>
                    <td className="num">{eur(p.amountTotal)}</td>
                    <td><span className={`tag ${p.status === "paid" ? "tag-ok" : "tag-alert"}`}>{STATUS[p.status] ?? p.status}</span></td>
                    <td className="small">{p.invoiceUrl ? <a href={p.invoiceUrl} target="_blank" rel="noreferrer">{p.number || "apri"}</a> : p.number}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
