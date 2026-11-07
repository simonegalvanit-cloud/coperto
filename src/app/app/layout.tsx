import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { isAdmin } from "@/lib/admin";
import { requireAccount } from "@/lib/auth";
import { TERMS_VERSION } from "@/lib/legal";
import { can } from "@/lib/roles";
import { logout } from "../(auth)/actions";
import { lockTablet } from "../sala/actions";
import { acceptTerms } from "./account/actions";
import { IdleLock } from "./IdleLock";
import { NavLinks, type NavLink } from "./NavLinks";

export const metadata: Metadata = { title: "Sala", robots: { index: false } };

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const { restaurant, role, user, onTablet } = await requireAccount();
  const links: NavLink[] = [
    { href: "/app", label: "Prenotazioni" },
    { href: "/app/sala", label: "Sala" },
    { href: "/app/ospiti", label: "Ospiti" },
    { href: "/app/nuova", label: "Nuova" },
  ];
  if (can(role, "team")) links.push({ href: "/app/team", label: "Team" });
  if (can(role, "settings")) links.push({ href: "/app/impostazioni", label: "Impostazioni" });
  const mustAccept = can(role, "account") && restaurant.termsVersion !== TERMS_VERSION;

  return (
    <>
      <header className="topbar">
        <div className="topbar-in">
          <Logo href="/app" />
          <NavLinks links={links} />
          {!onTablet && isAdmin(user.email) && (
            <Link className="btn btn-small" href="/admin">Admin</Link>
          )}
          <Link className="who" href="/app/account" title="Il mio account">
            <span className="muted">{restaurant.name}</span> · {user.name}
          </Link>
          {onTablet ? (
            <form action={lockTablet}>
              <IdleLock minutes={5} />
              <button className="btn btn-small" type="submit">Blocca</button>
            </form>
          ) : (
            <form action={logout}>
              <button className="btn btn-quiet btn-small" type="submit">Esci</button>
            </form>
          )}
        </div>
      </header>
      <main className="page">
        {mustAccept && (
          <form action={acceptTerms} className="panel stack" style={{ gap: 8 }}>
            <p>
              <strong>{restaurant.termsVersion ? "Abbiamo aggiornato i termini." : "Un passo per essere in regola."}</strong> Leggi e accetta i{" "}
              <Link href="/termini" target="_blank">Termini di servizio</Link> e l’<Link href="/dpa" target="_blank">Accordo sul trattamento dei dati</Link>: con
              l’accordo Coperto si impegna a trattare i dati dei tuoi ospiti solo per tuo conto, come chiede il GDPR.
            </p>
            <div>
              <button type="submit" className="btn btn-small btn-fill">Ho letto e accetto</button>
            </div>
          </form>
        )}
        {children}
      </main>
    </>
  );
}
