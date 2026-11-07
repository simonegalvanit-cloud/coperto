import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { Logo } from "@/components/Logo";
import { requestAdminAccess } from "../actions";

export const metadata: Metadata = { title: "Accesso staff Coperto", robots: { index: false } };

/** First access to the admin panel for Coperto's own staff, who have no restaurant to sign up with. */
export default function AdminAccessPage() {
  return (
    <main className="auth">
      <Logo />
      <div className="panel stack">
        <div>
          <h1>Accesso staff Coperto</h1>
          <p className="muted">
            Per chi gestisce Coperto, non per i ristoranti. Scrivi la tua email: se è tra quelle dello staff ti mandiamo un link per
            scegliere la password. Dopo entri da “Accedi” come tutti.
          </p>
        </div>
        <ActionForm action={requestAdminAccess} submitLabel="Mandami il link" wide>
          <label className="field">
            Email
            <input className="input" type="email" name="email" autoComplete="email" required />
          </label>
        </ActionForm>
      </div>
      <p>
        <Link href="/accedi">Torna ad Accedi</Link>
      </p>
    </main>
  );
}
