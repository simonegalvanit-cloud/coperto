import "server-only";
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { and, asc, eq, gt, ne, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { can, type Permission } from "./roles";

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

const sessionId = (token: string) => tokenHash(token);

/** A new session's database row and the cookie token that goes with it (the row stores only the token's hash). */
export function newSession(userId: string, restaurantId: string | null = null) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  return { token, row: { id: sessionId(token), userId, expiresAt, restaurantId } };
}

/** The SHA-256 of a token: what's stored for sessions and one-time links, so a database leak can't be replayed. */
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function startSession(userId: string, restaurantId: string | null = null) {
  const db = await getDb();
  const { token, row } = newSession(userId, restaurantId);
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

/** The current session's id (the hash of the cookie), or null when logged out. */
export async function currentSessionId() {
  const token = (await cookies()).get(COOKIE)?.value;
  return token ? sessionId(token) : null;
}

/**
 * The logged-in user, the restaurant they're working in and their role there, or null. The restaurant is the
 * one picked for this session if they're still on its team, otherwise the first they joined. Someone removed
 * from every team gets null, so access ends the moment they're removed. Cached for one request.
 */
export const getCurrentAccount = cache(async () => {
  const id = await currentSessionId();
  if (!id) return null;
  const db = await getDb();
  const { sessions, users, members, restaurants } = schema;
  const [row] = await db
    .select({
      user: { id: users.id, email: users.email, name: users.name },
      restaurant: restaurants,
      role: members.role,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(members, eq(members.userId, users.id))
    .innerJoin(restaurants, eq(restaurants.id, members.restaurantId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())))
    .orderBy(sql`${members.restaurantId} = ${sessions.restaurantId} desc nulls last`, asc(members.createdAt))
    .limit(1);
  return row ?? null;
});

/**
 * Use at the top of every staff page and action: sends visitors without a session to the login, and members
 * whose role doesn't allow the page back to the bookings.
 */
export async function requireAccount(permission?: Permission) {
  const account = await getCurrentAccount();
  if (!account) redirect("/accedi");
  if (permission && !can(account.role, permission)) redirect("/app");
  return account;
}

/** Logs a user out everywhere except, optionally, this session: after a new password, or when they leave. */
export async function endSessionsOf(userId: string, keep?: string | null) {
  const db = await getDb();
  await db
    .delete(schema.sessions)
    .where(and(eq(schema.sessions.userId, userId), keep ? ne(schema.sessions.id, keep) : undefined));
}
