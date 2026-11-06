import type { Metadata } from "next";
import Link from "next/link";
import { SitePage } from "@/components/SitePage";

export const metadata: Metadata = {
  title: "Chi siamo",
  description: "Coperto è il gestionale di prenotazioni e sala fatto in Italia per i ristoranti italiani, a canone fisso e senza commissioni.",
};

export default function AboutPage() {
  return (
    <SitePage
      title="Chi siamo"
      lede="Coperto è un gestionale di prenotazioni e di sala fatto in Italia, per i ristoranti italiani."
    >
      <section className="stack" style={{ gap: 8 }}>
        <h2>Perché esistiamo</h2>
        <p>
          Troppi ristoranti pagano una commissione su ogni coperto prenotato online, anche per clienti che li conoscevano già. Ci
          sembra sbagliato: la prenotazione è un servizio, non una percentuale del tuo lavoro. Per questo Coperto ha un canone
          fisso, uguale che tu faccia cento coperti al mese o tremila.
        </p>
      </section>

      <section className="stack" style={{ gap: 8 }}>
        <h2>Come lavoriamo</h2>
        <ul>
          <li><strong>La sala com’è davvero.</strong> La pianta del tuo locale, i tuoi tavoli e i tuoi orari, non un modello uguale per tutti.</li>
          <li><strong>Semplice nel mezzo del servizio.</strong> Ogni schermata è pensata per essere usata in piedi, con una mano, mentre la sala è piena.</li>
          <li><strong>I dati sono tuoi.</strong> Gli ospiti sono clienti del tuo ristorante, non nostri: li scarichi quando vuoi e non li usiamo per altro.</li>
          <li><strong>Privacy fatta bene.</strong> Ogni ospite sceglie se farsi ricordare, e può vedere o cancellare i suoi dati da solo.</li>
        </ul>
      </section>

      <section className="stack" style={{ gap: 8 }}>
        <h2>Parliamone</h2>
        <p>
          Vuoi vedere Coperto sulla tua sala? <Link href="/#demo">Prenota una demo</Link>, oppure{" "}
          <Link href="/registrati">provalo gratis per 14 giorni</Link>. Ti piacerebbe costruirlo con noi?{" "}
          <Link href="/lavora-con-noi">Lavora con noi</Link>.
        </p>
      </section>
    </SitePage>
  );
}
