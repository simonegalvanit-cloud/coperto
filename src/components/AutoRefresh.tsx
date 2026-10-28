"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-fetches the page's server data every few seconds while the tab is visible, and right away
 * when staff come back to it, so bookings made elsewhere appear without reloading.
 */
export function AutoRefresh({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = setInterval(tick, seconds * 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, seconds]);
  return null;
}
