import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { logAdmin, requireAdmin, restaurantDetail } from "@/lib/admin";
import { ROLE_LABEL } from "@/lib/roles";
import { capitalize, formatDate, nowIn, WEEKDAYS } from "@/lib/time";
import { appUrl } from "@/lib/url";

export const metadata: Metadata = { title: "Ristorante" };

const when = (d: Date | null) => (d ? new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Rome" }).format(d) : "mai");
const STATUS: Record<string, string> = { confirmed: "Prenotata", seated: "Al tavolo", completed: "Venuti", cancelled: "Cancellata", no_show: "No-show" };
const SOURCE: Record<string, string> = { online: "online", phone: "dal ristorante", walk_in: "senza prenotazione" };

/** One restaurant, read-only, for support. Opening it is recorded in the admin log. */
export default async function AdminRestaurant({ params }: PageProps<"/admin/ristoranti/[id]">) {
  const admin = await requireAdmin();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const [d, base] = await Promise.all([restaurantDetail(id.data, nowIn("Europe/Rome").date), appUrl()]);
  if (!d) notFound();
  const r = d.restaurant;
  await logAdmin(admin, "Ha aperto il ristorante", r.name);
  const c = d.counts;
  const field = (label: string, value: React.ReactNode) => (
    <div>
      <small>{label}</small>
      <strong>{value || "—"}</strong>
    </div>
  );

  return (
    <>
      <div>
        <Link href="/admin/ristoranti">‹ Ristoranti</Link>
        <h1 style={{ marginTop: 8 }}>{r.name}</h1>
        <p className="muted">
          {[r.address, r.city, r.phone].filter(Boolean).join(" · ") || "Nessun indirizzo"} · iscritto il {when(r.createdAt)}
        </p>
        <p className="small muted">Sola lettura. La tua visita è registrata nel registro admin.</p>
      </div>

      <div className="totals">
        <div><strong>{c.total}</strong><span>prenotazioni in tutto</span></div>
        <div><strong>{c.last30}</strong><span>create negli ultimi 30 giorni ({c.online30} online)</span></div>
        <div><strong>{c.upcoming}</strong><span>in arrivo</span></div>
        <div><strong>{c.no_shows}</strong><span>no-show</span></div>
        <div><strong>{c.guests}</strong><span>schede ospite{c.legacy_guests ? ` (+${c.legacy_guests} senza consenso)` : ""}</span></div>
      </div>

      <div className="ticket">
        {field("Titolare", <>{d.ownerName} · <a href={`mailto:${d.ownerEmail}`}>{d.ownerEmail}</a></>)}
        {field("Email per le notifiche", r.notifyEmail)}
        {field("Pagina di prenotazione", <a href={`${base}/p/${r.slug}`} target="_blank" rel="noreferrer">/p/{r.slug}</a>)}
        {field("Prenotazioni online", r.bookingOpen ? "attive" : "sospese")}
        {field("Termini e accordo dati", r.termsVersion ? `accettati il ${when(r.termsAcceptedAt)} (versione ${r.termsVersion})` : "non ancora accettati")}
        {field("Promemoria il giorno prima", r.remindersEnabled ? "attivi" : "spenti")}
        {field("Regole online", `fino a ${r.maxPartySize} persone · ${r.durationMinutes} min a tavolo · preavviso ${r.minNoticeMinutes} min · fino a ${r.maxDaysAhead} giorni`)}
        {field("Sala", c.tables ? `${c.tables} tavoli su ${c.floors} ${c.floors === 1 ? "piano" : "piani"}` : `non disegnata (${r.capacity} posti)`)}
      </div>

      <section className="panel settings-section">
        <header><h2>Team</h2></header>
        <ul className="list-plain">
          {d.team.map((m, i) => (
            <li key={i}>
              <span>
                <strong>{m.name}</strong>
                <span className="small muted" style={{ display: "block" }}>{m.email ?? "solo PIN"} · dal {when(m.since)}{m.hasPin ? " · ha un PIN" : ""}</span>
              </span>
              <span className="tag">{ROLE_LABEL[m.role]}</span>
            </li>
          ))}
          {d.invites.map((iv) => (
            <li key={iv.email}>
              <span className="small">{iv.email} <span className="muted">· invitato come {ROLE_LABEL[iv.role]}, scade il {when(iv.expiresAt)}</span></span>
              <span className="tag">invito</span>
            </li>
          ))}
        </ul>
        {d.devices.length > 0 && (
          <p className="small muted">
            Tablet della sala: {d.devices.map((dv) => `${dv.name} (ultimo uso ${when(dv.lastUsedAt)})`).join(", ")}
          </p>
        )}
      </section>

      <section className="panel settings-section">
        <header><h2>Orari</h2></header>
        {d.hours.length === 0 ? (
          <p className="muted">Nessun orario impostato: online non si può prenotare.</p>
        ) : (
          <ul className="list-plain small">
            {WEEKDAYS.map((w, i) => {
              const today = d.hours.filter((h) => h.weekday === i);
              return (
                <li key={w}>
                  <span>{w}</span>
                  <span>{today.length ? today.map((h) => `${h.name} ${h.startTime}–${h.endTime}`).join(" · ") : <span className="muted">chiuso</span>}</span>
                </li>
              );
            })}
          </ul>
        )}
        {c.closures > 0 && <p className="small muted">{c.closures} chiusure in programma.</p>}
      </section>

      <section className="panel settings-section">
        <header><h2>Ultime prenotazioni create</h2></header>
        {d.recent.length === 0 ? (
          <p className="muted">Nessuna prenotazione.</p>
        ) : (
          <ul className="list-plain small">
            {d.recent.map((b, i) => (
              <li key={i}>
                <span>
                  <strong>{capitalize(formatDate(b.date, { year: true }))}</strong> {b.time} · {b.partySize} pers. · {b.guestName}
                  <span className="muted" style={{ display: "block" }}>{SOURCE[b.source]}, creata il {when(b.createdAt)}</span>
                </span>
                <span className={`tag${b.status === "cancelled" || b.status === "no_show" ? " tag-alert" : ""}`}>{STATUS[b.status]}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
