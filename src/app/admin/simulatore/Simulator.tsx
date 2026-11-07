"use client";

import { useState } from "react";
import { eur, PLANS } from "@/lib/billing";
import { project, simulate, type SimInput } from "@/lib/simulator";

type Today = { restaurants: number; salaShare: number; yearlyShare: number };

const pct = (v: number) => `${Math.round(v * 100)}%`;
const n0 = (v: number) => Math.round(v).toLocaleString("it-IT");

/** What-if numbers for the admin: revenue and profit for a number of paying restaurants, and a year of growth. */
export function Simulator({ today }: { today: Today }) {
  const [restaurants, setRestaurants] = useState(100);
  const [salaShare, setSalaShare] = useState(0.6);
  const [yearlyShare, setYearlyShare] = useState(0.3);
  const [costs, setCosts] = useState(300);
  const [fees, setFees] = useState(true);
  const [feePercent, setFeePercent] = useState(1.5);
  const [feeFixed, setFeeFixed] = useState(0.25);
  const [newPerMonth, setNewPerMonth] = useState(10);
  const [churn, setChurn] = useState(2);

  const input: SimInput = {
    restaurants,
    salaShare,
    yearlyShare,
    costsMonthly: Math.round(costs * 100),
    feePercent: fees ? feePercent : 0,
    feeFixed: fees ? Math.round(feeFixed * 100) : 0,
  };
  const s = simulate(input);
  const rows = project({ ...input, newPerMonth, churnPercent: churn });
  const maxRevenue = Math.max(...rows.map((r) => r.revenue), 1);
  const line = (label: string, yearly: number, hint?: string, strong = false) => (
    <tr className={strong ? "sim-total" : undefined}>
      <th scope="row">
        {label}
        {hint && <span className="small muted" style={{ display: "block", fontWeight: 400 }}>{hint}</span>}
      </th>
      <td className="num">{eur(yearly / 365)}</td>
      <td className="num">{eur(yearly / 12)}</td>
      <td className="num">{eur(yearly)}</td>
    </tr>
  );
  const number = (value: number, set: (v: number) => void, props: { min: number; max: number; step: number; label: string; suffix?: string }) => (
    <label className="field">
      {props.label}
      <span className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
        <input
          className="input"
          type="number"
          min={props.min}
          max={props.max}
          step={props.step}
          value={value}
          aria-label={props.label}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) set(Math.min(props.max, Math.max(props.min, v)));
          }}
          style={{ width: 120 }}
        />
        {props.suffix && <span className="small muted">{props.suffix}</span>}
      </span>
    </label>
  );

  return (
    <>
      <section className="panel settings-section">
        <header>
          <h2>Ipotesi</h2>
        </header>
        <div>
          <button
            type="button"
            className="btn btn-small"
            onClick={() => {
              setRestaurants(today.restaurants);
              setSalaShare(today.salaShare);
              setYearlyShare(today.yearlyShare);
            }}
          >
            Parti dai numeri di oggi ({today.restaurants} paganti)
          </button>
        </div>
        <div className="sim-grid">
          <label className="field">
            Ristoranti abbonati: <strong>{n0(restaurants)}</strong>
            <input type="range" min={0} max={2000} step={5} value={restaurants} onChange={(e) => setRestaurants(Number(e.target.value))} aria-label="Ristoranti abbonati" />
          </label>
          {number(restaurants, setRestaurants, { min: 0, max: 100000, step: 1, label: "Oppure scrivi il numero" })}
          <label className="field">
            Sul piano Sala: <strong>{pct(salaShare)}</strong> <span className="hint">il resto su Banco</span>
            <input type="range" min={0} max={1} step={0.05} value={salaShare} onChange={(e) => setSalaShare(Number(e.target.value))} aria-label="Quota sul piano Sala" />
          </label>
          <label className="field">
            Pagano all’anno: <strong>{pct(yearlyShare)}</strong> <span className="hint">due mesi gratis</span>
            <input type="range" min={0} max={1} step={0.05} value={yearlyShare} onChange={(e) => setYearlyShare(Number(e.target.value))} aria-label="Quota che paga all’anno" />
          </label>
          {number(costs, setCosts, { min: 0, max: 1000000, step: 10, label: "Costi di Coperto al mese", suffix: "€ (server, email, strumenti, persone)" })}
          <div className="field">
            <label className="check">
              <input type="checkbox" checked={fees} onChange={(e) => setFees(e.target.checked)} /> Commissioni Stripe
            </label>
            {fees && (
              <span className="row" style={{ gap: 8 }}>
                <input className="input" type="number" min={0} max={10} step={0.1} value={feePercent} onChange={(e) => setFeePercent(Math.max(0, Number(e.target.value) || 0))} aria-label="Commissione Stripe in percentuale" style={{ width: 80 }} />
                <span className="small">% +</span>
                <input className="input" type="number" min={0} max={5} step={0.05} value={feeFixed} onChange={(e) => setFeeFixed(Math.max(0, Number(e.target.value) || 0))} aria-label="Commissione Stripe fissa in euro" style={{ width: 80 }} />
                <span className="small">€ a pagamento</span>
              </span>
            )}
          </div>
        </div>
      </section>

      <div className="totals">
        <div><strong className="money">{eur(s.revenue / 12)}</strong><span>ricavi al mese, senza IVA</span></div>
        <div><strong className="money">{eur(s.profit / 12)}</strong><span>utile al mese</span></div>
        <div><strong className="money">{eur(s.profit)}</strong><span>utile all’anno</span></div>
        <div>
          <strong>{s.breakEven === Infinity ? "—" : n0(s.breakEven)}</strong>
          <span>ristoranti per coprire i costi</span>
        </div>
      </div>

      <section className="panel settings-section">
        <header>
          <h2>Giorno, mese, anno</h2>
          <p className="muted">
            Con {n0(restaurants)} ristoranti: in media {eur(restaurants ? s.revenue / 12 / restaurants : 0)} al mese ciascuno, senza IVA. Utile prima delle
            tasse sul reddito (IRES/IRAP), che dipendono dalla tua situazione: chiedi al commercialista.
          </p>
        </header>
        <div className="admin-table-wrap">
          <table className="admin-table sim-table">
            <thead>
              <tr><th></th><th className="num">Al giorno</th><th className="num">Al mese</th><th className="num">All’anno</th></tr>
            </thead>
            <tbody>
              {line("Ricavi", s.revenue, "Senza IVA: è il fatturato di Coperto")}
              {line("Commissioni Stripe", -s.fees)}
              {line("Costi", -s.costs)}
              {line("Utile", s.profit, "Prima delle tasse sul reddito", true)}
              {line("IVA incassata", s.iva, "Da versare allo Stato: non è un tuo guadagno")}
            </tbody>
          </table>
        </div>
        <p className="small muted">
          Prezzi usati: Banco {eur(PLANS.banco.month)} al mese o {eur(PLANS.banco.year)} all’anno, Sala {eur(PLANS.sala.month)} al mese o {eur(PLANS.sala.year)} all’anno, più IVA.
        </p>
      </section>

      <section className="panel settings-section">
        <header>
          <h2>I prossimi 12 mesi</h2>
          <p className="muted">Partendo dai ristoranti qui sopra: quanti nuovi arrivano ogni mese, e quanti disdicono.</p>
        </header>
        <div className="row" style={{ gap: 16 }}>
          {number(newPerMonth, setNewPerMonth, { min: 0, max: 10000, step: 1, label: "Nuovi ristoranti al mese" })}
          {number(churn, setChurn, { min: 0, max: 100, step: 0.5, label: "Disdette al mese", suffix: "% dei paganti" })}
        </div>
        <div className="bars" role="img" aria-label={`Ricavi mensili nei prossimi 12 mesi, fino a ${eur(rows[11].revenue)} al mese`}>
          {rows.map((r) => (
            <div key={r.month} className="bar-col" title={`Mese ${r.month}: ${n0(r.restaurants)} ristoranti, ricavi ${eur(r.revenue)}, utile ${eur(r.profit)}`}>
              <span className="bar-value">{r.month === 12 || r.month === 1 ? eur(r.revenue) : ""}</span>
              <span className="bar" style={{ height: `${(r.revenue / maxRevenue) * 100}%` }} />
              <span className="bar-label">mese {r.month}</span>
            </div>
          ))}
        </div>
        <div className="admin-table-wrap" style={{ marginTop: 34 }}>
          <table className="admin-table">
            <thead>
              <tr><th>Mese</th><th className="num">Ristoranti</th><th className="num">Ricavi (senza IVA)</th><th className="num">Utile del mese</th><th className="num">Utile accumulato</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.month}>
                  <td>{r.month}</td>
                  <td className="num">{n0(r.restaurants)}</td>
                  <td className="num">{eur(r.revenue)}</td>
                  <td className={`num${r.profit < 0 ? " neg" : ""}`}>{eur(r.profit)}</td>
                  <td className={`num${r.cumulative < 0 ? " neg" : ""}`}>{eur(r.cumulative)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
