import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { Logo } from "@/components/Logo";
import { requestPasswordReset } from "../actions";

export const metadata: Metadata = { title: "Password dimenticata" };

export default function ForgotPasswordPage() {
  return (
    <main className="auth">
      <Logo />
      <div className="panel stack">
        <div>
          <h1>Password dimenticata</h1>
          <p className="muted">Scrivi la tua email: ti mandiamo un link per sceglierne una nuova.</p>
        </div>
        <ActionForm action={requestPasswordReset} submitLabel="Mandami il link" wide>
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
