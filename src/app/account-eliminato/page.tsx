import type { Metadata } from "next";
import { Logo } from "@/components/Logo";

export const metadata: Metadata = { title: "Account eliminato", robots: { index: false } };

export default async function DeletedPage({ searchParams }: PageProps<"/account-eliminato">) {
  const sp = await searchParams;
  const restaurant = typeof sp.ristorante === "string" ? sp.ristorante.slice(0, 80) : "";
  return (
    <main className="auth">
      <Logo />
      <div className="panel stack" style={{ textAlign: "center" }}>
        <h1>{restaurant ? `${restaurant} è stato eliminato` : "Account eliminato"}</h1>
        <p className="muted">
          {restaurant
            ? "Abbiamo cancellato il ristorante e tutti i suoi dati. Ti abbiamo mandato una conferma via email."
            : "Il tuo account non esiste più. Grazie per aver lavorato con Coperto."}
        </p>
      </div>
    </main>
  );
}
