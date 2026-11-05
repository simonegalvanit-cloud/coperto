import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { Logo } from "@/components/Logo";
import { resolvePasswordReset } from "@/lib/team";
import { resetPassword } from "../../actions";

export const metadata: Metadata = { title: "Nuova password", robots: { index: false } };

export default async function NewPasswordPage({ params }: PageProps<"/password-nuova/[token]">) {
  const { token } = await params;
  const user = await resolvePasswordReset(token);
  return (
    <main className="auth">
      <Logo />
      <div className="panel stack">
        {user ? (
          <>
            <div>
              <h1>Nuova password</h1>
              <p className="muted">Per {user.email}. Uscirai da tutti gli altri dispositivi.</p>
            </div>
            <ActionForm action={resetPassword} submitLabel="Salva e entra" wide>
              <input type="hidden" name="token" value={token} />
              <input type="email" value={user.email ?? ""} autoComplete="username" readOnly hidden />
              <label className="field">
                Nuova password <span className="hint">Almeno 8 caratteri</span>
                <input className="input" type="password" name="password" autoComplete="new-password" minLength={8} required />
              </label>
            </ActionForm>
          </>
        ) : (
          <>
            <h1>Link scaduto</h1>
            <p className="muted">Questo link non vale più: dura un’ora e si usa una volta sola.</p>
            <p>
              <Link className="btn" href="/password-dimenticata">Chiedine uno nuovo</Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
