"use server";

import { z } from "zod";
import { CAREER_ROLES, CV_MAX_MB, cvKind, saveApplication } from "@/lib/careers";

export type ApplyResult = { error?: string; field?: string; ok?: boolean } | null;

const applySchema = z.object({
  name: z.string().trim().min(2, "Scrivi nome e cognome.").max(120),
  email: z.email("Controlla l’email: ti rispondiamo lì.").trim().toLowerCase(),
  phone: z.string().trim().max(40),
  role: z.enum(CAREER_ROLES, "Scegli il ruolo che ti interessa."),
  city: z.string().trim().max(80),
  link: z.union([z.literal(""), z.url("Il link deve iniziare con https://").max(300)]),
  message: z.string().trim().max(3000, "Il messaggio può avere al massimo 3000 caratteri."),
  privacy: z.literal("on", "Per candidarti serve il consenso al trattamento dei dati."),
});

/** A spontaneous application from the "Lavora con noi" page, CV included. */
export async function apply(_: ApplyResult, data: FormData): Promise<ApplyResult> {
  // Bots fill every field; people never see this one.
  if (data.get("website")) return { error: "Qualcosa è andato storto. Riprova." };
  const fields = Object.fromEntries([...data.entries()].filter(([k, v]) => k !== "cv" && typeof v === "string"));
  const parsed = applySchema.safeParse({ phone: "", city: "", link: "", message: "", ...fields });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: issue.message, field: String(issue.path[0]) };
  }
  const file = data.get("cv");
  if (!(file instanceof File) || file.size === 0) return { error: "Allega il tuo CV.", field: "cv" };
  if (file.size > CV_MAX_MB * 1024 * 1024) return { error: `Il CV può pesare al massimo ${CV_MAX_MB} MB.`, field: "cv" };
  const bytes = Buffer.from(await file.arrayBuffer());
  const kind = cvKind(bytes);
  if (!kind) return { error: "Il CV deve essere un PDF o un documento Word (.doc, .docx).", field: "cv" };

  // The consent box only has to be ticked; what's stored is the application itself.
  const { name, email, phone, role, city, link, message } = parsed.data;
  const a = { name, email, phone, role, city, link, message };
  // A clean file name: the person's name and the real format, whatever the file was called.
  const cvName = `CV ${a.name.replace(/[^\p{L}\p{N} '-]/gu, "").trim().slice(0, 60) || "candidato"}.${kind.ext}`;
  await saveApplication({ ...a, cvName, cvType: kind.type, cv: bytes });
  return { ok: true };
}
