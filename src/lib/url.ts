import "server-only";
import { headers } from "next/headers";

/**
 * Absolute base URL for links in emails and embed snippets. Comes from configuration,
 * not the request's Host header, which a client could forge to put its own domain in our emails.
 */
export async function appUrl(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  // Local development only.
  const host = (await headers()).get("host") ?? "localhost:3000";
  return `http://${host}`;
}
