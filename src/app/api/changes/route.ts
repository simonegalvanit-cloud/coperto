import { NextResponse } from "next/server";
import { getCurrentAccount } from "@/lib/auth";
import { changeStamp } from "@/lib/changes";

export async function GET() {
  const account = await getCurrentAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ stamp: await changeStamp(account.restaurant.id) }, { headers: { "Cache-Control": "no-store" } });
}
