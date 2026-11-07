"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/components/ActionForm";
import { getUser, logAdmin, requireAdmin } from "@/lib/admin";
import { sendPasswordReset } from "@/lib/team";

/** Emails someone the usual one-hour link to set a new password: for "I can't log in" calls. */
export async function sendResetLink(_: ActionResult, data: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const id = z.uuid().safeParse(data.get("id"));
  const user = id.success ? await getUser(id.data) : null;
  if (!user) return { error: "Utente non trovato." };
  if (!user.email) return { error: `${user.name} entra solo con il PIN: un nuovo PIN glielo dà il titolare dalla pagina Team.` };
  await sendPasswordReset(user.email);
  await logAdmin(admin, "Ha mandato il link per una nuova password", user.email);
  revalidatePath("/admin/registro");
  return { ok: `Link mandato a ${user.email} (vale un’ora; al massimo uno ogni due minuti).` };
}
