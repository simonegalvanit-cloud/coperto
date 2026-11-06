"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getCurrentAccount } from "@/lib/auth";
import { deleteApplication, isCareersAdmin } from "@/lib/careers";

export async function removeApplication(data: FormData) {
  const account = await getCurrentAccount();
  if (!account || account.onTablet || !isCareersAdmin(account.user.email)) notFound();
  await deleteApplication(z.uuid().parse(data.get("id")));
  revalidatePath("/admin/candidature");
}
