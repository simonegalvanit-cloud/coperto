"use client";

import { useEffect, useRef, useState } from "react";
import { addDays, capitalize, weekdayOf } from "@/lib/time";

const MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const DAYS = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];
const longFmt = new Intl.DateTimeFormat("it-IT", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" });
const shortFmt = new Intl.DateTimeFormat("it-IT", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric" });
const asDate = (d: string) => new Date(`${d}T00:00:00Z`);

/**
 * An Italian date picker: a button showing "gio 29 ott 2026" that opens a Monday-first calendar. Replaces the
 * browser's date field, which follows the browser's language (mm/dd/yyyy in English browsers).
 * In a form it submits "YYYY-MM-DD" as `name`; `onChange` fires on every pick.
 */
export function DatePicker({
  name,
  defaultValue = "",
  min,
  max,
  isDisabled,
  onChange,
  label,
  placeholder = "Scegli una data",
  align = "left",
  className = "",
}: {
  name?: string;
  defaultValue?: string;
  min?: string;
  max?: string;
  isDisabled?: (date: string) => boolean;
  onChange?: (date: string) => void;
  label: string;
  placeholder?: string;
  align?: "left" | "right";
  className?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState((defaultValue || min || new Date().toISOString().slice(0, 10)).slice(0, 7));
  const wrap = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const [y, m] = month.split("-").map(Number);
  const first = `${month}-01`;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array<null>(weekdayOf(first)).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => addDays(first, i)),
  ];
  const shift = (n: number) => {
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    setMonth(d.toISOString().slice(0, 7));
  };
  const blocked = (d: string) => (min ? d < min : false) || (max ? d > max : false) || !!isDisabled?.(d);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <span className={`datepicker ${className}`} ref={wrap}>
      <button
        type="button"
        className="input datepicker-button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label}: ${value ? longFmt.format(asDate(value)) : placeholder}`}
        onClick={() => {
          if (!open && value) setMonth(value.slice(0, 7));
          setOpen(!open);
        }}
      >
        {value ? capitalize(shortFmt.format(asDate(value))) : <span className="muted">{placeholder}</span>}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <rect x="1.5" y="2.5" width="13" height="12" />
          <path d="M1.5 6h13M5 1v3M11 1v3" />
        </svg>
      </button>
      {name && <input type="hidden" name={name} value={value} />}
      {open && (
        <div className={`datepicker-pop ${align === "right" ? "is-right" : ""}`} role="dialog" aria-label={label}>
          <div className="datepicker-head">
            <button type="button" className="btn btn-small" aria-label="Mese precedente" onClick={() => shift(-1)} disabled={!!min && first <= min}>‹</button>
            <strong>{capitalize(MONTHS[m - 1])} {y}</strong>
            <button type="button" className="btn btn-small" aria-label="Mese successivo" onClick={() => shift(1)} disabled={!!max && addDays(first, daysInMonth) > max}>›</button>
          </div>
          <div className="datepicker-grid">
            {DAYS.map((d) => (
              <span key={d} className="datepicker-dow">{d}</span>
            ))}
            {cells.map((d, i) =>
              d ? (
                <button
                  key={d}
                  type="button"
                  className={`datepicker-day${d === value ? " is-selected" : ""}${d === today ? " is-today" : ""}`}
                  disabled={blocked(d)}
                  aria-label={longFmt.format(asDate(d))}
                  aria-pressed={d === value}
                  onClick={() => {
                    setValue(d);
                    setOpen(false);
                    onChange?.(d);
                  }}
                >
                  {Number(d.slice(8))}
                </button>
              ) : (
                <span key={`e${i}`} />
              ),
            )}
          </div>
        </div>
      )}
    </span>
  );
}
