"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { createGuestLink, eraseGuest, guestFor, resolveGuestLink, setMarketing } from "@/lib/consent";
import { sendEmail } from "@/lib/email";
import { getReservationByToken } from "@/lib/restaurant";
import { nowIn } from "@/lib/time";
import { appUrl } from "@/lib/url";

export type PrivacyResult = { error?: string; ok?: string } | null;

/** "giulia@example.com" → "g•••@example.com": enough to recognise, not to reveal. */
const mask = (email: string) => email.replace(/^(.)[^@]*(@.*)$/, "$1•••$2");

/** From a booking page: the guest who said no at booking time says yes now. */
export async function rememberFromBooking(_: PrivacyResult, data: FormData): Promise<PrivacyResult> {
  const row = await getReservationByToken(String(data.get("token") ?? ""));
  if (!row) return { error: "Prenotazione non trovata." };
  const { reservation: b, restaurant: r } = row;
  if (b.guestId) return { ok: "La tua scheda c’è già." };
  const db = await getDb();
  const guestId = await guestFor(db, r, b, {
    profile: true,
    marketing: data.get("marketing") === "on",
    source: "guest_link",
  });
  if (!guestId) return { error: "Per ricordarti serve un telefono o un’email nella prenotazione." };
  await db.update(schema.reservations).set({ guestId, updatedAt: new Date() }).where(eq(schema.reservations.id, b.id));
  revalidatePath(`/p/${r.slug}`, "layout");
  return { ok: `Fatto: ${r.name} si ricorderà di te. Puoi cancellarti quando vuoi da questa pagina.` };
}

/**
 * From a booking page: emails a private link to the address on the guest's profile. Never to the address on
 * the booking, which anyone could have typed: only the profile's owner can open what's kept about them.
 */
export async function requestGuestLink(_: PrivacyResult, data: FormData): Promise<PrivacyResult> {
  const row = await getReservationByToken(String(data.get("token") ?? ""));
  if (!row?.reservation.guestId) return { error: "Questa prenotazione non è collegata a una scheda." };
  const { reservation: b, restaurant: r } = row;
  const db = await getDb();
  const [guest] = await db.select().from(schema.guests).where(eq(schema.guests.id, b.guestId!));
  if (!guest?.email) {
    return { error: `La tua scheda non ha un’email a cui mandare il link. Scrivi a ${r.notifyEmail} per vedere o cancellare i tuoi dati.` };
  }
  const token = await createGuestLink(guest.id);
  const link = `${await appUrl()}/privacy/${token}`;
  after(() =>
    sendEmail({
      to: guest.email,
      replyTo: r.notifyEmail,
      subject: `I tuoi dati presso ${r.name}`,
      text: [
        `Ciao ${guest.name},`,
        ``,
        `da questo link puoi vedere, scaricare o cancellare i dati che ${r.name} conserva su di te, e scegliere se ricevere offerte.`,
        `Il link vale 24 ore:`,
        link,
        ``,
        `Se non l’hai chiesto tu, ignora questa email: nessuno può vedere i tuoi dati senza questo link.`,
      ].join("\n"),
    }),
  );
  return { ok: `Ti abbiamo mandato un link a ${mask(guest.email)}. Vale 24 ore.` };
}

export async function setMyMarketing(data: FormData) {
  const token = String(data.get("token") ?? "");
  const row = await resolveGuestLink(token);
  if (!row) redirect("/privacy/fatto?scaduto=1");
  await setMarketing(row.guest.id, data.get("on") === "1", "guest_link", row.restaurant.name);
  revalidatePath(`/privacy/${token}`);
  redirect(`/privacy/${token}`);
}

/** The guest withdraws consent and is forgotten: profile and consent records deleted, past bookings anonymised. */
export async function forgetMe(data: FormData) {
  const row = await resolveGuestLink(String(data.get("token") ?? ""));
  if (!row) redirect("/privacy/fatto?scaduto=1");
  await eraseGuest(row.restaurant.id, row.guest.id, nowIn(row.restaurant.timezone).date);
  redirect(`/privacy/fatto?ristorante=${encodeURIComponent(row.restaurant.name)}`);
}
