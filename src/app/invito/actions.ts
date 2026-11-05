"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { ActionResult } from "@/components/ActionForm";
import { hashPassword, startSession, verifyPassword } from "@/lib/auth";
import { resolveInvite } from "@/lib/team";

/**
 * Accepts an invitation. The link went to the invited address, so opening it proves the email: a new person
 * picks a name and password; someone who already has a Coperto account (on another team) confirms with theirs.
 */
export async function acceptInvite(_: ActionResult, data: FormData): Promise<ActionResult> {
  const found = await resolveInvite(String(data.get("token") ?? ""));
  if (!found) return { error: "Questo invito non è più valido: chiedi di mandartene un altro." };
  const { invite, restaurant } = found;
  const password = String(data.get("password") ?? "");
  const db = await getDb();
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, invite.email));

  let userId: string;
  if (existing) {
    if (!existing.passwordHash || !(await verifyPassword(password, existing.passwordHash))) return { error: "Password non corretta." };
    userId = existing.id;
  } else {
    const name = String(data.get("name") ?? "").trim().slice(0, 80);
    if (name.length < 2) return { error: "Scrivi il tuo nome." };
    if (password.length < 8) return { error: "La password deve avere almeno 8 caratteri." };
    [{ id: userId }] = await db
      .insert(schema.users)
      .values({ email: invite.email, name, passwordHash: await hashPassword(password) })
      .returning({ id: schema.users.id });
  }
  await db.transaction(async (tx) => {
    await tx.insert(schema.members).values({ restaurantId: restaurant.id, userId, role: invite.role }).onConflictDoNothing();
    await tx.delete(schema.invites).where(eq(schema.invites.id, invite.id));
  });
  await startSession(userId, restaurant.id);
  revalidatePath("/", "layout");
  redirect("/app");
}
