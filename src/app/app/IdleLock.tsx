"use client";

import { useEffect } from "react";
import { lockTablet } from "../sala/actions";

/** On the room tablet: locks back to the keypad when nobody has touched it for a few minutes. */
export function IdleLock({ minutes }: { minutes: number }) {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void lockTablet(), minutes * 60_000);
    };
    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [minutes]);
  return null;
}
