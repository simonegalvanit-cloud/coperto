"use client";

import { useState } from "react";

/**
 * A 24-hour time picker made of two dropdowns (hours and minutes). The browser's own time field follows the
 * browser's language and can show AM/PM; this always shows Italian 24-hour time. Submits "HH:MM" as `name`.
 */
export function TimeSelect({
  name,
  defaultValue = "20:00",
  step = 5,
  label,
  onChange,
}: {
  name: string;
  defaultValue?: string;
  step?: 5 | 15 | 30;
  label: string;
  onChange?: (value: string) => void;
}) {
  const [h, m] = defaultValue.split(":");
  const [hour, setHour] = useState(h ?? "20");
  // A saved time off the step (e.g. 20:07) stays selectable.
  const [minute, setMinute] = useState(m ?? "00");
  const minutes = Array.from({ length: 60 / step }, (_, i) => String(i * step).padStart(2, "0"));
  if (!minutes.includes(minute)) {
    minutes.push(minute);
    minutes.sort();
  }
  const set = (nh: string, nm: string) => {
    setHour(nh);
    setMinute(nm);
    onChange?.(`${nh}:${nm}`);
  };
  return (
    <span className="time-select">
      <select className="input" aria-label={`${label}: ora`} value={hour} onChange={(e) => set(e.target.value, minute)}>
        {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")).map((v) => (
          <option key={v} value={v}>{v}</option>
        ))}
      </select>
      <span aria-hidden="true">:</span>
      <select className="input" aria-label={`${label}: minuti`} value={minute} onChange={(e) => set(hour, e.target.value)}>
        {minutes.map((v) => (
          <option key={v} value={v}>{v}</option>
        ))}
      </select>
      <input type="hidden" name={name} value={`${hour}:${minute}`} />
    </span>
  );
}
