import { NextResponse, type NextRequest } from "next/server";
import { cleanupRetention } from "@/lib/consent";
import { sendDueReminders } from "@/lib/reminders";

/**
 * Called every morning by Vercel Cron (see vercel.json). With CRON_SECRET set, Vercel sends it as a bearer
 * token and anyone else is refused. Without it the endpoint is open, which is harmless: each booking gets at
 * most one reminder, and only the day before.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const sent = await sendDueReminders();
  const cleanup = await cleanupRetention();
  return NextResponse.json({ sent, ...cleanup });
}
