"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import type { ActionResult } from "@/components/ActionForm";
import { endSession, getDevice, startTabletSession } from "@/lib/auth";
import { checkPin } from "@/lib/pins";

/** On an authorised room tablet: the chosen team member types their PIN and is in. */
export async function pinLogin(_: ActionResult, data: FormData): Promise<ActionResult> {
  const found = await getDevice();
  if (!found) return { error: "Questo dispositivo non è più autorizzato." };
  const memberId = z.uuid().safeParse(data.get("member"));
  if (!memberId.success) return { error: "Scegli il tuo nome." };
  const db = await getDb();
  const [member] = await db
    .select()
    .from(schema.members)
    .where(and(eq(schema.members.id, memberId.data), eq(schema.members.restaurantId, found.restaurant.id)));
  if (!member) return { error: "Non fai più parte del team." };
  const result = await checkPin(member, String(data.get("pin") ?? ""));
  if (!result.ok) return { error: result.error };
  await startTabletSession(member.userId, found.restaurant.id, found.device.id);
  revalidatePath("/", "layout");
  redirect("/app");
}

/** Locks the tablet: whoever was working steps out, and the keypad comes back for the next person. */
export async function lockTablet() {
  await endSession();
  revalidatePath("/", "layout");
  redirect("/sala");
}
