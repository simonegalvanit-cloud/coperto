import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { COMPANY } from "@/lib/legal";

export const metadata: Metadata = { title: "Cookie" };

export default function CookiePage() {
  return (
    <LegalPage title="Cookie policy">
      <p>
        Coperto usa un solo cookie, ed è tecnico: senza non potresti restare connesso. Non usiamo cookie di profilazione, di
        pubblicità né di statistica di terze parti, per questo non ti chiediamo il consenso (art. 122 del Codice privacy e linee
        guida del Garante del 10 giugno 2021).
      </p>
      <table>
        <thead>
          <tr><th>Nome</th><th>A cosa serve</th><th>Durata</th><th>Chi lo usa</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><code>coperto_session</code></td>
            <td>Ti tiene connesso all’area del ristorante dopo l’accesso. Contiene solo un codice casuale.</td>
            <td>30 giorni, o finché esci</td>
            <td>Solo chi accede all’area del ristorante</td>
          </tr>
        </tbody>
      </table>
      <p>
        La pagina di prenotazione per gli ospiti non usa cookie.
      </p>
      <p>
        Il nostro sito carica i caratteri tipografici da Google Fonts: Google riceve l’indirizzo IP del visitatore ma non
        imposta cookie. Puoi cancellare i cookie dalle impostazioni del tuo browser in qualsiasi momento.
      </p>
      <p>Domande: {COMPANY.email}.</p>
    </LegalPage>
  );
}
