import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin, logAdmin } from "@/lib/admin";
import { getCv } from "@/lib/careers";

/** A candidate's CV, as a download, for the people listed in ADMIN_EMAILS only. */
export async function GET(_: Request, { params }: RouteContext<"/admin/candidature/[id]/cv">) {
  const user = await getCurrentUser();
  const id = z.uuid().safeParse((await params).id);
  if (!user || user.onTablet || !isAdmin(user.email) || !id.success) return new Response("Non trovato", { status: 404 });
  const cv = await getCv(id.data);
  if (!cv) return new Response("Non trovato", { status: 404 });
  await logAdmin({ id: user.id, email: user.email! }, "Ha scaricato il CV", cv.name);
  return new Response(new Uint8Array(cv.cv), {
    headers: {
      "Content-Type": cv.type,
      // Always a download, never shown inline: the file came from a stranger.
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(cv.name)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}
