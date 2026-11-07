import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { Logo } from "@/components/Logo";
import { isAdmin } from "@/lib/admin-emails";
import { getCurrentAccount, getCurrentUser } from "@/lib/auth";
import { login } from "../actions";

export const metadata: Metadata = { title: "Accedi" };

export default async function LoginPage() {
  if (await getCurrentAccount()) redirect("/app");
  const user = await getCurrentUser();
  if (user && !user.onTablet && isAdmin(user.email)) redirect("/admin");
  return (
    <main className="auth">
      <Logo />
      <div className="panel stack">
        <div>
          <h1>Accedi</h1>
          <p className="muted">Bentornato in sala.</p>
        </div>
        <ActionForm action={login} submitLabel="Accedi" wide>
          <label className="field">
            Email
            <input className="input" type="email" name="email" autoComplete="email" required />
          </label>
          <label className="field">
            Password
            <input className="input" type="password" name="password" autoComplete="current-password" required />
          </label>
        </ActionForm>
        <p className="small">
          <Link href="/password-dimenticata">Password dimenticata?</Link>
        </p>
      </div>
      <p>
        Non hai ancora un account? <Link href="/registrati">Registra il tuo ristorante</Link>
      </p>
    </main>
  );
}
