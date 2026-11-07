"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { eq } from "drizzle-orm";
import { logAdmin, requireAdmin } from "@/lib/admin";
import { deleteApplication } from "@/lib/careers";

export async function removeApplication(data: FormData) {
  const admin = await requireAdmin();
  const id = z.uuid().parse(data.get("id"));
  const db = await getDb();
  const [app] = await db.select({ name: schema.jobApplications.name }).from(schema.jobApplications).where(eq(schema.jobApplications.id, id));
  await deleteApplication(id);
  if (app) await logAdmin(admin, "Ha cancellato la candidatura", app.name);
  revalidatePath("/admin", "layout");
}
