import type { Metadata } from "next";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { CopyButton } from "@/components/CopyButton";
import { requireAccount } from "@/lib/auth";
import { SERVICE_NAMES } from "@/lib/hours";
import { getClosures, getServiceHours } from "@/lib/restaurant";
import { capitalize, formatDate, nowIn, WEEKDAYS } from "@/lib/time";
import { appUrl } from "@/lib/url";
import { addClosure, removeClosure, saveDetails, saveHours, saveRules } from "./actions";

export const metadata: Metadata = { title: "Impostazioni" };

export default async function SettingsPage({ searchParams }: PageProps<"/app/impostazioni">) {
  const { restaurant: r } = await requireAccount();
  const [hours, closures, base, { benvenuto }] = await Promise.all([
    getServiceHours(r.id),
    getClosures(r.id),
    appUrl(),
    searchParams,
  ]);
  const today = nowIn(r.timezone).date;
  const upcoming = closures.filter((c) => c.date >= today);
  const link = `${base}/p/${r.slug}`;
  const embed = `<iframe src="${link}?embed=1" title="Prenota da ${r.name.replace(/"/g, "&quot;")}" style="width:100%;max-width:640px;height:760px;border:0"></iframe>`;

  return (
    <>
      {benvenuto && (
        <div className="panel drawing stack">
          <h1>Benvenuto su Coperto.</h1>
          <p>
            Abbiamo preparato una settimana tipo: chiuso il lunedì, pranzo e cena gli altri giorni. Controlla orari e posti
            qui sotto, poi condividi il tuo link di prenotazione.
          </p>
        </div>
      )}
      {!benvenuto && <h1>Impostazioni</h1>}

      <section className="panel settings-section">
        <header>
          <h2>Il tuo link di prenotazione</h2>
          <p className="muted">Mettilo nella scheda Google del ristorante, nella bio di Instagram e su WhatsApp.</p>
        </header>
        {!r.bookingOpen && <p className="form-error">Le prenotazioni online sono sospese. Riattivale nelle regole qui sotto.</p>}
        <div className="row">
          <a href={link} target="_blank" rel="noreferrer" style={{ fontWeight: 700, overflowWrap: "anywhere" }}>{link}</a>
          <CopyButton text={link} label="Copia il link" />
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <h3>Sul tuo sito</h3>
          <p className="small muted">Incolla questo codice nella pagina dove vuoi il modulo di prenotazione.</p>
          <code className="codebox">{embed}</code>
          <div><CopyButton text={embed} label="Copia il codice" /></div>
        </div>
      </section>

      <section className="panel settings-section">
        <header>
          <h2>Orari</h2>
          <p className="muted">Gli orari sono di arrivo: “ultimo arrivo” è l’ultimo orario prenotabile online.</p>
        </header>
        <ActionForm action={saveHours} submitLabel="Salva gli orari">
          <table className="hours">
            <thead>
              <tr>
                <th scope="col">Giorno</th>
                {SERVICE_NAMES.map((n) => <th scope="col" key={n}>{n}: primo e ultimo arrivo</th>)}
              </tr>
            </thead>
            <tbody>
              {WEEKDAYS.map((day, w) => (
                <tr key={day}>
                  <th scope="row">{day}</th>
                  {SERVICE_NAMES.map((name, i) => {
                    const h = hours.find((x) => x.weekday === w && x.name === name);
                    const fallback = i === 0 ? ["12:30", "14:00"] : ["19:30", "22:00"];
                    return (
                      <td key={name}>
                        <div className="slot">
                          <label className="check">
                            <input type="checkbox" name={`d${w}_${i}_on`} defaultChecked={!!h} /> {name}
                          </label>
                          <input className="input" type="time" step={900} name={`d${w}_${i}_start`} defaultValue={h?.startTime ?? fallback[0]} aria-label={`${day}, ${name}, primo arrivo`} />
                          –
                          <input className="input" type="time" step={900} name={`d${w}_${i}_end`} defaultValue={h?.endTime ?? fallback[1]} aria-label={`${day}, ${name}, ultimo arrivo`} />
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </ActionForm>
      </section>

      <section className="panel settings-section">
        <header>
          <h2>Regole delle prenotazioni online</h2>
          <p className="muted">Le prenotazioni che inserisci tu dalla sala non hanno limiti: decidi tu.</p>
        </header>
        <ActionForm action={saveRules} submitLabel="Salva le regole">
          <label className="check">
            <input type="checkbox" name="bookingOpen" defaultChecked={r.bookingOpen} /> Accetta prenotazioni online
          </label>
          <div className="grid-3">
            <label className="field">
              Posti in sala <span className="hint">Conta finché non disegni il locale: poi decidono i tavoli</span>
              <input className="input" type="number" name="capacity" min={1} defaultValue={r.capacity} required />
            </label>
            <label className="field">
              Durata di un tavolo <span className="hint">In minuti</span>
              <input className="input" type="number" name="durationMinutes" min={30} max={360} step={15} defaultValue={r.durationMinutes} required />
            </label>
            <label className="field">
              Gruppo più grande online <span className="hint">Oltre, ti chiamano</span>
              <input className="input" type="number" name="maxPartySize" min={1} defaultValue={r.maxPartySize} required />
            </label>
            <label className="field">
              Orari ogni
              <select className="input" name="slotMinutes" defaultValue={r.slotMinutes}>
                <option value={15}>15 minuti</option>
                <option value={30}>30 minuti</option>
                <option value={60}>60 minuti</option>
              </select>
            </label>
            <label className="field">
              Arrivi massimi per orario <span className="hint">Coperti; vuoto = nessun limite</span>
              <input className="input" type="number" name="maxCoversPerSlot" min={1} defaultValue={r.maxCoversPerSlot ?? ""} />
            </label>
            <label className="field">
              Preavviso minimo <span className="hint">In minuti</span>
              <input className="input" type="number" name="minNoticeMinutes" min={0} step={15} defaultValue={r.minNoticeMinutes} required />
            </label>
            <label className="field">
              Prenotabile fino a <span className="hint">Giorni in anticipo</span>
              <input className="input" type="number" name="maxDaysAhead" min={1} max={365} defaultValue={r.maxDaysAhead} required />
            </label>
          </div>
        </ActionForm>
      </section>

      <section className="panel settings-section">
        <header>
          <h2>Chiusure</h2>
          <p className="muted">Ferie, festivi, eventi privati: in quei giorni non si prenota online.</p>
        </header>
        {upcoming.length > 0 && (
          <ul className="list-plain">
            {upcoming.map((c) => (
              <li key={c.id}>
                <span>
                  <strong>{capitalize(formatDate(c.date, { year: true }))}</strong>
                  {c.note && <span className="muted"> · {c.note}</span>}
                </span>
                <form action={removeClosure}>
                  <input type="hidden" name="id" value={c.id} />
                  <ConfirmButton className="btn btn-small btn-quiet" question="Riaprire le prenotazioni per questa data?">Rimuovi</ConfirmButton>
                </form>
              </li>
            ))}
          </ul>
        )}
        <ActionForm action={addClosure} submitLabel="Aggiungi chiusura" className="row">
          <label className="field">
            Data
            <input className="input" type="date" name="date" min={today} required />
          </label>
          <label className="field" style={{ flex: "1 1 220px" }}>
            Motivo <span className="hint">Facoltativo</span>
            <input className="input" name="note" placeholder="Es. ferie, evento privato" />
          </label>
        </ActionForm>
      </section>

      <section className="panel settings-section">
        <header>
          <h2>Il ristorante</h2>
          <p className="muted">Nome, indirizzo e telefono compaiono nella pagina di prenotazione e nelle email agli ospiti.</p>
        </header>
        <ActionForm action={saveDetails} submitLabel="Salva">
          <div className="grid-2">
            <label className="field">
              Nome
              <input className="input" name="name" defaultValue={r.name} required />
            </label>
            <label className="field">
              Telefono
              <input className="input" type="tel" name="phone" defaultValue={r.phone} />
            </label>
            <label className="field">
              Indirizzo
              <input className="input" name="address" defaultValue={r.address} />
            </label>
            <label className="field">
              Città
              <input className="input" name="city" defaultValue={r.city} />
            </label>
          </div>
          <label className="field">
            Email per le notifiche <span className="hint">Ti scriviamo qui per ogni nuova prenotazione o cancellazione</span>
            <input className="input" type="email" name="notifyEmail" defaultValue={r.notifyEmail} required />
          </label>
        </ActionForm>
      </section>
    </>
  );
}
