"use client";

import { useRouter } from "next/navigation";
import { DatePicker } from "./DatePicker";

/** Jumps the day view (booking list or room) to the date picked in the Italian calendar. */
export function DayJump({ basePath, date }: { basePath: string; date: string }) {
  const router = useRouter();
  return <DatePicker key={date} defaultValue={date} label="Vai alla data" align="right" onChange={(d) => router.push(`${basePath}?data=${d}`)} />;
}
