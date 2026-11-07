import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { requireAdmin } from "@/lib/admin";
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
  return (
    <>
      <header className="topbar admin-bar">
        <div className="topbar-in">
          <Logo href="/admin" />
          <span className="tag">Admin</span>
          <NavLinks links={LINKS} />
          <span className="who muted">{admin.email}</span>
          <Link className="btn btn-quiet btn-small" href="/app">Torna all’app</Link>
        </div>
      </header>
      <main className="page">{children}</main>
    </>
  );
}
