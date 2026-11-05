import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";
import { COMPANY, SUBPROCESSORS } from "@/lib/legal";

export const metadata: Metadata = { title: "Privacy" };

/** Coperto's own privacy policy: for restaurant owners, their teams and visitors of the site. */
export default function PrivacyPolicyPage() {
  return (
    <LegalPage title="Informativa sulla privacy">
      <p>
        Questa informativa spiega come {COMPANY.name} tratta i dati di chi usa Coperto per lavoro: i titolari dei ristoranti, le
        persone del loro team e chi visita il nostro sito (art. 13 del Regolamento UE 2016/679, “GDPR”).
      </p>
      <p className="panel">
        <strong>Hai prenotato in un ristorante?</strong> I tuoi dati di prenotazione li tratta il ristorante, che ne è il titolare;
        Coperto li tratta solo per suo conto. Trovi l’informativa del ristorante nel link “Informativa privacy” sotto il modulo
        di prenotazione, e dalla pagina della tua prenotazione puoi vedere, scaricare o cancellare la tua scheda.
      </p>

      <h2>Titolare del trattamento</h2>
      <p>{COMPANY.name}, P.IVA {COMPANY.vat}, {COMPANY.address}. Per qualsiasi domanda sulla privacy: {COMPANY.email}.</p>

      <h2>Quali dati trattiamo e perché</h2>
      <table>
        <thead>
          <tr><th>Dati</th><th>Perché</th><th>Base legale</th><th>Per quanto tempo</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Nome, email e password (conservata solo in forma cifrata non reversibile) di titolari e team</td>
            <td>Creare e gestire l’account, farti entrare, mandarti inviti e link per cambiare la password</td>
            <td>Contratto (art. 6.1.b)</td>
            <td>Finché l’account esiste; cancellati quando elimini l’account o il ristorante</td>
          </tr>
          <tr>
            <td>Dati del ristorante e di fatturazione</td>
            <td>Fornire il servizio, fatturare, adempiere agli obblighi fiscali</td>
            <td>Contratto e obbligo di legge (art. 6.1.b e c)</td>
            <td>Per la durata del contratto; i dati di fatturazione 10 anni, come vuole la legge</td>
          </tr>
          <tr>
            <td>Chi ha inserito una prenotazione, data e ora delle azioni principali</td>
            <td>Permettere al ristorante di sapere chi ha fatto cosa</td>
            <td>Contratto (art. 6.1.b)</td>
            <td>Come i dati della prenotazione</td>
          </tr>
          <tr>
            <td>Dati tecnici (indirizzo IP, tipo di browser, registri degli errori)</td>
            <td>Sicurezza del servizio, prevenzione di abusi, risoluzione dei guasti</td>
            <td>Legittimo interesse (art. 6.1.f)</td>
            <td>Al massimo 30 giorni</td>
          </tr>
          <tr>
            <td>Email di chi ci scrive</td>
            <td>Rispondere</td>
            <td>Richiesta dell’interessato (art. 6.1.b)</td>
            <td>Il tempo necessario a gestire la richiesta, al massimo 2 anni</td>
          </tr>
        </tbody>
      </table>
      <p>Non vendiamo i dati, non li usiamo per pubblicità e non facciamo profilazione.</p>

      <h2>A chi li affidiamo</h2>
      <p>Usiamo questi fornitori, che trattano i dati solo per nostro conto e con garanzie adeguate:</p>
      <ul>
        {SUBPROCESSORS.map((s) => (
          <li key={s.name}><strong>{s.name}</strong>: {s.what}. {s.where}.</li>
        ))}
      </ul>
      <p>Il sito carica i caratteri tipografici da Google Fonts (Google Ireland Ltd.), che riceve l’indirizzo IP del visitatore.</p>

      <h2>I tuoi diritti</h2>
      <p>
        Puoi chiederci in ogni momento di accedere ai tuoi dati, correggerli, cancellarli, limitarne il trattamento, riceverli in
        un formato leggibile (portabilità) od opporti al trattamento basato sul legittimo interesse (artt. 15–22 GDPR). Molto lo
        fai da solo nell’app: “Il mio account” per nome, password ed eliminazione; il titolare può scaricare tutti i dati del
        ristorante. Per il resto scrivici a {COMPANY.email}: rispondiamo entro un mese. Puoi anche presentare reclamo al
        Garante per la protezione dei dati personali (garanteprivacy.it).
      </p>

      <h2>Cookie</h2>
      <p>Usiamo solo un cookie tecnico per tenerti connesso. I dettagli sono nella <Link href="/cookie">Cookie policy</Link>.</p>
    </LegalPage>
  );
}
