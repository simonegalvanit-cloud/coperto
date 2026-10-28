import type { Metadata } from "next";
import { Logo } from "@/components/Logo";

export const metadata: Metadata = { title: "Fatto", robots: { index: false } };

export default async function PrivacyDonePage({ searchParams }: PageProps<"/privacy/fatto">) {
  const sp = await searchParams;
  const expired = sp.scaduto === "1";
  const restaurant = typeof sp.ristorante === "string" ? sp.ristorante.slice(0, 80) : "";
  return (
    <main className="auth">
      <Logo />
      <div className="panel stack" style={{ textAlign: "center" }}>
        <h1>{expired ? "Link scaduto" : "Scheda cancellata"}</h1>
        <p className="muted">
          {expired
            ? "Questo link non è più valido. Chiedine uno nuovo dalla pagina della tua prenotazione."
            : `${restaurant || "Il ristorante"} non conserva più la tua scheda. Le prenotazioni future restano valide.`}
        </p>
      </div>
    </main>
  );
}
