import type { Metadata } from "next";
import Link from "next/link";
import { SitePage } from "@/components/SitePage";
import { CAREER_ROLES, CV_MAX_MB, CV_RETENTION_MONTHS } from "@/lib/careers";
import { COMPANY } from "@/lib/legal";
import { ApplyForm } from "./ApplyForm";

export const metadata: Metadata = {
  title: "Lavora con noi",
  description: "Costruisci con noi il gestionale di sala per i ristoranti italiani. Mandaci il tuo CV.",
};

export default function CareersPage() {
  return (
    <SitePage
      title="Lavora con noi"
      lede="Costruiamo Coperto per i ristoranti italiani: chi prenota, chi accoglie, chi corre tra i tavoli. Se ti piace l’idea di un software che si usa davvero in sala, mandaci il tuo CV."
    >
      <section className="stack" style={{ gap: 8 }}>
        <h2>Chi cerchiamo</h2>
        <p>
          Non abbiamo sempre posizioni aperte, ma leggiamo ogni candidatura spontanea. Cerchiamo persone curiose e precise, che
          abbiano voglia di passare del tempo nei ristoranti per capire come lavorano, e di rendere semplice ciò che oggi è
          complicato. Aver lavorato in sala o in cucina è un vantaggio, in qualsiasi ruolo.
        </p>
        <ul>
          {CAREER_ROLES.filter((r) => r !== "Altro").map((r) => <li key={r}>{r}</li>)}
        </ul>
      </section>

      <section className="stack" style={{ gap: 12 }}>
        <h2>Candidati</h2>
        <ApplyForm roles={CAREER_ROLES} maxMb={CV_MAX_MB} />
      </section>

      <section className="stack small" style={{ gap: 6 }}>
        <h2 style={{ fontSize: 18 }}>Informativa per chi si candida</h2>
        <p>
          Titolare del trattamento è {COMPANY.name} (P.IVA {COMPANY.vat}, {COMPANY.address}). Usiamo i dati che ci mandi (dati di
          contatto, CV e quanto scrivi) solo per valutare la tua candidatura e contattarti per un colloquio, sulla base del tuo
          consenso e delle misure precontrattuali che richiedi (art. 6.1.a e 6.1.b del GDPR). Non inserire nel CV dati
          particolari (salute, opinioni, origine) se non necessari: non ci servono.
        </p>
        <p>
          Li leggono solo le persone di {COMPANY.name} che si occupano della selezione; sono conservati sui server dei nostri
          fornitori nell’Unione europea (elencati nell’<Link href="/privacy">informativa privacy</Link>) e cancellati al più tardi dopo{" "}
          {CV_RETENTION_MONTHS} mesi, o prima se ce lo chiedi. Puoi chiedere in ogni momento di vederli, correggerli o cancellarli
          scrivendo a {COMPANY.email}, e presentare reclamo al Garante per la protezione dei dati personali.
        </p>
      </section>
    </SitePage>
  );
}
