import { resolveGuestLink } from "@/lib/consent";
import { guestData } from "@/lib/guest-data";

/** The guest's data as a JSON file, from their private link (GDPR art. 15 and 20). */
export async function GET(_: Request, { params }: RouteContext<"/privacy/[token]/download">) {
  const row = await resolveGuestLink((await params).token);
  if (!row) return new Response("Link scaduto o non valido.", { status: 404 });
  const { guest, bookings, consents } = await guestData(row.guest.id);
  const body = {
    ristorante: { nome: row.restaurant.name, email: row.restaurant.notifyEmail },
    ospite: {
      nome: guest.name,
      telefono: guest.phone,
      email: guest.email,
      allergie: guest.allergies,
      noteDelRistorante: guest.notes,
      compleanno: guest.birthday,
      anniversario: guest.anniversary,
      vip: guest.vip,
      ricordatoDal: guest.profileConsentAt,
      offerteDal: guest.marketingConsentAt,
    },
    prenotazioni: bookings,
    consensi: consents.map((c) => ({ quando: c.createdAt, tipo: c.kind, azione: c.action, come: c.source, testo: c.wording })),
  };
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="i-miei-dati-${row.restaurant.slug}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
