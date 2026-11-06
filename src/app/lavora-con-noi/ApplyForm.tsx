"use client";

import { startTransition, useActionState, useState } from "react";
import { apply } from "./actions";

/** The application form; a clear thank-you replaces it once sent. */
export function ApplyForm({ roles, maxMb }: { roles: readonly string[]; maxMb: number }) {
  const [state, run, pending] = useActionState(apply, null);
  const [fileError, setFileError] = useState<string | null>(null);

  if (state?.ok) {
    return (
      <div className="panel stack" role="status">
        <h2>Grazie, abbiamo ricevuto la tua candidatura.</h2>
        <p>La leggiamo tutta. Se c’è un ruolo adatto a te ti scriviamo noi; in ogni caso conserviamo il CV al massimo 12 mesi.</p>
      </div>
    );
  }

  const error = (field: string) =>
    state?.field === field ? <span className="field-error" role="alert">{state.error}</span> : null;

  return (
    <form
      className="panel stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (fileError) return;
        const data = new FormData(e.currentTarget);
        startTransition(() => run(data));
      }}
    >
      <div className="grid-2">
        <label className="field">
          Nome e cognome
          <input className="input" name="name" autoComplete="name" required maxLength={120} />
          {error("name")}
        </label>
        <label className="field">
          Email
          <input className="input" type="email" name="email" autoComplete="email" required />
          {error("email")}
        </label>
        <label className="field">
          Telefono <span className="hint">Facoltativo</span>
          <input className="input" type="tel" name="phone" autoComplete="tel" maxLength={40} />
        </label>
        <label className="field">
          Città <span className="hint">Facoltativo</span>
          <input className="input" name="city" autoComplete="address-level2" maxLength={80} />
        </label>
      </div>
      <label className="field">
        Il ruolo che ti interessa
        <select className="input" name="role" required defaultValue="">
          <option value="" disabled>Scegli…</option>
          {roles.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        {error("role")}
      </label>
      <label className="field">
        LinkedIn, portfolio o GitHub <span className="hint">Facoltativo</span>
        <input className="input" type="url" name="link" placeholder="https://" maxLength={300} />
        {error("link")}
      </label>
      <label className="field">
        Due righe su di te <span className="hint">Cosa sai fare, cosa ti piacerebbe fare con noi</span>
        <textarea className="input" name="message" rows={5} maxLength={3000} />
        {error("message")}
      </label>
      <label className="field">
        Il tuo CV <span className="hint">PDF o Word, al massimo {maxMb} MB</span>
        <input
          className="input"
          type="file"
          name="cv"
          required
          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(e) => {
            const f = e.currentTarget.files?.[0];
            setFileError(f && f.size > maxMb * 1024 * 1024 ? `Il file pesa ${(f.size / 1048576).toFixed(1)} MB: il massimo è ${maxMb} MB.` : null);
          }}
        />
        {fileError ? <span className="field-error" role="alert">{fileError}</span> : error("cv")}
      </label>
      {/* Hidden from people; bots fill it in. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: "-9999px" }} />
      <label className="check check-top">
        <input type="checkbox" name="privacy" required />
        <span className="small">
          Acconsento al trattamento dei miei dati per la selezione del personale, come descritto nell’informativa qui sotto.
        </span>
      </label>
      {error("privacy")}
      {state?.error && !["name", "email", "role", "link", "message", "cv", "privacy"].includes(state.field ?? "") && (
        <p className="form-error" role="alert">{state.error}</p>
      )}
      <div>
        <button className="btn btn-fill" type="submit" disabled={pending}>{pending ? "Invio in corso…" : "Invia la candidatura"}</button>
      </div>
    </form>
  );
}
