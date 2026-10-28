"use client";

import { useActionState, useState } from "react";
import { marketingWording, profileWording } from "@/lib/consent-wording";
import { rememberFromBooking, requestGuestLink } from "@/app/privacy/actions";

/** On a booking page: opt in to being remembered later, or ask for the private link to one's data. */
export function PrivacyBox({ token, linked, restaurant, slug }: { token: string; linked: boolean; restaurant: string; slug: string }) {
  const [remembered, remember, remembering] = useActionState(rememberFromBooking, null);
  const [sent, sendLink, sending] = useActionState(requestGuestLink, null);
  const [tick, setTick] = useState(false);
  const privacy = <a href={`/p/${slug}/privacy`}>Informativa privacy</a>;

  if (!linked && !remembered?.ok) {
    return (
      <form action={remember} className="stack privacy-box" style={{ gap: 8 }}>
        <input type="hidden" name="token" value={token} />
        <h3>Vuoi che {restaurant} si ricordi di te?</h3>
        <p className="small muted">Così la prossima volta sapranno le tue preferenze e allergie. È facoltativo.</p>
        <label className="check check-top">
          <input type="checkbox" name="marketing" checked={tick} onChange={(e) => setTick(e.target.checked)} />
          <span>{marketingWording(restaurant)}</span>
        </label>
        <p className="small muted">{profileWording(restaurant)} {privacy}</p>
        {remembered?.error && <p className="form-error">{remembered.error}</p>}
        <div>
          <button type="submit" className="btn" disabled={remembering}>Sì, ricordati di me</button>
        </div>
      </form>
    );
  }

  return (
    <form action={sendLink} className="stack privacy-box" style={{ gap: 8 }}>
      <input type="hidden" name="token" value={token} />
      {remembered?.ok && <p className="form-ok">{remembered.ok}</p>}
      <h3>I tuoi dati</h3>
      <p className="small muted">
        {restaurant} ha una scheda con le tue visite e preferenze, perché hai scelto di farti ricordare. Puoi vederla, scaricarla o
        cancellarla: ti mandiamo un link privato all’email della scheda. {privacy}
      </p>
      {sent?.error && <p className="form-error">{sent.error}</p>}
      {sent?.ok ? (
        <p className="form-ok">{sent.ok}</p>
      ) : (
        <div>
          <button type="submit" className="btn btn-small" disabled={sending}>Gestisci i miei dati</button>
        </div>
      )}
    </form>
  );
}
