import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";
import { COMPANY } from "@/lib/legal";
import { RETENTION } from "@/lib/consent-wording";

export const metadata: Metadata = { title: "Termini di servizio" };

export default function TermsPage() {
  return (
    <LegalPage title="Termini di servizio">
      <p>
        Questi termini regolano l’uso di Coperto, il servizio online per gestire prenotazioni, sala e ospiti dei ristoranti,
        fornito da {COMPANY.name}, P.IVA {COMPANY.vat}, con sede in {COMPANY.address} (“Coperto”, “noi”). Li accetta chi registra
        un ristorante (“Cliente”, “tu”). Coperto è un servizio per professionisti: non si rivolge a consumatori.
      </p>

      <h2>1. Il servizio</h2>
      <p>
        Coperto ti offre una pagina di prenotazione online per il tuo ristorante, la gestione delle prenotazioni, della pianta
        della sala e della lista d’attesa, le schede degli ospiti che acconsentono a essere ricordati, l’invio di email di
        conferma e promemoria, e gli strumenti descritti sul sito per il piano scelto. Le funzioni possono evolvere nel tempo;
        se ne togliamo una sostanziale te lo diciamo con almeno 30 giorni di anticipo.
      </p>

      <h2>2. Account e team</h2>
      <ul>
        <li>Chi registra il ristorante ne è il <strong>titolare</strong> sul servizio: risponde dell’account, dell’abbonamento e di chi invita nel team.</li>
        <li>Ogni persona del team entra con le proprie credenziali, che non deve condividere. Sei responsabile di ciò che fa il tuo team con Coperto, e di togliere l’accesso a chi non lavora più con te.</li>
        <li>Le informazioni che inserisci (nome del ristorante, orari, contatti) devono essere vere e aggiornate.</li>
        <li>Se sospetti un accesso non autorizzato, cambia la password e scrivici subito.</li>
      </ul>

      <h2>3. Prova, prezzi e pagamento</h2>
      <ul>
        <li>I primi 14 giorni sono gratuiti e non serve una carta.</li>
        <li>
          Dopo la prova il servizio costa il canone mensile del piano scelto, come indicato sul sito al momento dell’acquisto
          (Banco 19,99 €, Sala 39,99 € al mese; Gruppo su preventivo), più IVA se dovuta. Non applichiamo commissioni sulle
          prenotazioni o sui coperti.
        </li>
        <li>Il canone si paga in anticipo ogni mese, con i metodi di pagamento offerti. Ricevi la fattura elettronica.</li>
        <li>Se un pagamento non va a buon fine, dopo un avviso e 14 giorni possiamo sospendere il servizio finché non è saldato. I dati restano al sicuro durante la sospensione.</li>
        <li>Possiamo cambiare i prezzi avvisandoti almeno 30 giorni prima: il nuovo prezzo vale dal rinnovo successivo e puoi disdire prima che si applichi.</li>
      </ul>

      <h2>4. Durata e disdetta</h2>
      <p>
        L’abbonamento si rinnova di mese in mese. Puoi disdire quando vuoi: il servizio resta attivo fino alla fine del mese già
        pagato, senza penali e senza rimborsi per il periodo in corso. Possiamo chiudere un account con 30 giorni di preavviso,
        o subito se i presenti termini vengono violati in modo grave (per esempio uso illecito o mancato pagamento dopo la
        sospensione).
      </p>

      <h2>5. I tuoi dati e quelli dei tuoi ospiti</h2>
      <ul>
        <li>I dati che inserisci o che i tuoi ospiti lasciano prenotando sono <strong>tuoi</strong>. Puoi scaricarli in qualsiasi momento (ospiti in CSV, tutto il ristorante in un file) e portarli altrove.</li>
        <li>
          Per i dati degli ospiti tu sei il titolare del trattamento e Coperto è il responsabile del trattamento: li trattiamo
          solo per fornirti il servizio, secondo l’<Link href="/dpa">Accordo sul trattamento dei dati</Link>, che fa parte di questi termini.
        </li>
        <li>Tu ti impegni a usare i dati degli ospiti nel rispetto del GDPR: per esempio a mandare offerte solo a chi le ha chieste, e a rispondere alle loro richieste di accesso o cancellazione (Coperto ti dà gli strumenti per farlo).</li>
        <li>Per impostazione, le prenotazioni senza scheda ospite vengono anonimizzate dopo {RETENTION.bookingMonths} mesi e le schede senza visite da {RETENTION.profileMonths} mesi vengono cancellate.</li>
        <li>Se elimini il ristorante, cancelliamo subito tutti i dati; le copie di sicurezza si cancellano da sole entro 30 giorni.</li>
      </ul>

      <h2>6. Uso corretto</h2>
      <p>Non puoi usare Coperto per attività illecite, per inviare comunicazioni non richieste, per raccogliere dati senza una base legale, né tentare di accedere ai dati di altri ristoranti o di compromettere il servizio.</p>

      <h2>7. Disponibilità</h2>
      <p>
        Facciamo il possibile perché Coperto sia sempre disponibile e sicuro, ma non possiamo garantire un servizio senza
        interruzioni: possono capitare manutenzioni (che cerchiamo di fare fuori dagli orari di servizio) e guasti di fornitori
        esterni. Ti consigliamo di non dipendere solo da Coperto per le prenotazioni dello stesso giorno in caso di problemi.
      </p>

      <h2>8. Responsabilità</h2>
      <p>
        Nei limiti consentiti dalla legge, la responsabilità complessiva di Coperto verso di te è limitata a quanto hai pagato nei
        12 mesi precedenti all’evento, e non copre danni indiretti come mancati guadagni, salvo dolo o colpa grave. Non
        rispondiamo del comportamento degli ospiti (per esempio mancate presentazioni).
      </p>

      <h2>9. Modifiche ai termini</h2>
      <p>
        Se cambiamo questi termini o l’accordo sul trattamento dei dati in modo sostanziale te lo diciamo nell’app e per email
        almeno 30 giorni prima. Se non sei d’accordo puoi disdire prima che le modifiche si applichino.
      </p>

      <h2>10. Legge e foro</h2>
      <p>
        Questi termini sono regolati dalla legge italiana. Per ogni controversia è competente in via esclusiva il foro della sede
        legale di {COMPANY.name}.
      </p>

      <h2>Contatti</h2>
      <p>{COMPANY.name}, {COMPANY.address} · {COMPANY.email} · PEC {COMPANY.pec}</p>
    </LegalPage>
  );
}
