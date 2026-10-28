"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/app", label: "Prenotazioni" },
  { href: "/app/sala", label: "Sala" },
  { href: "/app/nuova", label: "Nuova" },
  { href: "/app/impostazioni", label: "Impostazioni" },
];

export function NavLinks() {
  const path = usePathname();
  return (
    <nav aria-label="Principale">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={(l.href === "/app" ? path === l.href : path.startsWith(l.href)) ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
