import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { CopyButton } from "@/components/CopyButton";
import { requireAccount } from "@/lib/auth";
import { assignableRoles, can, ROLE_HINT, ROLE_LABEL } from "@/lib/roles";
import { appUrl } from "@/lib/url";
import { cancelInvite, changeRole, inviteMember, removeMember, resendInvite, transferOwnership } from "./actions";

export const metadata: Metadata = { title: "Team" };

const day = (d: Date) => new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeZone: "Europe/Rome" }).format(d);

export default async function TeamPage({ searchParams }: PageProps<"/app/team">) {
  const { restaurant, role, user } = await requireAccount("team");
  const handedTo = (await searchParams).titolare;
  const db = await getDb();
  const [team, invites, base] = await Promise.all([
    db
      .select({ id: schema.members.id, userId: schema.members.userId, role: schema.members.role, since: schema.members.createdAt, name: schema.users.name, email: schema.users.email })
      .from(schema.members)
      .innerJoin(schema.users, eq(schema.users.id, schema.members.userId))
      .where(eq(schema.members.restaurantId, restaurant.id))
      .orderBy(asc(schema.members.createdAt)),
    db.select().from(schema.invites).where(eq(schema.invites.restaurantId, restaurant.id)).orderBy(asc(schema.invites.createdAt)),
    appUrl(),
  ]);
  const roles = assignableRoles(role);
  const portal = `${base}/team/${restaurant.slug}`;
  const managers = team.filter((m) => m.role === "manager");
  const now = new Date();

  return (
    <>
      {typeof handedTo === "string" && (
        <p className="panel form-ok">{handedTo.slice(0, 80)} è ora titolare di {restaurant.name}. Tu resti nel team come responsabile.</p>
      )}
      <div>
        <h1>Team</h1>
        <p className="muted">Ognuno entra con la sua email e la sua password: niente password condivise, e sai chi ha inserito ogni prenotazione.</p>
      </div>

      <section className="panel settings-section">
        <header>
          <h2>Chi lavora da {restaurant.name}</h2>
        </header>
        <ul className="list-plain team-list">
          {team.map((m) => {
            const manageable = roles.includes(m.role) && m.userId !== user.id;
            return (
              <li key={m.id}>
                <span>
                  <strong>{m.name}</strong> {m.userId === user.id && <span className="tag">tu</span>}
                  <span className="small muted" style={{ display: "block" }}>{m.email} · dal {day(m.since)}</span>
                </span>
                <span className="row" style={{ gap: 8 }}>
                  {manageable && roles.length > 1 ? (
                    <form action={changeRole} className="row" style={{ gap: 6 }}>
                      <input type="hidden" name="id" value={m.id} />
                      <select className="input input-small" name="role" defaultValue={m.role} aria-label={`Ruolo di ${m.name}`}>
                        {roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                      </select>
                      <button type="submit" className="btn btn-small">Cambia</button>
                    </form>
                  ) : (
                    <span className={`tag${m.role === "owner" ? " tag-ok" : ""}`}>{ROLE_LABEL[m.role]}</span>
                  )}
                  {manageable && (
                    <form action={removeMember}>
                      <input type="hidden" name="id" value={m.id} />
                      <ConfirmButton className="btn btn-small btn-danger" question={`Togliere ${m.name} dal team? Non potrà più entrare, da nessun dispositivo.`} confirmLabel="Togli dal team">
                        Togli
                      </ConfirmButton>
                    </form>
                  )}
                </span>
              </li>
            );
          })}
          {invites.map((i) => (
            <li key={i.id}>
              <span>
                <strong>{i.name}</strong> <span className="tag">{i.expiresAt > now ? "invitato" : "invito scaduto"}</span>
                <span className="small muted" style={{ display: "block" }}>{i.email} · {ROLE_LABEL[i.role]}</span>
              </span>
              {roles.includes(i.role) && (
                <span className="row" style={{ gap: 8 }}>
                  <form action={resendInvite}>
                    <input type="hidden" name="email" value={i.email} />
                    <button type="submit" className="btn btn-small">Rimanda l’invito</button>
                  </form>
                  <form action={cancelInvite}>
                    <input type="hidden" name="email" value={i.email} />
                    <button type="submit" className="btn btn-small btn-quiet">Annulla</button>
                  </form>
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel settings-section">
        <header>
          <h2>Aggiungi una persona</h2>
          <p className="muted">Le mandiamo un’email con il link per scegliere la password.</p>
        </header>
        <ActionForm action={inviteMember} submitLabel="Manda l’invito">
          <div className="grid-3">
            <label className="field">
              Nome
              <input className="input" name="name" required />
            </label>
            <label className="field">
              Email
              <input className="input" type="email" name="email" required />
            </label>
            <label className="field">
              Ruolo
              <select className="input" name="role" defaultValue="staff">
                {roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            </label>
          </div>
          <ul className="small muted role-help">
            {(["owner", ...roles] as const).map((r) => (
              <li key={r}><strong>{ROLE_LABEL[r]}:</strong> {ROLE_HINT[r]}</li>
            ))}
          </ul>
        </ActionForm>
      </section>

      <section className="panel settings-section">
        <header>
          <h2>Accesso dello staff</h2>
          <p className="muted">
            La pagina d’ingresso del tuo ristorante: salvala tra i preferiti sul tablet della sala o sul telefono di chi lavora con te.
          </p>
        </header>
        <div className="row">
          <a href={portal} target="_blank" rel="noreferrer" style={{ fontWeight: 700, overflowWrap: "anywhere" }}>{portal}</a>
          <CopyButton text={portal} label="Copia il link" />
        </div>
      </section>

      {can(role, "account") && (
        <section className="panel settings-section">
          <header>
            <h2>Passa la proprietà</h2>
            <p className="muted">
              Se il ristorante cambia titolare: un responsabile diventa titolare (con abbonamento e account), tu resti nel team come responsabile.
            </p>
          </header>
          {managers.length === 0 ? (
            <p className="small muted">Prima aggiungi la persona come responsabile.</p>
          ) : (
            <ActionForm action={transferOwnership} submitLabel="Passa la proprietà" className="row">
              <label className="field">
                Nuovo titolare
                <select className="input" name="id">
                  {managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </label>
              <label className="check check-top" style={{ flex: "1 1 260px" }}>
                <input type="checkbox" name="sure" required /> <span>Ho capito: non sarò più il titolare e non potrò annullarlo da solo.</span>
              </label>
            </ActionForm>
          )}
        </section>
      )}
    </>
  );
}
