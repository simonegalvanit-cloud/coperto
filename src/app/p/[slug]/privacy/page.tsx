import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getRestaurantBySlug } from "@/lib/restaurant";
import { RETENTION } from "@/lib/consent-wording";
import { PublicShell } from "../PublicShell";

export async function generateMetadata({ params }: PageProps<"/p/[slug]/privacy">): Promise<Metadata> {
  const r = await getRestaurantBySlug((await params).slug);
  return r ? { title: `Informativa privacy · ${r.name}` } : {};
}

/** The privacy notice guests see before booking (GDPR art. 13): who, what, why, how long, and their rights. */
export default async function PrivacyPage({ params, searchParams }: PageProps<"/p/[slug]/privacy">) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const r = await getRestaurantBySlug(slug);
  if (!r) notFound();
  const where = [r.address, r.city].filter(Boolean).join(", ");
  return (
    <PublicShell r={r} embed={sp.embed === "1"}>
      <article className="privacy stack">
        <h2>Informativa sul trattamento dei dati</h2>

        <section>
          <h3>Chi tratta i tuoi dati</h3>
          <p>
            Il titolare del trattamento è <strong>{r.name}</strong>
            {where && `, ${where}`}, contattabile a <a href={`mailto:${r.notifyEmail}`}>{r.notifyEmail}</a>
            {r.phone && <> o al {r.phone}</>}. Il servizio di prenotazione è fornito da Coperto S.r.l. (P.IVA 00774429441), che tratta i
            dati per conto del ristorante e solo secondo le sue istruzioni. I dati sono conservati nell’Unione europea.
          </p>
        </section>

        <section>
          <h3>Quali dati e perché</h3>
          <ul>
            <li>
              <strong>Per la prenotazione</strong>: nome, telefono, email, numero di persone e le note che scrivi. Servono a gestire la
              prenotazione, mandarti la conferma e un promemoria il giorno prima (esecuzione del servizio richiesto, art. 6.1.b GDPR).
            </li>
            <li>
              <strong>Solo se scegli “Ricordati di me”</strong>: il ristorante conserva una scheda con le tue visite, preferenze e
              allergie, per accoglierti meglio le volte successive (consenso, art. 6.1.a; per le allergie, consenso esplicito, art. 9.2.a).
            </li>
            <li>
              <strong>Solo se scegli di riceverle</strong>: offerte e novità del ristorante (consenso, art. 6.1.a).
            </li>
          </ul>
          <p>Senza il tuo consenso non viene creata nessuna scheda: i dati servono solo per quella prenotazione.</p>
        </section>

        <section>
          <h3>Per quanto tempo</h3>
          <p>
            I dati di una prenotazione senza scheda vengono anonimizzati {RETENTION.bookingMonths} mesi dopo la data della visita. La
            scheda resta finché non ritiri il consenso, e viene cancellata comunque dopo {RETENTION.profileMonths} mesi senza visite.
          </p>
        </section>

        <section>
          <h3>I tuoi diritti</h3>
          <p>
            Puoi vedere i tuoi dati, scaricarli, correggerli, cancellarli e ritirare il consenso quando vuoi, senza conseguenze sulle
            prenotazioni. Dalla pagina della tua prenotazione (il link nell’email di conferma) puoi chiedere un link privato per farlo
            da solo, oppure scrivere al ristorante. Puoi anche presentare reclamo al Garante per la protezione dei dati personali
            (garanteprivacy.it).
          </p>
        </section>
      </article>
    </PublicShell>
  );
}
