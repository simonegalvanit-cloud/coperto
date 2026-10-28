import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConfirmButton } from "@/components/ConfirmButton";
import { getReservationByToken } from "@/lib/restaurant";
import { capitalize, daysBetween, formatDate, nowIn, toMinutes } from "@/lib/time";
import { cancelBooking, confirmPresence } from "../../actions";
import { PublicShell } from "../../PublicShell";
import { PrivacyBox } from "./PrivacyBox";

export const metadata: Metadata = { title: "La tua prenotazione", robots: { index: false } };

export default async function ManageBookingPage({ params, searchParams }: PageProps<"/p/[slug]/prenotazione/[token]">) {
  const [{ slug, token }, sp] = await Promise.all([params, searchParams]);
  const row = await getReservationByToken(token);
  if (!row || row.restaurant.slug !== slug) notFound();
  const { reservation: b, restaurant: r } = row;
  const embed = sp.embed === "1";
  const now = nowIn(r.timezone);
  const upcoming = daysBetween(now.date, b.date) * 1440 + toMinutes(b.time) > now.minutes;
  const cancelled = b.status === "cancelled";

  return (
    <PublicShell r={r} embed={embed}>
      <div>
        <h2 style={{ fontSize: 28 }}>
          {cancelled ? "Prenotazione cancellata" : upcoming ? "Prenotazione confermata" : "La tua prenotazione"}
        </h2>
        <p className="muted" style={{ marginTop: 6 }}>
          {cancelled
            ? "Il tavolo è stato liberato. Grazie per averci avvisato."
            : upcoming
              ? `Ti abbiamo mandato una conferma a ${b.guestEmail || "la tua email"}. Ti aspettiamo.`
              : ""}
        </p>
      </div>
      <div className="ticket" style={cancelled ? { opacity: 0.6 } : undefined}>
        <div className="wide">
          <small>Data</small>
          <strong className="big">{capitalize(formatDate(b.date, { year: true }))}</strong>
        </div>
        <div>
          <small>Ora</small>
          <strong className="big">{b.time}</strong>
        </div>
        <div>
          <small>Persone</small>
          <strong className="big num">{b.partySize}</strong>
        </div>
        <div className="wide">
          <small>A nome di</small>
          <strong>{b.guestName}</strong>
        </div>
        {b.notes && (
          <div className="wide">
            <small>Note</small>
            <strong style={{ fontWeight: 500 }}>{b.notes}</strong>
          </div>
        )}
      </div>
      {b.status === "confirmed" && upcoming && (
        <form action={confirmPresence} className="stack">
          <input type="hidden" name="token" value={token} />
          {embed && <input type="hidden" name="embed" value="1" />}
          {b.guestConfirmedAt ? (
            <p className="form-ok">Hai confermato che ci sarai. Grazie, ti aspettiamo.</p>
          ) : (
            <div>
              <button type="submit" className="btn btn-fill">Ci sarò</button>
            </div>
          )}
        </form>
      )}
      {b.status === "confirmed" && upcoming && (
        <form action={cancelBooking} className="stack">
          <input type="hidden" name="token" value={token} />
          {embed && <input type="hidden" name="embed" value="1" />}
          <p className="small muted">Non puoi più venire? Cancella qui, così il tavolo torna libero per qualcun altro.</p>
          <div>
            <ConfirmButton className="btn btn-danger" question="Vuoi davvero cancellare la prenotazione? Il tavolo tornerà libero per altri." confirmLabel="Sì, cancella">Cancella la prenotazione</ConfirmButton>
          </div>
        </form>
      )}
      {(cancelled || !upcoming) && (
        <p>
          <a className="btn" href={`/p/${r.slug}${embed ? "?embed=1" : ""}`}>Prenota di nuovo</a>
        </p>
      )}
      {(b.guestId || (!cancelled && (b.guestPhone || b.guestEmail))) && (
        <PrivacyBox token={token} linked={!!b.guestId} restaurant={r.name} slug={r.slug} />
      )}
    </PublicShell>
  );
}
