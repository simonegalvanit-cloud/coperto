import "server-only";
import { notFound } from "next/navigation";
import { asc, desc, eq, gte, ilike, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { isAdmin } from "./admin-emails";
import { billingState, isPlan, monthlyValue, PLANS } from "./billing";
import { getCurrentUser } from "./auth";

export { isAdmin };

/**
 * For every admin page and action. Anyone else — logged out, a restaurant owner, a room tablet — gets "page not
 * found", so the panel doesn't even show that it exists.
 */
export async function requireAdmin() {
  // The login, not the restaurant: Coperto's staff don't need a restaurant of their own.
  const user = await getCurrentUser();
  if (!user || user.onTablet || !isAdmin(user.email)) notFound();
  return { id: user.id, email: user.email!, name: user.name };
}

/** Records what an admin looked at or did, e.g. ("Ha aperto il ristorante", "Osteria Bella"). */
export async function logAdmin(admin: { id: string; email: string }, action: string, target = "") {
  const db = await getDb();
  await db.insert(schema.adminLog).values({ adminId: admin.id, adminEmail: admin.email, action, target: target.slice(0, 200) });
}

const like = (q: string) => `%${q.replace(/[%_\\]/g, "\\$&")}%`;
const n = (v: unknown) => Number(v ?? 0);

export async function overview(today: string) {
  const db = await getDb();
  const [row] = await db.execute<Record<string, unknown>>(sql`
    select
      (select count(*) from ${schema.restaurants}) as restaurants,
      (select count(*) from ${schema.restaurants} where created_at > now() - interval '7 days') as new7,
      (select count(*) from ${schema.restaurants} where created_at > now() - interval '30 days') as new30,
      (select count(distinct restaurant_id) from ${schema.reservations} where created_at > now() - interval '7 days') as active7,
      (select count(*) from ${schema.users}) as users,
      (select count(*) from ${schema.reservations} where date = ${today} and status in ('confirmed', 'seated', 'completed')) as today,
      (select count(*) from ${schema.reservations} where created_at >= date_trunc('month', now())) as month,
      (select count(*) from ${schema.reservations} where created_at >= date_trunc('month', now()) and source = 'online') as month_online,
      (select count(*) from ${schema.guests} where profile_consent_at is not null) as guests,
      (select count(*) from ${schema.jobApplications}) as applications,
      (select count(*) from ${schema.restaurants} where terms_version is null) as no_terms
  `);
  return {
    restaurants: n(row.restaurants),
    new7: n(row.new7),
    new30: n(row.new30),
    active7: n(row.active7),
    users: n(row.users),
    today: n(row.today),
    month: n(row.month),
    monthOnline: n(row.month_online),
    guests: n(row.guests),
    applications: n(row.applications),
    noTerms: n(row.no_terms),
  };
}

/** Restaurants, newest first, with their owner and a few numbers; `q` searches name, city, address and owner email. */
export async function listRestaurants(q: string, limit = 100) {
  const db = await getDb();
  const r = schema.restaurants;
  const u = schema.users;
  return db
    .select({
      id: r.id,
      name: r.name,
      city: r.city,
      slug: r.slug,
      createdAt: r.createdAt,
      bookingOpen: r.bookingOpen,
      termsAccepted: sql<boolean>`${r.termsVersion} is not null`,
      trialEndsAt: r.trialEndsAt,
      plan: r.plan,
      billingInterval: r.billingInterval,
      subscriptionStatus: r.subscriptionStatus,
      currentPeriodEnd: r.currentPeriodEnd,
      cancelAtPeriodEnd: r.cancelAtPeriodEnd,
      compUntil: r.compUntil,
      ownerName: u.name,
      ownerEmail: u.email,
      team: sql<number>`(select count(*)::int from ${schema.members} m where m.restaurant_id = ${r.id})`,
      tables: sql<number>`(select count(*)::int from ${schema.diningTables} t where t.restaurant_id = ${r.id})`,
      bookings: sql<number>`(select count(*)::int from ${schema.reservations} b where b.restaurant_id = ${r.id})`,
      lastBooking: sql<Date | null>`(select max(b.created_at) from ${schema.reservations} b where b.restaurant_id = ${r.id})`,
    })
    .from(r)
    .innerJoin(u, eq(u.id, r.ownerId))
    .where(q ? or(ilike(r.name, like(q)), ilike(r.city, like(q)), ilike(r.slug, like(q)), ilike(r.address, like(q)), ilike(u.email, like(q))) : undefined)
    .orderBy(desc(r.createdAt))
    .limit(limit);
}

/** Everything support needs to understand a restaurant's situation, read-only. */
export async function restaurantDetail(id: string, today: string) {
  const db = await getDb();
  const r = schema.restaurants;
  const [row] = await db
    .select({ restaurant: r, ownerName: schema.users.name, ownerEmail: schema.users.email })
    .from(r)
    .innerJoin(schema.users, eq(schema.users.id, r.ownerId))
    .where(eq(r.id, id));
  if (!row) return null;
  const res = schema.reservations;
  const [team, invites, hours, recent, devices, [counts]] = await Promise.all([
    db
      .select({
        name: schema.users.name,
        email: schema.users.email,
        role: schema.members.role,
        since: schema.members.createdAt,
        hasPin: sql<boolean>`${schema.members.pinHash} is not null`,
      })
      .from(schema.members)
      .innerJoin(schema.users, eq(schema.users.id, schema.members.userId))
      .where(eq(schema.members.restaurantId, id))
      .orderBy(asc(schema.members.createdAt)),
    db.select({ email: schema.invites.email, role: schema.invites.role, expiresAt: schema.invites.expiresAt }).from(schema.invites).where(eq(schema.invites.restaurantId, id)),
    db.select().from(schema.serviceHours).where(eq(schema.serviceHours.restaurantId, id)).orderBy(asc(schema.serviceHours.weekday), asc(schema.serviceHours.startTime)),
    db
      .select({ date: res.date, time: res.time, partySize: res.partySize, status: res.status, source: res.source, guestName: res.guestName, createdAt: res.createdAt })
      .from(res)
      .where(eq(res.restaurantId, id))
      .orderBy(desc(res.createdAt))
      .limit(20),
    db.select({ name: schema.devices.name, createdAt: schema.devices.createdAt, lastUsedAt: schema.devices.lastUsedAt }).from(schema.devices).where(eq(schema.devices.restaurantId, id)),
    db.execute<Record<string, unknown>>(sql`
      select
        (select count(*) from ${res} where restaurant_id = ${id}) as total,
        (select count(*) from ${res} where restaurant_id = ${id} and created_at > now() - interval '30 days') as last30,
        (select count(*) from ${res} where restaurant_id = ${id} and created_at > now() - interval '30 days' and source = 'online') as online30,
        (select count(*) from ${res} where restaurant_id = ${id} and date >= ${today} and status in ('confirmed', 'seated')) as upcoming,
        (select count(*) from ${res} where restaurant_id = ${id} and status = 'no_show') as no_shows,
        (select count(*) from ${schema.guests} where restaurant_id = ${id} and profile_consent_at is not null) as guests,
        (select count(*) from ${schema.guests} where restaurant_id = ${id} and profile_consent_at is null) as legacy_guests,
        (select count(*) from ${schema.diningTables} where restaurant_id = ${id}) as tables,
        (select count(*) from ${schema.floors} where restaurant_id = ${id}) as floors,
        (select count(*) from ${schema.closures} where restaurant_id = ${id} and date >= ${today}) as closures
    `),
  ]);
  return {
    ...row,
    team,
    invites,
    hours,
    recent,
    devices,
    counts: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, n(v)])) as Record<string, number>,
  };
}

/** People with a Coperto login (or a PIN), newest first; `q` searches name and email. */
export async function listUsers(q: string, limit = 100) {
  const db = await getDb();
  const u = schema.users;
  return db
    .select({
      id: u.id,
      name: u.name,
      email: u.email,
      createdAt: u.createdAt,
      hasPassword: sql<boolean>`${u.passwordHash} is not null`,
      teams: sql<string>`coalesce((
        select string_agg(r.name || ' · ' || case m.role when 'owner' then 'Titolare' when 'manager' then 'Responsabile' else 'Sala' end, ', ' order by m.created_at)
        from ${schema.members} m join ${schema.restaurants} r on r.id = m.restaurant_id where m.user_id = "users"."id"
      ), '')`,
      // Written out as "users"."id": in a query on one table Drizzle leaves the table name off, and inside these
      // subqueries a bare "id" would be ambiguous.
      sessions: sql<number>`(select count(*)::int from ${schema.sessions} s where s.user_id = "users"."id" and s.expires_at > now())`,
    })
    .from(u)
    .where(q ? or(ilike(u.name, like(q)), ilike(u.email, like(q))) : undefined)
    .orderBy(desc(u.createdAt))
    .limit(limit);
}

export async function getUser(id: string) {
  const db = await getDb();
  const [user] = await db.select({ id: schema.users.id, name: schema.users.name, email: schema.users.email }).from(schema.users).where(eq(schema.users.id, id));
  return user ?? null;
}

export async function recentLog(limit = 200) {
  const db = await getDb();
  return db.select().from(schema.adminLog).orderBy(desc(schema.adminLog.createdAt)).limit(limit);
}

/** Housekeeping numbers for the system page. */
export async function systemCounts() {
  const db = await getDb();
  const now = new Date();
  const [[sessions], [tablets], [resets], [guestLinks]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(schema.sessions).where(gte(schema.sessions.expiresAt, now)),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.devices),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.passwordResets).where(gte(schema.passwordResets.expiresAt, now)),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.guestTokens).where(gte(schema.guestTokens.expiresAt, now)),
  ]);
  return { sessions: sessions.n, tablets: tablets.n, resets: resets.n, guestLinks: guestLinks.n };
}

// ---------- Revenue ----------

/**
 * Where the money stands, from the restaurants' subscriptions (what's recurring) and Stripe's invoices (what
 * was actually collected). Amounts in cents, before IVA.
 */
export async function revenue() {
  const db = await getDb();
  const r = schema.restaurants;
  const p = schema.payments;
  const [rows, months, recent, [totals]] = await Promise.all([
    db
      .select({
        id: r.id,
        name: r.name,
        createdAt: r.createdAt,
        trialEndsAt: r.trialEndsAt,
        plan: r.plan,
        billingInterval: r.billingInterval,
        subscriptionStatus: r.subscriptionStatus,
        currentPeriodEnd: r.currentPeriodEnd,
        cancelAtPeriodEnd: r.cancelAtPeriodEnd,
        compUntil: r.compUntil,
      })
      .from(r),
    db.execute<{ month: string; net: number; tax: number; count: number }>(sql`
      select to_char(date_trunc('month', created_at at time zone 'Europe/Rome'), 'YYYY-MM') as month,
             sum(amount_net)::int as net, sum(amount_tax)::int as tax, count(*)::int as count
      from ${p} where status = 'paid' and created_at > now() - interval '12 months'
      group by 1 order by 1
    `),
    db.select().from(p).orderBy(desc(p.createdAt)).limit(50),
    db.execute<{ all_net: number; failed: number }>(sql`
      select coalesce(sum(amount_net) filter (where status = 'paid'), 0)::int as all_net,
             count(*) filter (where status = 'failed')::int as failed
      from ${p}
    `),
  ]);
  const now = new Date();
  const byState = { trial: 0, comp: 0, active: 0, past_due: 0, expired: 0 };
  const byPlan: Record<string, { count: number; mrr: number }> = { banco: { count: 0, mrr: 0 }, sala: { count: 0, mrr: 0 } };
  let mrr = 0;
  // Counted from the real prices: twelve times a rounded monthly figure would be off by a few cents.
  let arr = 0;
  let cancelling = 0;
  let yearly = 0;
  let trialsEnded90 = 0;
  let converted90 = 0;
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 86_400_000);
  for (const x of rows) {
    const s = billingState(x, now);
    byState[s.kind]++;
    if (s.kind === "active" || s.kind === "past_due") {
      const value = monthlyValue(x.plan, x.billingInterval);
      mrr += value;
      arr += isPlan(x.plan) ? (x.billingInterval === "year" ? PLANS[x.plan].year : PLANS[x.plan].month * 12) : 0;
      byPlan[s.plan].count++;
      byPlan[s.plan].mrr += value;
      if (s.kind === "active" && s.cancelling) cancelling++;
      if (s.interval === "year") yearly++;
    }
    if (x.trialEndsAt < now && x.trialEndsAt > ninetyDaysAgo) {
      trialsEnded90++;
      if (x.subscriptionStatus) converted90++;
    }
  }
  return {
    mrr,
    arr,
    byState,
    byPlan,
    cancelling,
    yearly,
    canceled: rows.filter((x) => x.subscriptionStatus === "canceled").length,
    trialsEnded90,
    converted90,
    months: months.map((m) => ({ month: m.month, net: Number(m.net), tax: Number(m.tax), count: Number(m.count) })),
    recent,
    collectedAllTime: Number(totals.all_net),
    failedCount: Number(totals.failed),
  };
}

/** Payments for the accountant, with the invoice details an Italian e-invoice needs. */
export async function paymentsForYear(year: number) {
  const db = await getDb();
  const p = schema.payments;
  return db
    .select()
    .from(p)
    .where(sql`extract(year from ${p.createdAt} at time zone 'Europe/Rome') = ${year}`)
    .orderBy(p.createdAt);
}
