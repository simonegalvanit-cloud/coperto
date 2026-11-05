"use client";

import { Logo } from "@/components/Logo";

/** Instead of a blank "server error": what to try, and where to see what's wrong. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="auth">
      <Logo />
      <div className="panel stack">
        <h1>Qualcosa non va</h1>
        <p className="muted">Il server non è riuscito a caricare questa pagina. Riprova: se succede ancora, apri la pagina di diagnostica.</p>
        <div className="row">
          <button type="button" className="btn btn-fill" onClick={reset}>Riprova</button>
          <a className="btn" href="/api/diagnostica">Diagnostica</a>
        </div>
        {error.digest && <p className="small muted">Codice errore: {error.digest}</p>}
      </div>
    </main>
  );
}
