import "server-only";
import { desc, eq, lt } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { sendEmail } from "./email";

export const CAREER_ROLES = [
  "Sviluppo software",
  "Vendite e rapporto con i ristoranti",
  "Assistenza clienti",
  "Avvio in sala (formazione dei ristoranti)",
  "Design",
  "Marketing",
  "Altro",
] as const;

export const CV_MAX_MB = 4;
export const CV_RETENTION_MONTHS = 12;

/**
 * What a CV file really is, from its first bytes rather than its name or the type the browser claims: PDF, Word
 * (.docx, a zip) or old Word (.doc). Anything else is refused.
 */
export function cvKind(bytes: Buffer): { type: string; ext: string } | null {
  if (bytes.subarray(0, 5).toString("latin1") === "%PDF-") return { type: "application/pdf", ext: "pdf" };
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    return { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: "docx" };
  }
  if (bytes.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) return { type: "application/msword", ext: "doc" };
  return null;
}

/** People allowed to read applications: the logged-in emails listed in ADMIN_EMAILS (comma separated). */
export function isCareersAdmin(email: string | null | undefined) {
  if (!email) return false;
  const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return admins.includes(email.toLowerCase());
}

type Application = Omit<typeof schema.jobApplications.$inferInsert, "id" | "createdAt">;

/** Saves an application and emails it, CV attached, to CAREERS_EMAIL when set. */
export async function saveApplication(a: Application) {
  const db = await getDb();
  const [row] = await db.insert(schema.jobApplications).values(a).returning({ id: schema.jobApplications.id });
  const to = process.env.CAREERS_EMAIL;
  if (to) {
    await sendEmail({
      to,
      replyTo: a.email,
      subject: `Candidatura: ${a.name} · ${a.role}`,
      text: [
        `Nuova candidatura per: ${a.role}`,
        ``,
        `Nome: ${a.name}`,
        `Email: ${a.email}`,
        ...(a.phone ? [`Telefono: ${a.phone}`] : []),
        ...(a.city ? [`Città: ${a.city}`] : []),
        ...(a.link ? [`Link: ${a.link}`] : []),
        ``,
        a.message || "(nessun messaggio)",
        ``,
        `Il CV è allegato. Rispondi a questa email per scrivere direttamente a ${a.name}.`,
      ].join("\n"),
      attachments: [{ filename: a.cvName, content: a.cv }],
    });
  }
  return row.id;
}

export async function listApplications() {
  const db = await getDb();
  const a = schema.jobApplications;
  return db
    .select({ id: a.id, name: a.name, email: a.email, phone: a.phone, role: a.role, city: a.city, link: a.link, message: a.message, cvName: a.cvName, createdAt: a.createdAt })
    .from(a)
    .orderBy(desc(a.createdAt));
}

export async function getCv(id: string) {
  const db = await getDb();
  const a = schema.jobApplications;
  const [row] = await db.select({ name: a.cvName, type: a.cvType, cv: a.cv }).from(a).where(eq(a.id, id));
  return row ?? null;
}

export async function deleteApplication(id: string) {
  const db = await getDb();
  await db.delete(schema.jobApplications).where(eq(schema.jobApplications.id, id));
}

/** Applications are kept a year at most (see the notice on the page), then deleted by the morning job. */
export async function deleteOldApplications() {
  const db = await getDb();
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - CV_RETENTION_MONTHS);
  const gone = await db.delete(schema.jobApplications).where(lt(schema.jobApplications.createdAt, cutoff)).returning({ id: schema.jobApplications.id });
  return gone.length;
}
