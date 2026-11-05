import Link from "next/link";
import type { ReactNode } from "react";
import { COMPANY, TERMS_DATE } from "@/lib/legal";
import { Logo } from "./Logo";

const PAGES = [
  { href: "/termini", label: "Termini di servizio" },
  { href: "/privacy", label: "Privacy" },
  { href: "/cookie", label: "Cookie" },
  { href: "/dpa", label: "Trattamento dei dati (DPA)" },
];

/** The frame shared by Coperto's legal pages: logo, links between them, title and date. */
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="legal">
      <Logo />
      <nav className="legal-nav" aria-label="Documenti legali">
        {PAGES.map((p) => (
          <Link key={p.href} href={p.href}>{p.label}</Link>
        ))}
      </nav>
      <div>
        <h1>{title}</h1>
        <p className="muted">
          {COMPANY.name} · P.IVA {COMPANY.vat} · Ultimo aggiornamento: {TERMS_DATE}
        </p>
      </div>
      {children}
    </main>
  );
}
