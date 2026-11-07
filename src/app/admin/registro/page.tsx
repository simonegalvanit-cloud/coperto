import type { Metadata } from "next";
import { recentLog, requireAdmin } from "@/lib/admin";

export const metadata: Metadata = { title: "Registro" };

const when = (d: Date) => new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Rome" }).format(d);

/** Who on Coperto's side looked at what, and did what. */
export default async function AdminLogPage() {
  await requireAdmin();
  const log = await recentLog();
  return (
    <>
      <h1>Registro</h1>
      <p className="muted">Ogni volta che qualcuno di Coperto apre i dati di un ristorante o fa un’azione dal pannello. Le ultime 200.</p>
      {log.length === 0 ? (
        <p className="empty">Ancora niente.</p>
      ) : (
        <ul className="list-plain small">
          {log.map((e) => (
            <li key={e.id}>
              <span>
                <strong>{e.adminEmail}</strong> {e.action.charAt(0).toLowerCase() + e.action.slice(1)}{e.target && <>: {e.target}</>}
              </span>
              <span className="muted">{when(e.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
