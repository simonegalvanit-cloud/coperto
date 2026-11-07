import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { requireAdmin } from "@/lib/admin";
import { getCurrentAccount } from "@/lib/auth";
import { logout } from "../(auth)/actions";
import { NavLinks, type NavLink } from "../app/NavLinks";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin Coperto" }, robots: { index: false } };

const LINKS: NavLink[] = [
  { href: "/admin", label: "Panoramica" },
  { href: "/admin/ristoranti", label: "Ristoranti" },
  { href: "/admin/utenti", label: "Utenti" },
  { href: "/admin/candidature", label: "Candidature" },
  { href: "/admin/sistema", label: "Sistema" },
  { href: "/admin/registro", label: "Registro" },
];

/** Coperto's own back office. Only for the emails in ADMIN_EMAILS; everyone else gets "page not found". */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const admin = await requireAdmin();
  // Admins who also work at a restaurant can go back to it; staff-only admins have no app to go back to.
  const hasRestaurant = !!(await getCurrentAccount());
  return (
    <>
      <header className="topbar admin-bar">
        <div className="topbar-in">
          <Logo href="/admin" />
          <span className="tag">Admin</span>
          <NavLinks links={LINKS} />
          <span className="who muted">{admin.email}</span>
          {hasRestaurant && <Link className="btn btn-small" href="/app">Torna all’app</Link>}
          <form action={logout}>
            <button className="btn btn-quiet btn-small" type="submit">Esci</button>
          </form>
        </div>
      </header>
      <main className="page">{children}</main>
    </>
  );
}
