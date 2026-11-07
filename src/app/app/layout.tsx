import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { isAdmin } from "@/lib/admin";
import { requireAccount } from "@/lib/auth";
import { billingState, hasSalaFeatures } from "@/lib/billing";
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
  const sala = hasSalaFeatures(restaurant);
  const links: NavLink[] = [
    { href: "/app", label: "Prenotazioni" },
    ...(sala ? [{ href: "/app/sala", label: "Sala" }, { href: "/app/ospiti", label: "Ospiti" }] : []),
    { href: "/app/nuova", label: "Nuova" },
  ];
  if (can(role, "team")) links.push({ href: "/app/team", label: "Team" });
  if (can(role, "settings")) links.push({ href: "/app/impostazioni", label: "Impostazioni" });
  const owner = can(role, "account");
  if (owner) links.push({ href: "/app/abbonamento", label: "Abbonamento" });
  const billing = billingState(restaurant);
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
        {billing.kind === "expired" && (
          <div className="panel stack billing-banner" style={{ gap: 8 }}>
            <p>
              <strong>{billing.reason === "trial_over" ? "La prova gratuita è finita." : "L’abbonamento è terminato."}</strong> Le prenotazioni
              online sono in pausa: gli ospiti non possono prenotare dal tuo link. Le prenotazioni già fatte e tutti i dati restano qui.
            </p>
            {owner ? (
              <div><Link className="btn btn-fill btn-small" href="/app/abbonamento">Scegli il piano e riattiva</Link></div>
            ) : (
              <p className="small muted">Avvisa il titolare: può riattivarle dalla pagina Abbonamento.</p>
            )}
          </div>
        )}
        {owner && billing.kind === "past_due" && (
          <p className="panel billing-banner">
            <strong>Il pagamento non è andato a buon fine.</strong> Coperto continua a funzionare mentre riproviamo.{" "}
            <Link href="/app/abbonamento">Aggiorna la carta</Link>
          </p>
        )}
        {owner && billing.kind === "trial" && billing.daysLeft <= 7 && (
          <p className="panel">
            Prova gratuita: {billing.daysLeft === 1 ? "ultimo giorno" : `mancano ${billing.daysLeft} giorni`}.{" "}
            <Link href="/app/abbonamento">Scegli il piano</Link> per non interrompere le prenotazioni online.
          </p>
        )}
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
