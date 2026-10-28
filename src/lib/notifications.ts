import "server-only";
import type { Reservation, Restaurant } from "@/db/schema";
import { sendEmail } from "./email";
import { formatDate } from "./time";
import { appUrl } from "./url";

const people = (n: number) => (n === 1 ? "1 persona" : `${n} persone`);

export async function emailGuestConfirmation(r: Restaurant, b: Reservation) {
  if (!b.guestEmail) return;
  const link = `${await appUrl()}/p/${r.slug}/prenotazione/${b.manageToken}`;
  await sendEmail({
    to: b.guestEmail,
    replyTo: r.notifyEmail,
    subject: `Prenotazione confermata: ${r.name}, ${formatDate(b.date)} alle ${b.time}`,
    text: [
      `Ciao ${b.guestName},`,
      ``,
      `la tua prenotazione da ${r.name} è confermata.`,
      ``,
      `${formatDate(b.date, { year: true })}, ore ${b.time}`,
      `${people(b.partySize)}`,
      r.address ? `${r.address}${r.city ? `, ${r.city}` : ""}` : "",
      ``,
      `Se non puoi più venire, cancella qui così liberi il tavolo:`,
      link,
      ``,
      r.phone ? `Per qualsiasi cosa: ${r.phone}` : "",
    ]
      .filter((line, i, all) => line !== "" || all[i - 1] !== "")
      .join("\n"),
  });
}

export async function emailRestaurantNewBooking(r: Restaurant, b: Reservation) {
  await sendEmail({
    to: r.notifyEmail,
    subject: `Nuova prenotazione: ${b.guestName}, ${people(b.partySize)}, ${formatDate(b.date)} ${b.time}`,
    text: [
      `${b.guestName} ha prenotato online.`,
      ``,
      `${formatDate(b.date, { year: true })}, ore ${b.time}, ${people(b.partySize)}`,
      b.guestPhone ? `Telefono: ${b.guestPhone}` : "",
      b.guestEmail ? `Email: ${b.guestEmail}` : "",
      b.notes ? `Note: ${b.notes}` : "",
      ``,
      `${await appUrl()}/app?data=${b.date}`,
    ]
      .filter(Boolean)
      .join("\n"),
  });
}

export async function emailCancellation(r: Restaurant, b: Reservation, cancelledBy: "guest" | "restaurant") {
  if (cancelledBy === "guest") {
    await sendEmail({
      to: r.notifyEmail,
      subject: `Cancellata: ${b.guestName}, ${people(b.partySize)}, ${formatDate(b.date)} ${b.time}`,
      text: `${b.guestName} ha cancellato la prenotazione di ${formatDate(b.date)} alle ${b.time} (${people(b.partySize)}). Il tavolo è di nuovo prenotabile.`,
    });
  }
  if (b.guestEmail) {
    await sendEmail({
      to: b.guestEmail,
      replyTo: r.notifyEmail,
      subject: `Prenotazione cancellata: ${r.name}, ${formatDate(b.date)}`,
      text: `Ciao ${b.guestName},\n\nla tua prenotazione da ${r.name} di ${formatDate(b.date)} alle ${b.time} è stata cancellata.${r.phone ? `\n\nPer qualsiasi cosa: ${r.phone}` : ""}`,
    });
  }
}
