import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { ActionForm } from "@/components/ActionForm";
import { Logo } from "@/components/Logo";
import { ROLE_HINT, ROLE_LABEL } from "@/lib/roles";
import { resolveInvite } from "@/lib/team";
import { acceptInvite } from "../actions";

export const metadata: Metadata = { title: "Invito", robots: { index: false } };

export default async function InvitePage({ params }: PageProps<"/invito/[token]">) {
  const { token } = await params;
  const found = await resolveInvite(token);
  if (!found) {
    return (
      <main className="auth">
        <Logo />
        <div className="panel stack">
          <h1>Invito scaduto</h1>
          <p className="muted">Questo invito non è più valido (dura 7 giorni, e si usa una volta sola). Chiedi a chi ti ha invitato di mandartene un altro.</p>
        </div>
      </main>
    );
  }
  const { invite, restaurant } = found;
  const db = await getDb();
  const [existing] = await db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.email, invite.email));

  return (
    <main className="auth">
      <Logo />
      <div className="panel stack">
        <div>
          <h1>Entra nel team di {restaurant.name}</h1>
          <p className="muted">
            Come {ROLE_LABEL[invite.role]}: {ROLE_HINT[invite.role].charAt(0).toLowerCase() + ROLE_HINT[invite.role].slice(1)}
          </p>
        </div>
        <ActionForm action={acceptInvite} submitLabel={existing ? "Entra nel team" : "Crea il mio accesso"} wide>
          <input type="hidden" name="token" value={token} />
          <label className="field">
            Email
            <input className="input" type="email" value={invite.email} readOnly autoComplete="username" />
          </label>
          {existing ? (
            <>
              <p className="small muted">Hai già un account Coperto con questa email: usa la tua password di sempre.</p>
              <label className="field">
                Password
                <input className="input" type="password" name="password" autoComplete="current-password" required />
              </label>
            </>
          ) : (
            <>
              <label className="field">
                Il tuo nome
                <input className="input" name="name" defaultValue={invite.name} autoComplete="name" required />
              </label>
              <label className="field">
                Scegli una password <span className="hint">Almeno 8 caratteri, solo tua</span>
                <input className="input" type="password" name="password" autoComplete="new-password" minLength={8} required />
              </label>
            </>
          )}
        </ActionForm>
        <p className="small muted">
          Entrando accetti i <Link href="/termini">Termini di servizio</Link>. Come trattiamo i tuoi dati: <Link href="/privacy">Privacy</Link>.
        </p>
      </div>
    </main>
  );
}
