"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavLink = { href: string; label: string };

// Pages that are the start of a section: highlighted only when on them, not on everything under them.
const SECTION_ROOTS = ["/app", "/admin"];

export function NavLinks({ links }: { links: NavLink[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Principale">
      {links.map((l) => (
        // prefetch: load the whole page, data included, as soon as the menu is on screen, so the tap is instant.
        <Link key={l.href} href={l.href} prefetch aria-current={(SECTION_ROOTS.includes(l.href) ? path === l.href : path.startsWith(l.href)) ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
