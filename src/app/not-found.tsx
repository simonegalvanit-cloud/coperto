import { Logo } from "@/components/Logo";

export default function NotFound() {
  return (
    <main className="auth">
      <Logo />
      <div className="panel stack" style={{ textAlign: "center" }}>
        <h1>Pagina non trovata</h1>
        <p className="muted">Il link potrebbe essere sbagliato, oppure la pagina non esiste più.</p>
        <p>
          <a className="btn" href="/">Torna alla home</a>
        </p>
      </div>
    </main>
  );
}
