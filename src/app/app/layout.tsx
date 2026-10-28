import type { Metadata } from "next";
import { Logo } from "@/components/Logo";
import { requireAccount } from "@/lib/auth";
import { logout } from "../(auth)/actions";
import { NavLinks } from "./NavLinks";

export const metadata: Metadata = { title: "Sala", robots: { index: false } };

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const { restaurant } = await requireAccount();
  return (
    <>
      <header className="topbar">
        <div className="topbar-in">
          <Logo href="/app" />
          <NavLinks />
          <span className="who muted">{restaurant.name}</span>
          <form action={logout}>
            <button className="btn btn-quiet btn-small" type="submit">Esci</button>
          </form>
        </div>
      </header>
      <main className="page">{children}</main>
    </>
  );
}
