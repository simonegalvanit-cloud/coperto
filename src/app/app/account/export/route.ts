import { getCurrentAccount } from "@/lib/auth";
import { can } from "@/lib/roles";
import { exportRestaurant } from "@/lib/team";
import { nowIn } from "@/lib/time";

/** Everything the restaurant has in Coperto as one JSON file, for the owner. */
export async function GET() {
  const account = await getCurrentAccount();
  if (!account) return new Response("Non autorizzato", { status: 401 });
  if (!can(account.role, "account")) return new Response("Solo il titolare può scaricare tutti i dati.", { status: 403 });
  const { restaurant } = account;
  const data = await exportRestaurant(restaurant.id);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="coperto-${restaurant.slug}-${nowIn(restaurant.timezone).date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
