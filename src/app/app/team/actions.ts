"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, isNull, notExists, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import type { ActionResult } from "@/components/ActionForm";
import { authoriseDevice, endSession, hashPassword, requireAccount } from "@/lib/auth";
import { normalizeEmail } from "@/lib/contact";
import { assignableRoles, type MemberRole } from "@/lib/roles";
import { generatePin, setPin } from "@/lib/pins";
import { sendInvite } from "@/lib/team";

const inviteSchema = z.object({
  name: z.string().trim().min(1, "Scrivi il nome.").max(80),
  email: z.email("Controlla l’email.").trim(),
  role: z.enum(["manager", "staff"]),
});

/** The member a request is about, only if they're on this restaurant's team. */
async function memberHere(restaurantId: string, memberId: unknown) {
  const id = z.uuid().safeParse(memberId);
  if (!id.success) return null;
  const db = await getDb();
  const [m] = await db
    .select({ id: schema.members.id, userId: schema.members.userId, role: schema.members.role, name: schema.users.name })
    .from(schema.members)
    .innerJoin(schema.users, eq(schema.users.id, schema.members.userId))
    .where(and(eq(schema.members.id, id.data), eq(schema.members.restaurantId, restaurantId)));
  return m ?? null;
}

/** A manager can act on staff only; the owner on everyone but themselves. */
const mayManage = (me: MemberRole, them: MemberRole) => assignableRoles(me).includes(them);

export async function inviteMember(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { restaurant, role, user } = await requireAccount("team");
  const parsed = inviteSchema.safeParse(Object.fromEntries(data));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { name, role: newRole } = parsed.data;
  const email = normalizeEmail(parsed.data.email);
  if (!assignableRoles(role).includes(newRole)) return { error: "Solo il titolare può aggiungere responsabili." };

  const db = await getDb();
  const [already] = await db
    .select({ id: schema.members.id })
    .from(schema.members)
    .innerJoin(schema.users, eq(schema.users.id, schema.members.userId))
    .where(and(eq(schema.members.restaurantId, restaurant.id), eq(schema.users.email, email)));
  if (already) return { error: `${email} fa già parte del team.` };

  await sendInvite(restaurant, { email, name, role: newRole }, user);
  revalidatePath("/app/team");
  return { ok: `Invito mandato a ${email}. Vale 7 giorni.` };
}

export async function resendInvite(data: FormData) {
  const { restaurant, role, user } = await requireAccount("team");
  const db = await getDb();
  const [invite] = await db
    .select()
    .from(schema.invites)
    .where(and(eq(schema.invites.restaurantId, restaurant.id), eq(schema.invites.email, String(data.get("email") ?? ""))));
  if (!invite || !mayManage(role, invite.role)) return;
  await sendInvite(restaurant, invite, user);
  revalidatePath("/app/team");
}

export async function cancelInvite(data: FormData) {
  const { restaurant, role } = await requireAccount("team");
  const db = await getDb();
  const i = schema.invites;
  const [invite] = await db.select().from(i).where(and(eq(i.restaurantId, restaurant.id), eq(i.email, String(data.get("email") ?? ""))));
  if (!invite || !mayManage(role, invite.role)) return;
  await db.delete(i).where(eq(i.id, invite.id));
  revalidatePath("/app/team");
}

export async function changeRole(data: FormData) {
  const { restaurant, role } = await requireAccount("team");
  const member = await memberHere(restaurant.id, data.get("id"));
  const newRole = z.enum(["manager", "staff"]).safeParse(data.get("role"));
  if (!member || !newRole.success || !mayManage(role, member.role) || !mayManage(role, newRole.data)) return;
  const db = await getDb();
  await db.update(schema.members).set({ role: newRole.data }).where(eq(schema.members.id, member.id));
  revalidatePath("/app", "layout");
}

/** Takes someone off the team: they lose access to this restaurant at once, on every device. */
export async function removeMember(data: FormData) {
  const { restaurant, role } = await requireAccount("team");
  const member = await memberHere(restaurant.id, data.get("id"));
  if (!member || !mayManage(role, member.role)) return;
  const db = await getDb();
  await db.delete(schema.members).where(eq(schema.members.id, member.id));
  // Someone who only had a PIN here has nothing left to log in with: their account goes too.
  await db
    .delete(schema.users)
    .where(
      and(
        eq(schema.users.id, member.userId),
        isNull(schema.users.email),
        notExists(db.select({ one: sql`1` }).from(schema.members).where(eq(schema.members.userId, member.userId))),
      ),
    );
  revalidatePath("/app", "layout");
}

/**
 * The owner hands the restaurant to a manager: they become owner (and pay, once billing exists), the old owner
 * stays on as manager.
 */
export async function transferOwnership(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { restaurant, user } = await requireAccount("account");
  const member = await memberHere(restaurant.id, data.get("id"));
  if (!member || member.role !== "manager") return { error: "Scegli un responsabile del team." };
  const db = await getDb();
  const [ownsAnother] = await db.select({ id: schema.restaurants.id }).from(schema.restaurants).where(eq(schema.restaurants.ownerId, member.userId));
  if (ownsAnother) return { error: `${member.name} è già titolare di un altro ristorante su Coperto.` };
  await db.transaction(async (tx) => {
    await tx.update(schema.restaurants).set({ ownerId: member.userId }).where(eq(schema.restaurants.id, restaurant.id));
    await tx.update(schema.members).set({ role: "owner" }).where(eq(schema.members.id, member.id));
    await tx
      .update(schema.members)
      .set({ role: "manager" })
      .where(and(eq(schema.members.restaurantId, restaurant.id), eq(schema.members.userId, user.id)));
  });
  revalidatePath("/app", "layout");
  // The old owner no longer sees this form, so the confirmation goes on the page itself.
  redirect(`/app/team?titolare=${encodeURIComponent(member.name)}`);
}

// ---------- PINs and room tablets ----------

const pinMemberSchema = z.object({
  name: z.string().trim().min(2, "Scrivi il nome.").max(80),
  role: z.enum(["manager", "staff"]),
});

/** Adds someone who only uses the room tablet: no email, no password, just a name and a PIN shown once. */
export async function addPinMember(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { restaurant, role } = await requireAccount("team");
  const parsed = pinMemberSchema.safeParse(Object.fromEntries(data));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!assignableRoles(role).includes(parsed.data.role)) return { error: "Solo il titolare può aggiungere responsabili." };
  const db = await getDb();
  const pin = generatePin();
  const pinHash = await hashPassword(pin);
  await db.transaction(async (tx) => {
    const [user] = await tx.insert(schema.users).values({ name: parsed.data.name }).returning({ id: schema.users.id });
    await tx.insert(schema.members).values({ restaurantId: restaurant.id, userId: user.id, role: parsed.data.role, pinHash });
  });
  revalidatePath("/app/team");
  return { ok: `${parsed.data.name} è nel team. Il suo PIN è ${pin}: daglielo ora, non lo mostreremo più.` };
}

/** A fresh PIN for a team member (forgotten, or locked), shown once. Also unlocks it. */
export async function newPin(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { restaurant, role, user } = await requireAccount("team");
  const member = await memberHere(restaurant.id, data.get("id"));
  if (!member || (member.userId !== user.id && !mayManage(role, member.role))) return { error: "Non puoi cambiare il PIN di questa persona." };
  const pin = generatePin();
  await setPin(member.id, pin);
  revalidatePath("/app/team");
  return { ok: `Nuovo PIN di ${member.name}: ${pin}. Daglielo ora, non lo mostreremo più.` };
}

/**
 * Makes this browser a room tablet: the person authorising it is logged out here, and from now on the tablet
 * shows the team's PIN keypad.
 */
export async function authoriseThisDevice(data: FormData) {
  const { restaurant, user, onTablet } = await requireAccount("team");
  if (onTablet) redirect("/app/team");
  const name = String(data.get("name") ?? "").trim().slice(0, 60) || "Tablet della sala";
  await authoriseDevice(restaurant.id, name, user.id);
  await endSession();
  revalidatePath("/", "layout");
  redirect("/sala");
}

/** Revokes a room tablet: its keypad stops working and whoever is logged in on it is logged out. */
export async function revokeDevice(data: FormData) {
  const { restaurant } = await requireAccount("team");
  const db = await getDb();
  await db
    .delete(schema.devices)
    .where(and(eq(schema.devices.id, String(data.get("id") ?? "")), eq(schema.devices.restaurantId, restaurant.id)));
  revalidatePath("/app/team");
}
