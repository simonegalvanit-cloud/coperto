import type { Metadata } from "next";
import { ConfirmButton } from "@/components/ConfirmButton";
import { resolveGuestLink } from "@/lib/consent";
import { formatPhone } from "@/lib/contact";
import { guestData } from "@/lib/guest-data";
import { capitalize, formatDate } from "@/lib/time";
import { PublicShell } from "../../p/[slug]/PublicShell";
import { forgetMe, setMyMarketing } from "../actions";

export const metadata: Metadata = { title: "I tuoi dati", robots: { index: false } };

const STATUS: Record<string, string> = { confirmed: "Prenotata", seated: "Al tavolo", completed: "Venuto", cancelled: "Cancellata", no_show: "Non presentato" };
const SOURCE: Record<string, string> = { online: "online", staff: "dal ristorante, su tua richiesta", guest_link: "dal tuo link" };
const when = (d: Date) => new Intl.DateTimeFormat("it-IT", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Rome" }).format(d);

/** A guest's private page: everything the restaurant keeps about them, and their choices. */
export default async function GuestPrivacyPage({ params }: PageProps<"/privacy/[token]">) {
  const { token } = await params;
  const row = await resolveGuestLink(token);
  if (!row) {
    return (
      <main className="auth">
        <div className="panel stack">
          <h1>Link scaduto</h1>
          <p className="muted">Questo link non è più valido (vale 24 ore). Chiedine uno nuovo dalla pagina della tua prenotazione.</p>
        </div>
      </main>
    );
  }
  const { restaurant: r } = row;
  const { guest: g, bookings, consents } = await guestData(row.guest.id);
  const field = (label: string, value: string) => (
    <div>
      <small>{label}</small>
      <strong>{value || "—"}</strong>
    </div>
  );

  return (
    <PublicShell r={r} embed={false}>
      <div>
        <h2 style={{ fontSize: 28 }}>I tuoi dati</h2>
        <p className="muted" style={{ marginTop: 6 }}>Tutto quello che {r.name} conserva su di te. Solo tu puoi vedere questa pagina.</p>
      </div>

      <div className="ticket">
        <div className="wide">{field("Nome", g.name)}</div>
        {field("Telefono", g.phone ? formatPhone(g.phone) : "")}
        {field("Email", g.email)}
        <div className="wide">{field("Allergie", g.allergies)}</div>
        <div className="wide">{field("Note del ristorante su di te", g.notes)}</div>
        {field("Compleanno", g.birthday ? `${Number(g.birthday.slice(3))}/${Number(g.birthday.slice(0, 2))}` : "")}
        {field("Anniversario", g.anniversary ? `${Number(g.anniversary.slice(3))}/${Number(g.anniversary.slice(0, 2))}` : "")}
      </div>

      <section className="stack" style={{ gap: 8 }}>
        <h3>Le tue scelte</h3>
        <p>
          {g.profileConsentAt ? <>Hai scelto di farti ricordare il {when(g.profileConsentAt)}.</> : "Nessun consenso al profilo registrato."}
        </p>
        <form action={setMyMarketing} className="row">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="on" value={g.marketingConsentAt ? "0" : "1"} />
          <span>{g.marketingConsentAt ? "Ricevi offerte e novità." : "Non ricevi offerte."}</span>
          <button type="submit" className="btn btn-small">{g.marketingConsentAt ? "Non voglio più offerte" : "Voglio ricevere offerte"}</button>
        </form>
      </section>

      <section className="stack" style={{ gap: 8 }}>
        <h3>Le tue prenotazioni</h3>
        {bookings.length === 0 ? (
          <p className="muted">Nessuna.</p>
        ) : (
          <ul className="list-plain">
            {bookings.map((b, i) => (
              <li key={i}>
                <span>
                  <strong>{capitalize(formatDate(b.date, { year: true }))}</strong> {b.time} · {b.partySize} {b.partySize === 1 ? "persona" : "persone"}
                  {b.notes && <span className="small muted" style={{ display: "block" }}>{b.notes}</span>}
                </span>
                <span className="tag">{STATUS[b.status]}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="stack" style={{ gap: 8 }}>
        <h3>Storico dei consensi</h3>
        <ul className="list-plain">
          {consents.map((c) => (
            <li key={c.id}>
              <span className="small">
                <strong>{when(c.createdAt)}</strong> · {c.action === "granted" ? "dato" : "ritirato"} {SOURCE[c.source]}
                <span className="muted" style={{ display: "block" }}>“{c.wording}”</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="stack" style={{ gap: 10 }}>
        <div>
          <a className="btn" href={`/privacy/${token}/download`} download>
            Scarica i miei dati
          </a>
        </div>
        <form action={forgetMe} className="stack" style={{ gap: 6 }}>
          <input type="hidden" name="token" value={token} />
          <p className="small muted">
            Cancellando la scheda ritiri il consenso: {r.name} non si ricorderà più di te. Le prenotazioni future restano valide.
          </p>
          <div>
            <ConfirmButton className="btn btn-danger" question={`Cancellare la tua scheda da ${r.name}? Non si può annullare.`} confirmLabel="Sì, cancellami">
              Cancella la mia scheda
            </ConfirmButton>
          </div>
        </form>
      </section>
    </PublicShell>
  );
}
