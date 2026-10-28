import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import type { Reservation } from "@/db/schema";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { requireAccount } from "@/lib/auth";
import { formatPhone } from "@/lib/contact";
import { guestCounts } from "@/lib/guests";
import { capitalize, formatDate, nowIn } from "@/lib/time";
import { deleteGuest, recordConsent, saveGuest, setGuestMarketing } from "../actions";

export const metadata: Metadata = { title: "Ospite", robots: { index: false } };

const MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const STATUS: Record<Reservation["status"], string> = {
  confirmed: "Prenotata",
  seated: "Seduti",
  completed: "Venuti",
  cancelled: "Cancellata",
  no_show: "No-show",
};

const SOURCE: Record<string, string> = { online: "online", staff: "registrato da voi", guest_link: "dall’ospite, dal suo link" };
const when = (d: Date) => new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeZone: "Europe/Rome" }).format(d);

export default async function GuestPage({ params }: PageProps<"/app/ospiti/[id]">) {
  const { restaurant } = await requireAccount();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const db = await getDb();
  const [[guest], history, counts, consents] = await Promise.all([
    db.select().from(schema.guests).where(and(eq(schema.guests.id, id.data), eq(schema.guests.restaurantId, restaurant.id))),
    db
      .select()
      .from(schema.reservations)
      .where(and(eq(schema.reservations.guestId, id.data), eq(schema.reservations.restaurantId, restaurant.id)))
      .orderBy(desc(schema.reservations.date), desc(schema.reservations.time))
      .limit(200),
    guestCounts(restaurant.id, [id.data]),
    db.select().from(schema.consentLog).where(eq(schema.consentLog.guestId, id.data)).orderBy(asc(schema.consentLog.createdAt)),
  ]);
  if (!guest) notFound();
  const c = counts.get(guest.id) ?? { visits: 0, noShows: 0, cancellations: 0, lastVisit: null };
  const today = nowIn(restaurant.timezone).date;
  const upcoming = history.filter((b) => b.date >= today && b.status === "confirmed").reverse();
  const past = history.filter((b) => !upcoming.includes(b));
  const avgParty = past.length ? Math.round(past.reduce((n, b) => n + b.partySize, 0) / past.length) : null;

  return (
    <>
      <div>
        <Link href="/app/ospiti">‹ Ospiti</Link>
        <h1 style={{ marginTop: 8 }}>
          {guest.name} {guest.vip && <span className="tag tag-ok" style={{ verticalAlign: "middle" }}>VIP</span>}
        </h1>
        <p className="muted">{[guest.phone && formatPhone(guest.phone), guest.email].filter(Boolean).join(" · ")}</p>
      </div>

      {!guest.profileConsentAt && (
        <form action={recordConsent} className="panel stack" style={{ gap: 8 }}>
          <input type="hidden" name="id" value={guest.id} />
          <p>
            <strong>Scheda spenta: manca il consenso.</strong> È stata creata prima che Coperto lo chiedesse, quindi non
            compare sulle prenotazioni. Chiedi all’ospite se vuole essere ricordato (visite, preferenze e allergie). Se dice
            sì, registralo; se dice no, elimina la scheda.
          </p>
          <div>
            <ConfirmButton className="btn btn-small btn-fill" question={`${guest.name} ti ha detto che vuole farsi ricordare?`} confirmLabel="Sì, registra">
              L’ospite ha detto sì: registra il consenso
            </ConfirmButton>
          </div>
        </form>
      )}

      <div className="totals">
        <div><strong>{c.visits}</strong><span>visite</span></div>
        <div><strong>{c.noShows}</strong><span>no-show</span></div>
        <div><strong>{c.cancellations}</strong><span>cancellazioni</span></div>
        <div><strong>{avgParty ?? "–"}</strong><span>persone di solito</span></div>
      </div>

      <div className="floor" style={{ gridTemplateColumns: "minmax(0, 1fr) 360px" }}>
        <section className="stack">
          {upcoming.length > 0 && (
            <div className="stack" style={{ gap: 8 }}>
              <h2>In arrivo</h2>
              <HistoryList items={upcoming} />
            </div>
          )}
          <div className="stack" style={{ gap: 8 }}>
            <h2>Storico</h2>
            {past.length ? <HistoryList items={past} /> : <p className="muted">Ancora nessuna visita.</p>}
          </div>
        </section>

        <aside className="panel stack">
          <h2>Scheda</h2>
          <ActionForm action={saveGuest} submitLabel="Salva">
            <input type="hidden" name="id" value={guest.id} />
            <label className="field">
              Nome
              <input className="input" name="name" defaultValue={guest.name} required />
            </label>
            <label className="field">
              Telefono
              <input className="input" type="tel" name="phone" defaultValue={guest.phone ? formatPhone(guest.phone) : ""} />
            </label>
            <label className="field">
              Email
              <input className="input" type="email" name="email" defaultValue={guest.email} />
            </label>
            <label className="field">
              Allergie e intolleranze <span className="hint">Compaiono in rosso su ogni prenotazione</span>
              <input className="input" name="allergies" defaultValue={guest.allergies} placeholder="Es. celiachia, frutta a guscio" />
            </label>
            <label className="field">
              Note sull’ospite <span className="hint">Lo seguono a ogni visita</span>
              <textarea className="input" name="notes" defaultValue={guest.notes} placeholder="Es. preferisce il tavolo alla finestra, beve Brunello" />
            </label>
            <MonthDay label="Compleanno" name="birthday" value={guest.birthday} />
            <MonthDay label="Anniversario" name="anniversary" value={guest.anniversary} />
            <label className="check">
              <input type="checkbox" name="vip" defaultChecked={guest.vip} /> Cliente VIP
            </label>
          </ActionForm>
          <div className="stack" style={{ gap: 8, borderTop: "1.5px solid var(--ink)", paddingTop: 14 }}>
            <h3>Consensi</h3>
            <p className="small">
              {guest.profileConsentAt
                ? `Scheda: sì, dal ${when(guest.profileConsentAt)} (${SOURCE[guest.profileConsentSource ?? "staff"]}).`
                : "Scheda: nessun consenso."}{" "}
              Allergie e note si conservano solo con questo consenso.
            </p>
            {guest.profileConsentAt && (
              <form action={setGuestMarketing} className="row" style={{ gap: 8 }}>
                <input type="hidden" name="id" value={guest.id} />
                <input type="hidden" name="on" value={guest.marketingConsentAt ? "0" : "1"} />
                <span className="small">Offerte: {guest.marketingConsentAt ? `sì, dal ${when(guest.marketingConsentAt)}` : "no"}</span>
                <button type="submit" className="btn btn-small">{guest.marketingConsentAt ? "L’ospite non le vuole più" : "L’ospite le vuole"}</button>
              </form>
            )}
            {consents.length > 0 && (
              <details>
                <summary className="small">Storico ({consents.length})</summary>
                <ul className="list-plain">
                  {consents.map((x) => (
                    <li key={x.id} className="small">
                      <span>
                        {when(x.createdAt)} · {x.kind === "profile" ? "scheda" : "offerte"} {x.action === "granted" ? "sì" : "no"} ({SOURCE[x.source]})
                        <span className="muted" style={{ display: "block" }}>“{x.wording}”</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
          <form action={deleteGuest} className="stack" style={{ gap: 6, borderTop: "1.5px solid var(--ink)", paddingTop: 14 }}>
            <input type="hidden" name="id" value={guest.id} />
            <p className="small muted">Se l’ospite chiede di essere dimenticato (GDPR), elimina la scheda: le sue prenotazioni restano solo come numeri, senza nome né contatti.</p>
            <div>
              <ConfirmButton className="btn btn-small btn-danger" question={`Eliminare ${guest.name} e i suoi dati personali? Non si può annullare.`} confirmLabel="Elimina">
                Elimina ospite e dati
              </ConfirmButton>
            </div>
          </form>
        </aside>
      </div>
    </>
  );
}

function HistoryList({ items }: { items: Reservation[] }) {
  return (
    <ul className="list-plain">
      {items.map((b) => (
        <li key={b.id}>
          <span>
            <Link href={`/app/prenotazione/${b.id}`}>
              <strong>{capitalize(formatDate(b.date, { year: true }))}</strong> {b.time}
            </Link>{" "}
            <span className="muted">· {b.partySize} {b.partySize === 1 ? "persona" : "persone"}</span>
            {b.notes && <span className="small muted" style={{ display: "block" }}>{b.notes}</span>}
          </span>
          <span className={`tag${b.status === "no_show" || b.status === "cancelled" ? " tag-alert" : ""}`}>{STATUS[b.status]}</span>
        </li>
      ))}
    </ul>
  );
}

function MonthDay({ label, name, value }: { label: string; name: string; value: string }) {
  const [month, day] = value ? value.split("-").map(Number) : [0, 0];
  return (
    <div className="field">
      {label}
      <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
        <select className="input" name={`${name}Day`} defaultValue={day || ""} aria-label={`${label}: giorno`} style={{ width: 90 }}>
          <option value="">–</option>
          {Array.from({ length: 31 }, (_, i) => (
            <option key={i + 1} value={i + 1}>{i + 1}</option>
          ))}
        </select>
        <select className="input" name={`${name}Month`} defaultValue={month || ""} aria-label={`${label}: mese`}>
          <option value="">–</option>
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>{m}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
