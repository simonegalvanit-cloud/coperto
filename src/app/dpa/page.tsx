import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";
import { RETENTION } from "@/lib/consent-wording";
import { COMPANY, SUBPROCESSORS } from "@/lib/legal";

export const metadata: Metadata = { title: "Accordo sul trattamento dei dati" };

/** The data processing agreement (GDPR art. 28) between each restaurant and Coperto. */
export default function DpaPage() {
  return (
    <LegalPage title="Accordo sul trattamento dei dati (DPA)">
      <p>
        Questo accordo, ai sensi dell’art. 28 del Regolamento UE 2016/679 (“GDPR”), è parte dei{" "}
        <Link href="/termini">Termini di servizio</Link> tra il ristorante che usa Coperto (“Titolare”) e {COMPANY.name} (“Responsabile”).
        Si accetta registrando il ristorante, o con il pulsante “Ho letto e accetto” nell’app, e dura quanto il contratto.
      </p>

      <h2>1. Oggetto</h2>
      <table>
        <tbody>
          <tr><th>Finalità</th><td>Fornire al Titolare il servizio Coperto: prenotazioni online e dal ristorante, gestione della sala e della lista d’attesa, schede degli ospiti, email di conferma, promemoria e link privati per gli ospiti.</td></tr>
          <tr><th>Interessati</th><td>Clienti e potenziali clienti del ristorante (ospiti); persone del team del ristorante.</td></tr>
          <tr><th>Dati</th><td>Nome, telefono, email, data e ora delle prenotazioni, numero di persone, note, storico delle visite, preferenze, ricorrenze, consensi. Le allergie e intolleranze sono <strong>dati sulla salute</strong> (art. 9 GDPR) e si conservano solo nelle schede degli ospiti che hanno dato il consenso esplicito.</td></tr>
          <tr><th>Durata</th><td>Per tutta la durata del contratto, salvo la cancellazione automatica: prenotazioni senza scheda anonimizzate dopo {RETENTION.bookingMonths} mesi, schede senza visite da {RETENTION.profileMonths} mesi cancellate.</td></tr>
        </tbody>
      </table>

      <h2>2. Obblighi del Responsabile</h2>
      <ol>
        <li>Tratta i dati solo su istruzione documentata del Titolare: queste sono date dalle impostazioni e dall’uso del servizio. Se ritiene che un’istruzione violi il GDPR, lo segnala.</li>
        <li>Garantisce che chi tratta i dati per suo conto sia vincolato alla riservatezza.</li>
        <li>
          Adotta misure di sicurezza adeguate (art. 32), tra cui: connessioni cifrate (HTTPS); password conservate solo come
          hash; link privati e sessioni conservati solo come impronta crittografica; separazione dei dati di ogni ristorante;
          accessi del team personali e basati su ruoli; copie di sicurezza cifrate; accesso ai sistemi limitato al personale
          che ne ha bisogno.
        </li>
        <li>Aiuta il Titolare a rispondere alle richieste degli interessati: l’app permette di vedere, correggere, esportare e cancellare le schede, e agli ospiti di farlo da soli tramite un link privato.</li>
        <li>Notifica al Titolare ogni violazione dei dati personali senza ingiustificato ritardo e comunque entro 48 ore da quando ne viene a conoscenza, con le informazioni utili per la notifica al Garante.</li>
        <li>Aiuta il Titolare, se richiesto, nella valutazione d’impatto e nelle consultazioni con il Garante.</li>
        <li>Alla fine del contratto, o quando il Titolare elimina il ristorante, cancella i dati subito; le copie di sicurezza si cancellano entro 30 giorni. Prima il Titolare può scaricarli tutti dall’app.</li>
        <li>Mette a disposizione le informazioni necessarie a dimostrare il rispetto di questo accordo e consente verifiche, con un preavviso ragionevole e a spese del Titolare, senza compromettere la sicurezza degli altri clienti.</li>
      </ol>

      <h2>3. Sub-responsabili</h2>
      <p>
        Il Titolare autorizza in via generale il Responsabile ad avvalersi di altri fornitori (sub-responsabili), vincolati agli
        stessi obblighi di protezione. Quelli attuali sono:
      </p>
      <table>
        <thead>
          <tr><th>Fornitore</th><th>Attività</th><th>Luogo e garanzie</th></tr>
        </thead>
        <tbody>
          {SUBPROCESSORS.map((s) => (
            <tr key={s.name}><td>{s.name}</td><td>{s.what}</td><td>{s.where}</td></tr>
          ))}
        </tbody>
      </table>
      <p>
        Il Responsabile avvisa il Titolare almeno 30 giorni prima di aggiungere o sostituire un sub-responsabile; il Titolare
        può opporsi per motivi legati alla protezione dei dati e, se non si trova una soluzione, disdire senza penali.
      </p>

      <h2>4. Trasferimenti fuori dall’UE</h2>
      <p>
        I dati possono essere trattati fuori dallo Spazio economico europeo solo con le garanzie del Capo V del GDPR, come le
        Clausole contrattuali tipo della Commissione europea o il Data Privacy Framework UE–USA.
      </p>

      <h2>5. Obblighi del Titolare</h2>
      <p>
        Il Titolare è responsabile della liceità dei dati che inserisce e della propria informativa agli ospiti (Coperto ne
        prepara una per ogni ristorante, che il Titolare deve verificare), e di usare i consensi raccolti solo per le finalità
        indicate.
      </p>

      <h2>Contatti</h2>
      <p>{COMPANY.name}, {COMPANY.address} · {COMPANY.email} · PEC {COMPANY.pec}</p>
    </LegalPage>
  );
}
