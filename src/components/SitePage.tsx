import Link from "next/link";
import type { ReactNode } from "react";
import { COMPANY } from "@/lib/legal";
import { Logo } from "./Logo";

/** The frame for Coperto's own pages (Chi siamo, Lavora con noi): logo, the way back, the content. */
export function SitePage({ title, lede, children }: { title: string; lede?: ReactNode; children: ReactNode }) {
  return (
    <main className="legal">
      <div className="spread">
        <Logo />
        <Link href="/" className="small">‹ Torna al sito</Link>
      </div>
      <div>
        <h1>{title}</h1>
        {lede && <p className="muted" style={{ fontSize: 18, marginTop: 8 }}>{lede}</p>}
      </div>
      {children}
      <p className="small muted" style={{ marginTop: 24 }}>
        © {COMPANY.name} · P.IVA {COMPANY.vat} · <Link href="/privacy">Privacy</Link> · <Link href="/termini">Termini</Link>
      </p>
    </main>
  );
}
