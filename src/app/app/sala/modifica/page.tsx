import type { Metadata } from "next";
import Link from "next/link";
import { requireAccount } from "@/lib/auth";
import { loadPlan } from "@/lib/plan";
import { FloorEditor } from "./FloorEditor";

export const metadata: Metadata = { title: "Disegna il locale" };

export default async function EditFloorPage() {
  const { restaurant } = await requireAccount();
  const plan = await loadPlan(restaurant.id);
  return (
    <>
      <div>
        <Link href="/app/sala">‹ Sala</Link>
        <h1 style={{ marginTop: 8 }}>Disegna il locale</h1>
      </div>
      <FloorEditor initial={plan} />
    </>
  );
}
