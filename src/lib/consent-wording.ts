// The exact sentences guests agree to, shared by the forms that show them and the server that stores them,
// so what's recorded as consent is word for word what the guest saw.

export const profileWording = (restaurant: string) =>
  `Ricordati di me: ${restaurant} conserva le mie visite, preferenze e allergie per accogliermi meglio le prossime volte. Posso cancellarmi quando voglio.`;

export const marketingWording = (restaurant: string) => `Voglio ricevere offerte e novità da ${restaurant}.`;

/** How long data is kept, stated in the privacy notice and applied by the daily cleanup. */
export const RETENTION = { bookingMonths: 12, profileMonths: 24 };
