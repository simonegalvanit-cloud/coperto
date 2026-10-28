import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getClosures, getOnlineZones, getRestaurantBySlug, getServiceHours } from "@/lib/restaurant";
import { addDays, nowIn, weekdayOf } from "@/lib/time";
import { BookingFlow } from "./BookingFlow";
import { PublicShell } from "./PublicShell";

export async function generateMetadata({ params }: PageProps<"/p/[slug]">): Promise<Metadata> {
  const r = await getRestaurantBySlug((await params).slug);
  return r ? { title: `Prenota da ${r.name}`, description: `Prenota un tavolo da ${r.name}${r.city ? `, ${r.city}` : ""}.` } : {};
}

export default async function BookingPage({ params, searchParams }: PageProps<"/p/[slug]">) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const r = await getRestaurantBySlug(slug);
  if (!r) notFound();
  const embed = sp.embed === "1";

  if (!r.bookingOpen) {
    return (
      <PublicShell r={r} embed={embed}>
        <div className="panel">
          <p>Al momento le prenotazioni online sono chiuse.{r.phone && <> Chiama il ristorante al <a href={`tel:${r.phone}`}>{r.phone}</a>.</>}</p>
        </div>
      </PublicShell>
    );
  }

  // Which upcoming days have any service and aren't closed, so the date picker can grey out the rest.
  const [hours, closures, zones] = await Promise.all([getServiceHours(r.id), getClosures(r.id), getOnlineZones(r.id)]);
  const today = nowIn(r.timezone).date;
  const openWeekdays = new Set(hours.map((h) => h.weekday));
  const closed = new Set(closures.map((c) => c.date));
  const days = Array.from({ length: r.maxDaysAhead + 1 }, (_, i) => addDays(today, i)).map((date) => ({
    date,
    open: openWeekdays.has(weekdayOf(date)) && !closed.has(date),
  }));

  return (
    <PublicShell r={r} embed={embed}>
      <BookingFlow slug={r.slug} embed={embed} days={days} zones={zones.length > 1 ? zones : []} maxPartySize={r.maxPartySize} phone={r.phone} restaurantName={r.name} />
    </PublicShell>
  );
}
