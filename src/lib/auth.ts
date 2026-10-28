import "server-only";
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { and, eq, gt } from "drizzle-orm";
import { getDb, schema } from "@/db";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
const COOKIE = "coperto_session";
const SESSION_DAYS = 30;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [, salt, hash] = stored.split("$");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scrypt(password, Buffer.from(salt, "base64"), expected.length);
  return timingSafeEqual(actual, expected);
}

export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

const sessionId = (token: string) => createHash("sha256").update(token).digest("hex");

/** A new session's database row and the cookie token that goes with it (the row stores only the token's hash). */
export function newSession(userId: string) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  return { token, row: { id: sessionId(token), userId, expiresAt } };
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function startSession(userId: string) {
  const db = await getDb();
  const { token, row } = newSession(userId);
  await db.insert(schema.sessions).values(row);
  await setSessionCookie(token, row.expiresAt);
}

export async function endSession() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId(token)));
  }
  store.delete(COOKIE);
}

/** The logged-in user and their restaurant, or null. Cached for the duration of one request. */
export const getCurrentAccount = cache(async () => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const [row] = await db
    .select({
      user: { id: schema.users.id, email: schema.users.email, name: schema.users.name },
      restaurant: schema.restaurants,
    })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .innerJoin(schema.restaurants, eq(schema.restaurants.ownerId, schema.users.id))
    .where(and(eq(schema.sessions.id, sessionId(token)), gt(schema.sessions.expiresAt, new Date())));
  return row ?? null;
});

/** Use at the top of every staff page and action: sends visitors without a session to the login. */
export async function requireAccount() {
  const account = await getCurrentAccount();
  if (!account) redirect("/accedi");
  return account;
}
