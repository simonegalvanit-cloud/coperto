import type { Metadata } from "next";
import { ActionForm } from "@/components/ActionForm";
import { listUsers, requireAdmin } from "@/lib/admin";
import { sendResetLink } from "../actions";

export const metadata: Metadata = { title: "Utenti" };

const day = (d: Date) => new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeZone: "Europe/Rome" }).format(d);

export default async function AdminUsers({ searchParams }: PageProps<"/admin/utenti">) {
  await requireAdmin();
  const q = String((await searchParams).q ?? "").trim().slice(0, 80);
  const users = await listUsers(q);
  return (
    <>
      <h1>Utenti</h1>
      <p className="muted">Tutte le persone con un accesso a Coperto: titolari, responsabili e personale di sala.</p>
      <form className="row" action="/admin/utenti">
        <input className="input" style={{ flex: "1 1 260px", width: "auto" }} type="search" name="q" defaultValue={q} placeholder="Nome o email" aria-label="Cerca utenti" />
        <button className="btn" type="submit">Cerca</button>
      </form>
      {users.length === 0 ? (
        <p className="empty">{q ? `Nessun utente per “${q}”.` : "Ancora nessun utente."}</p>
      ) : (
        <ul className="list-plain team-list">
          {users.map((u) => (
            <li key={u.id}>
              <span>
                <strong>{u.name}</strong>
                <span className="small muted" style={{ display: "block" }}>
                  {u.email ?? "Solo PIN, senza email"} · dal {day(u.createdAt)}
                  {u.sessions > 0 && ` · ${u.sessions} ${u.sessions === 1 ? "accesso attivo" : "accessi attivi"}`}
                </span>
                <span className="small" style={{ display: "block" }}>{u.teams || <span className="muted">Nessun ristorante</span>}</span>
              </span>
              {u.email && u.hasPassword && (
                <ActionForm action={sendResetLink} submitLabel="Manda link nuova password" className="pin-form">
                  <input type="hidden" name="id" value={u.id} />
                </ActionForm>
              )}
            </li>
          ))}
        </ul>
      )}
      {users.length === 100 && <p className="small muted">Mostro i 100 più recenti: cerca per trovare gli altri.</p>}
    </>
  );
}
