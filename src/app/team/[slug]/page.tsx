import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { Logo } from "@/components/Logo";
import { getCurrentAccount } from "@/lib/auth";
import { getRestaurantBySlug } from "@/lib/restaurant";
import { login } from "../../(auth)/actions";

export async function generateMetadata({ params }: PageProps<"/team/[slug]">): Promise<Metadata> {
  const r = await getRestaurantBySlug((await params).slug);
  return { title: r ? `Staff · ${r.name}` : "Staff", robots: { index: false } };
}

/** A restaurant's own login page for its team, to bookmark on the room's tablet or a waiter's phone. */
export default async function StaffLoginPage({ params }: PageProps<"/team/[slug]">) {
  const { slug } = await params;
  const [r, account] = await Promise.all([getRestaurantBySlug(slug), getCurrentAccount()]);
  if (!r) notFound();
  return (
    <main className="auth">
      <Logo />
      <div className="panel stack">
        <div>
          <p className="small muted">Accesso staff</p>
          <h1>{r.name}</h1>
          {r.city && <p className="muted">{r.city}</p>}
        </div>
        {account?.restaurant.id === r.id ? (
          <p>
            Sei già dentro come {account.user.name}. <Link href="/app">Vai alle prenotazioni</Link>
          </p>
        ) : (
          <ActionForm action={login} submitLabel="Entra" wide>
            <input type="hidden" name="slug" value={r.slug} />
            <label className="field">
              Email
              <input className="input" type="email" name="email" autoComplete="email" required />
            </label>
            <label className="field">
              Password
              <input className="input" type="password" name="password" autoComplete="current-password" required />
            </label>
          </ActionForm>
        )}
        <p className="small">
          <Link href="/password-dimenticata">Password dimenticata?</Link>
        </p>
      </div>
      <p className="small muted">Non hai un accesso? Chiedi al titolare di invitarti dalla pagina Team.</p>
    </main>
  );
}
