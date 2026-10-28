import type { ReactNode } from "react";
import type { Restaurant } from "@/db/schema";

/** Chrome around the guest pages; in embed mode it slims down to fit an iframe on the restaurant's site. */
export function PublicShell({ r, embed, children }: { r: Restaurant; embed: boolean; children: ReactNode }) {
  const where = [r.address, r.city].filter(Boolean).join(", ");
  return (
    <div className={`public${embed ? " embed" : ""}`}>
      <header className="public-head">
        <div className="in">
          <h1>{r.name}</h1>
          {(where || r.phone) && (
            <p className="muted" style={{ marginTop: 6 }}>
              {where}
              {where && r.phone && " · "}
              {r.phone && <a href={`tel:${r.phone.replace(/\s/g, "")}`}>{r.phone}</a>}
            </p>
          )}
        </div>
      </header>
      <main className="public-main">{children}</main>
      <footer className="public-foot">
        Prenotazioni con <a href="/" target={embed ? "_blank" : undefined}>Coperto</a>, senza commissioni per il ristorante
      </footer>
    </div>
  );
}
