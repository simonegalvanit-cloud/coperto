/**
 * Coperto's own details, used by the legal pages and emails. The ones in square brackets must be filled in
 * before launch.
 */
export const COMPANY = {
  name: "Coperto S.r.l.",
  vat: "00774429441",
  address: "[sede legale da completare]",
  email: "[email di contatto da completare]",
  pec: "[PEC da completare]",
};

/** Bump when the Terms of Service or the data processing agreement change: owners are asked to accept again. */
export const TERMS_VERSION = "2026-11-05";
export const TERMS_DATE = "5 novembre 2026";

/** Where Coperto's service providers keep data (sub-processors), as listed in the DPA and privacy policy. */
export const SUBPROCESSORS = [
  { name: "Vercel Inc.", what: "Hosting dell’applicazione", where: "Server in UE (Francoforte); società negli USA, trasferimenti coperti da Clausole contrattuali tipo e Data Privacy Framework" },
  { name: "Supabase Inc.", what: "Database", where: "Server nella regione scelta in UE; società negli USA, trasferimenti coperti da Clausole contrattuali tipo" },
  { name: "Resend (Plus Five Five Inc.)", what: "Invio delle email (conferme, promemoria, link)", where: "USA, trasferimenti coperti da Clausole contrattuali tipo" },
];
