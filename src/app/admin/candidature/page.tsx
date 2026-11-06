import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Logo } from "@/components/Logo";
import { getCurrentAccount } from "@/lib/auth";
import { CV_RETENTION_MONTHS, isCareersAdmin, listApplications } from "@/lib/careers";
import { removeApplication } from "./actions";

export const metadata: Metadata = { title: "Candidature", robots: { index: false } };

const when = (d: Date) => new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeZone: "Europe/Rome" }).format(d);

/** Applications from "Lavora con noi", for the people listed in ADMIN_EMAILS. Anyone else gets a 404. */
export default async function ApplicationsPage() {
  const account = await getCurrentAccount();
  if (!account || account.onTablet || !isCareersAdmin(account.user.email)) notFound();
  const apps = await listApplications();
  return (
    <main className="legal" style={{ maxWidth: 960 }}>
      <div className="spread">
        <Logo href="/app" />
        <Link href="/app" className="small">‹ Torna all’app</Link>
      </div>
      <div>
        <h1>Candidature</h1>
        <p className="muted">Da “Lavora con noi”. Si cancellano da sole dopo {CV_RETENTION_MONTHS} mesi; cancellale prima se la selezione è chiusa.</p>
      </div>
      {apps.length === 0 ? (
        <p className="empty">Nessuna candidatura per ora.</p>
      ) : (
        <ul className="list-plain">
          {apps.map((a) => (
            <li key={a.id} style={{ alignItems: "flex-start" }}>
              <span className="stack" style={{ gap: 4 }}>
                <strong>{a.name} <span className="tag">{a.role}</span></strong>
                <span className="small">
                  <a href={`mailto:${a.email}`}>{a.email}</a>
                  {a.phone && ` · ${a.phone}`}
                  {a.city && ` · ${a.city}`}
                  {a.link && <> · <a href={a.link} target="_blank" rel="noreferrer noopener">link</a></>}
                  {` · ${when(a.createdAt)}`}
                </span>
                {a.message && <span className="small muted" style={{ whiteSpace: "pre-wrap" }}>{a.message}</span>}
              </span>
              <span className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                <a className="btn btn-small" href={`/admin/candidature/${a.id}/cv`} download>Scarica CV</a>
                <form action={removeApplication}>
                  <input type="hidden" name="id" value={a.id} />
                  <ConfirmButton className="btn btn-small btn-danger" question={`Cancellare la candidatura di ${a.name}, CV compreso?`} confirmLabel="Cancella">
                    Cancella
                  </ConfirmButton>
                </form>
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
