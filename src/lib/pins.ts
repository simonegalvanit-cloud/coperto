import "server-only";
import { randomInt } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { hashPassword, verifyPassword } from "./auth";

export const PIN_LENGTH = 6;
const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;

/** PINs anyone would try first: all one digit, or a run like 123456 / 987654. */
export function isWeakPin(pin: string) {
  if (/^(\d)\1+$/.test(pin)) return true;
  const steps = new Set([...pin].slice(1).map((d, i) => Number(d) - Number(pin[i])));
  return steps.size === 1 && (steps.has(1) || steps.has(-1));
}

export const isPin = (pin: string) => new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);

export function generatePin() {
  for (;;) {
    const pin = String(randomInt(0, 10 ** PIN_LENGTH)).padStart(PIN_LENGTH, "0");
    if (!isWeakPin(pin)) return pin;
  }
}

export async function setPin(memberId: string, pin: string) {
  const db = await getDb();
  await db
    .update(schema.members)
    .set({ pinHash: await hashPassword(pin), pinFailures: 0, pinLockedUntil: null })
    .where(eq(schema.members.id, memberId));
}

/**
 * Checks a member's PIN. Five wrong in a row lock it for a quarter of an hour, so a million combinations can't
 * be tried on the tablet; the right one resets the count.
 */
export async function checkPin(member: { id: string; pinHash: string | null; pinFailures: number; pinLockedUntil: Date | null }, pin: string) {
  if (!member.pinHash) return { ok: false as const, error: "Questa persona non ha ancora un PIN." };
  if (member.pinLockedUntil && member.pinLockedUntil > new Date()) {
    const minutes = Math.ceil((member.pinLockedUntil.getTime() - Date.now()) / 60_000);
    return { ok: false as const, error: `Troppi tentativi sbagliati: riprova tra ${minutes} ${minutes === 1 ? "minuto" : "minuti"}, o chiedi un nuovo PIN.` };
  }
  const db = await getDb();
  if (await verifyPassword(pin, member.pinHash)) {
    if (member.pinFailures) await db.update(schema.members).set({ pinFailures: 0, pinLockedUntil: null }).where(eq(schema.members.id, member.id));
    return { ok: true as const };
  }
  const failures = member.pinFailures + 1;
  const locked = failures >= MAX_FAILURES;
  await db
    .update(schema.members)
    .set(locked ? { pinFailures: 0, pinLockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) } : { pinFailures: failures })
    .where(eq(schema.members.id, member.id));
  return {
    ok: false as const,
    error: locked
      ? `PIN sbagliato 5 volte: bloccato per ${LOCK_MINUTES} minuti.`
      : `PIN sbagliato. Ancora ${MAX_FAILURES - failures} ${MAX_FAILURES - failures === 1 ? "tentativo" : "tentativi"}.`,
  };
}
