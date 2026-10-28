"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const ACTIVE_EVERY = 4_000;
const IDLE_EVERY = 30_000;
const IDLE_AFTER = 10 * 60_000;

/**
 * Keeps a staff screen current. Every few seconds it asks the server for a fingerprint of the restaurant's
 * data and reloads the page's data only if it differs from the one this page was rendered with: a booking
 * made by a guest or on another phone shows up within seconds, and nothing is reloaded when nothing changed.
 * Also catches pages shown from the browser's cache. Slows down on screens nobody has touched for a while.
 */
export function LiveSync({ stamp }: { stamp: string }) {
  const router = useRouter();
  const current = useRef(stamp);
  const lastTouch = useRef(0);

  useEffect(() => {
    current.current = stamp;
  }, [stamp]);

  useEffect(() => {
    lastTouch.current = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const touch = () => (lastTouch.current = Date.now());

    const check = async () => {
      if (document.visibilityState === "visible") {
        try {
          const res = await fetch("/api/changes", { cache: "no-store" });
          if (res.ok) {
            const { stamp: latest } = (await res.json()) as { stamp: string };
            if (latest !== current.current) {
              current.current = latest;
              router.refresh();
            }
          }
        } catch {
          // Offline for a moment: try again next round.
        }
      }
      if (!stopped) timer = setTimeout(check, Date.now() - lastTouch.current > IDLE_AFTER ? IDLE_EVERY : ACTIVE_EVERY);
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        touch();
        check();
      }
    };

    check();
    addEventListener("pointerdown", touch);
    addEventListener("keydown", touch);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      removeEventListener("pointerdown", touch);
      removeEventListener("keydown", touch);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  return null;
}
