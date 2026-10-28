import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { Logo } from "@/components/Logo";
import { getCurrentAccount } from "@/lib/auth";
import { signup } from "../actions";

export const metadata: Metadata = { title: "Registra il tuo ristorante" };

export default async function SignupPage() {
  if (await getCurrentAccount()) redirect("/app");
  return (
    <main className="auth">
      <Logo />
      <div className="panel stack">
        <div>
          <h1>Registra il tuo ristorante</h1>
          <p className="muted">In due minuti hai il tuo link di prenotazione.</p>
        </div>
        <ActionForm action={signup} submitLabel="Crea il mio account" pendingLabel="Creo l’account…" wide>
          <label className="field">
            Nome del ristorante
            <input className="input" name="restaurant" autoComplete="organization" required />
          </label>
          <label className="field">
            Città
            <input className="input" name="city" autoComplete="address-level2" />
          </label>
          <label className="field">
            Il tuo nome
            <input className="input" name="name" autoComplete="name" required />
          </label>
          <label className="field">
            Email
            <input className="input" type="email" name="email" autoComplete="email" required />
          </label>
          <label className="field">
            Password <span className="hint">Almeno 8 caratteri</span>
            <input className="input" type="password" name="password" autoComplete="new-password" minLength={8} required />
          </label>
        </ActionForm>
      </div>
      <p>
        Hai già un account? <Link href="/accedi">Accedi</Link>
      </p>
    </main>
  );
}
