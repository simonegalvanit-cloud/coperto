import type { Metadata } from "next";
import { requireAdmin, systemCounts } from "@/lib/admin";
import { databaseHealth } from "@/lib/health";

export const metadata: Metadata = { title: "Sistema" };

/** Whether everything Coperto depends on is set up. Shows only yes/no, never a key or a password. */
export default async function AdminSystem() {
  await requireAdmin();
  const [health, counts] = await Promise.all([databaseHealth(), systemCounts()]);
  const env = (name: string) => !!process.env[name];
  const checks: { label: string; ok: boolean; fix: string }[] = [
    { label: "Database raggiungibile e aggiornato", ok: health.ok, fix: health.message },
    { label: "Pagamenti (Stripe)", ok: env("STRIPE_SECRET_KEY") && env("STRIPE_WEBHOOK_SECRET"), fix: "Imposta STRIPE_SECRET_KEY e STRIPE_WEBHOOK_SECRET su Vercel: senza, nessuno può abbonarsi e i ricavi restano a zero." },
    { label: "Invio email (Resend)", ok: env("RESEND_API_KEY") && env("EMAIL_FROM"), fix: "Imposta RESEND_API_KEY ed EMAIL_FROM su Vercel: senza, nessuna email parte (conferme, promemoria, inviti, password)." },
    { label: "Indirizzo del sito (APP_URL)", ok: env("APP_URL") || env("VERCEL_PROJECT_PRODUCTION_URL"), fix: "Imposta APP_URL con l’indirizzo del sito: serve per i link nelle email." },
    { label: "Protezione del lavoro mattutino (CRON_SECRET)", ok: env("CRON_SECRET"), fix: "Imposta CRON_SECRET (un testo lungo e casuale): così solo Vercel può avviare promemoria e pulizia." },
    { label: "Email per le candidature (CAREERS_EMAIL)", ok: env("CAREERS_EMAIL"), fix: "Imposta CAREERS_EMAIL per ricevere le candidature via email; restano comunque in Candidature." },
  ];
  return (
    <>
      <h1>Sistema</h1>
      <section className="panel settings-section">
        <header><h2>Configurazione</h2></header>
        <ul className="list-plain">
          {checks.map((c) => (
            <li key={c.label} style={{ alignItems: "flex-start" }}>
              <span>
                <strong>{c.label}</strong>
                {!c.ok && <span className="small muted" style={{ display: "block" }}>{c.fix}</span>}
              </span>
              <span className={`tag ${c.ok ? "tag-ok" : "tag-alert"}`}>{c.ok ? "OK" : "Da sistemare"}</span>
            </li>
          ))}
        </ul>
        <p className="small muted">
          Server: {process.env.VERCEL_REGION ?? "locale"}
          {health.ok && "applied" in health && health.expected ? ` · aggiornamenti del database ${health.applied}/${health.expected}` : ""}
          {" · "}<a href="/api/diagnostica">Diagnostica completa</a>
        </p>
      </section>
      <div className="totals">
        <div><strong>{counts.sessions}</strong><span>accessi attivi</span></div>
        <div><strong>{counts.tablets}</strong><span>tablet della sala</span></div>
        <div><strong>{counts.resets}</strong><span>link password validi</span></div>
        <div><strong>{counts.guestLinks}</strong><span>link privacy ospiti validi</span></div>
      </div>
    </>
  );
}
