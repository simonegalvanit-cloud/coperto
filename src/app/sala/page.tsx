import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { Logo } from "@/components/Logo";
import { getCurrentAccount, getDevice } from "@/lib/auth";
import { Keypad } from "./Keypad";

export const metadata: Metadata = { title: "Chi sei?", robots: { index: false } };

/** The room tablet's lock screen: tap your name, type your PIN. */
export default async function TabletPage() {
  const [found, account] = await Promise.all([getDevice(), getCurrentAccount()]);
  if (!found) {
    return (
      <main className="auth">
        <Logo />
        <div className="panel stack">
          <h1>Tablet non autorizzato</h1>
          <p className="muted">
            Per usare i PIN su questo dispositivo, un titolare o un responsabile deve accedere e scegliere “Usa questo dispositivo
            come tablet della sala” nella pagina Team.
          </p>
          <p>
            <Link className="btn" href="/accedi">Accedi</Link>
          </p>
        </div>
      </main>
    );
  }
  if (account?.onTablet) redirect("/app");

  const db = await getDb();
  const team = await db
    .select({ id: schema.members.id, name: schema.users.name })
    .from(schema.members)
    .innerJoin(schema.users, eq(schema.users.id, schema.members.userId))
    .where(and(eq(schema.members.restaurantId, found.restaurant.id), isNotNull(schema.members.pinHash)))
    .orderBy(asc(schema.users.name));

  return (
    <main className="auth">
      <Logo />
      <div className="panel stack">
        <div>
          <p className="small muted">{found.device.name}</p>
          <h1>{found.restaurant.name}</h1>
        </div>
        {team.length === 0 ? (
          <p className="muted">Nessuno ha ancora un PIN. Il titolare o un responsabile può crearli nella pagina Team.</p>
        ) : (
          <Keypad team={team} />
        )}
      </div>
      <p className="small muted">
        Titolare o responsabile senza PIN? <Link href="/accedi">Accedi con email e password</Link>
      </p>
    </main>
  );
}
