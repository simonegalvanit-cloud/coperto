import { NextResponse, type NextRequest } from "next/server";
import { getAvailableSlots, getRestaurantBySlug } from "@/lib/restaurant";
import { isDate } from "@/lib/time";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const slug = p.get("slug") ?? "";
  const date = p.get("date") ?? "";
  const party = Number(p.get("party"));
  const area = (p.get("area") || "").slice(0, 40) || null;
  if (!isDate(date) || !Number.isInteger(party)) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return NextResponse.json({ error: "not found" }, { status: 404 });
  const slots = await getAvailableSlots(restaurant, date, party, area);
  return NextResponse.json({ slots }, { headers: { "Cache-Control": "no-store" } });
}
