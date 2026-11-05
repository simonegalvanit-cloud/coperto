import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, count, eq, gte, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { requireAccount } from "@/lib/auth";
import { can, ROLE_HINT, ROLE_LABEL } from "@/lib/roles";
import { nowIn } from "@/lib/time";
import { changePassword, closeRestaurant, deleteMyAccount, leaveRestaurant, saveName, setMyPin, switchRestaurant } from "./actions";

export const metadata: Metadata = { title: "Il mio account" };

export default async function AccountPage() {
  const { restaurant, role, user, onTablet } = await requireAccount();
  const db = await getDb();
  const owner = can(role, "account");
  const [teams, [upcoming]] = await Promise.all([
    db
      .select({ id: schema.restaurants.id, name: schema.restaurants.name, role: schema.members.role })
      .from(schema.members)
      .innerJoin(schema.restaurants, eq(schema.restaurants.id, schema.members.restaurantId))
      .where(eq(schema.members.userId, user.id))
      .orderBy(asc(schema.members.createdAt)),
    db
      .select({ n: count() })
      .from(schema.reservations)
      .where(
        and(
          eq(schema.reservations.restaurantId, restaurant.id),
          gte(schema.reservations.date, nowIn(restaurant.timezone).date),
          inArray(schema.reservations.status, ["confirmed", "seated"]),
        ),
      ),
  ]);

  return (
    <>
      <div>
        <h1>Il mio account</h1>
        <p className="muted">
          {user.email ?? "Accesso solo con PIN"} · {ROLE_LABEL[role]} da {restaurant.name}. {ROLE_HINT[role]}
        </p>
      </div>

      {teams.length > 1 && (
        <section className="panel settings-section">
          <header>
            <h2>I tuoi ristoranti</h2>
          </header>
          <ul className="list-plain">
            {teams.map((t) => (
              <li key={t.id}>
                <span>
                  <strong>{t.name}</strong> <span className="small muted">· {ROLE_LABEL[t.role]}</span>
                </span>
                {t.id === restaurant.id ? (
                  <span className="tag tag-ok">Stai lavorando qui</span>
                ) : (
                  <form action={switchRestaurant}>
                    <input type="hidden" name="restaurantId" value={t.id} />
                    <button type="submit" className="btn btn-small">Passa a {t.name}</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel settings-section">
        <header>
          <h2>Nome</h2>
          <p className="muted">Lo vedono i colleghi accanto alle prenotazioni che inserisci.</p>
        </header>
        <ActionForm action={saveName} submitLabel="Salva" className="row">
          <label className="field" style={{ flex: "1 1 260px" }}>
            Il tuo nome
            <input className="input" name="name" defaultValue={user.name} required />
          </label>
        </ActionForm>
      </section>

      <section className="panel settings-section">
        <header>
          <h2>PIN per il tablet della sala</h2>
          <p className="muted">6 cifre, solo tue: sul tablet della sala tocchi il tuo nome e lo scrivi. Vale solo da {restaurant.name}.</p>
        </header>
        <ActionForm action={setMyPin} submitLabel="Salva il PIN">
          <div className="grid-2">
            <label className="field">
              Nuovo PIN
              <input className="input" type="password" name="pin" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="off" required />
            </label>
            <label className="field">
              Ripeti il PIN
              <input className="input" type="password" name="again" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="off" required />
            </label>
          </div>
        </ActionForm>
      </section>

      {user.hasPassword && !onTablet && (
      <section className="panel settings-section">
        <header>
          <h2>Password</h2>
        </header>
        <ActionForm action={changePassword} submitLabel="Cambia la password">
          <div className="grid-2">
            <label className="field">
              Password attuale
              <input className="input" type="password" name="current" autoComplete="current-password" required />
            </label>
            <label className="field">
              Nuova password <span className="hint">Almeno 8 caratteri</span>
              <input className="input" type="password" name="next" autoComplete="new-password" minLength={8} required />
            </label>
          </div>
        </ActionForm>
      </section>
      )}

      {owner && (
        <section className="panel settings-section">
          <header>
            <h2>I dati del ristorante</h2>
            <p className="muted">
              Sono tuoi: scarica tutto (prenotazioni, ospiti con i consensi, pianta, orari, team) in un file da conservare o
              portare altrove. <Link href="/termini">Termini</Link> · <Link href="/dpa">Accordo sul trattamento dei dati</Link>
            </p>
          </header>
          <div>
            <a className="btn" href="/app/account/export" download>Scarica tutti i dati</a>
          </div>
        </section>
      )}

      {owner ? (
        <section className="panel settings-section danger-zone">
          <header>
            <h2>Elimina {restaurant.name}</h2>
            <p className="muted">
              Cancella subito e per sempre il ristorante da Coperto: prenotazioni, ospiti, pianta, team e il tuo account. Il link
              di prenotazione smette di funzionare. Scarica prima i dati se ti servono.
            </p>
          </header>
          {upcoming.n > 0 && (
            <p className="form-error">
              {upcoming.n === 1 ? "C’è 1 prenotazione futura" : `Ci sono ${upcoming.n} prenotazioni future`}: gli ospiti non verranno avvisati.
              Contattali tu, o aspetta che siano passate.
            </p>
          )}
          <ActionForm action={closeRestaurant} submitLabel="Elimina il ristorante per sempre" pendingLabel="Elimino…">
            <div className="grid-2">
              <label className="field">
                Scrivi il nome del ristorante <span className="hint">{restaurant.name}</span>
                <input className="input" name="confirmName" autoComplete="off" required />
              </label>
              <label className="field">
                La tua password
                <input className="input" type="password" name="password" autoComplete="current-password" required />
              </label>
            </div>
          </ActionForm>
        </section>
      ) : (
        <section className="panel settings-section danger-zone">
          <header>
            <h2>Lascia il team o elimina l’account</h2>
            <p className="muted">
              Lasciando {restaurant.name} non potrai più entrare nella sua sala.
              {teams.length === 1 && " È il tuo unico ristorante, quindi verrà eliminato anche il tuo account."}
            </p>
          </header>
          <form action={leaveRestaurant}>
            <ConfirmButton className="btn btn-danger" question={`Lasciare il team di ${restaurant.name}?`} confirmLabel="Lascia il team">
              Lascia {restaurant.name}
            </ConfirmButton>
          </form>
          {teams.length > 1 && (
            <ActionForm action={deleteMyAccount} submitLabel="Elimina il mio account" className="row">
              <label className="field">
                La tua password, per eliminare l’account da tutti i ristoranti
                <input className="input" type="password" name="password" autoComplete="current-password" required />
              </label>
            </ActionForm>
          )}
        </section>
      )}
    </>
  );
}
