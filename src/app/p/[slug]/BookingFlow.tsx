"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { capitalize } from "@/lib/time";
import { DatePicker } from "@/components/DatePicker";
import { createBooking, joinWaitlist, type BookingResult, type WaitResult } from "./actions";
import { checkContact, FieldError, focusFirstError } from "@/components/FieldError";

type Day = { date: string; open: boolean };

const dayFmt = new Intl.DateTimeFormat("it-IT", { timeZone: "UTC", weekday: "short", day: "numeric" });
const longFmt = new Intl.DateTimeFormat("it-IT", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
const asDate = (d: string) => new Date(`${d}T00:00:00Z`);
const people = (n: number) => (n === 1 ? "1 persona" : `${n} persone`);

export function BookingFlow({
  slug,
  embed,
  days,
  zones,
  maxPartySize,
  phone,
  restaurantName,
  initialDate,
  initialParty,
}: {
  slug: string;
  embed: boolean;
  days: Day[];
  /** Names of the areas the guest can choose between; empty when there's nothing to choose. */
  zones: string[];
  maxPartySize: number;
  phone: string;
  restaurantName: string;
  /** From the link in a waitlist email: open on that day and party size. */
  initialDate?: string;
  initialParty?: number;
}) {
  const [party, setParty] = useState(Math.min(initialParty ?? 2, maxPartySize));
  const [date, setDate] = useState(
    days.find((d) => d.date === initialDate && d.open)?.date ?? days.find((d) => d.open)?.date ?? days[0].date,
  );
  const [zone, setZone] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const clearError = (name: string) =>
    setFieldErrors((errors) => {
      if (!errors[name]) return errors;
      const rest = { ...errors };
      delete rest[name];
      return rest;
    });
  const [slots, setSlots] = useState<string[] | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [state, run, pending] = useActionState(async (prev: BookingResult, data: FormData) => {
    const result = await createBooking(slug, embed, prev, data);
    // The chosen time was taken by someone else while the guest typed: send them back to pick again.
    if (result?.unavailable) {
      setTime(null);
      setSlots(null);
      setReload((n) => n + 1);
    }
    return result;
  }, null);
  const detailsRef = useRef<HTMLDivElement>(null);

  const dayInfo = days.find((d) => d.date === date);
  const isOpen = dayInfo?.open ?? false;

  useEffect(() => {
    if (!isOpen) return;
    const ctrl = new AbortController();
    fetch(`/api/availability?slug=${encodeURIComponent(slug)}&date=${date}&party=${party}${zone ? `&area=${encodeURIComponent(zone)}` : ""}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((data: { slots?: string[] }) => setSlots(data.slots ?? []))
      .catch((err) => {
        if (err.name !== "AbortError") setSlots([]);
      });
    return () => ctrl.abort();
  }, [slug, date, party, zone, isOpen, reload]);

  useEffect(() => {
    if (time) detailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [time]);

  const pick = (fn: () => void) => {
    setTime(null);
    setSlots(null);
    fn();
  };
  const quickDays = days.slice(0, 7);
  const isOpenOn = new Map(days.map((d) => [d.date, d.open]));
  const partyChips = Array.from({ length: Math.min(maxPartySize, 8) }, (_, i) => i + 1);

  if (time) {
    return (
      <>
        <div className="summary" ref={detailsRef}>
          <div>
            <strong>{capitalize(longFmt.format(asDate(date)))}, {time}</strong>
            <div>
              {people(party)}
              {zone && `, ${zone}`}
            </div>
          </div>
          <button type="button" className="btn btn-small" onClick={() => setTime(null)}>Cambia</button>
        </div>
        <form
          className="stack"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            const errors = checkContact(data, { name: "guestName", phone: "guestPhone", email: "guestEmail" });
            setFieldErrors(errors);
            if (Object.keys(errors).length) return focusFirstError(e.currentTarget, errors);
            startTransition(() => run(data));
          }}
        >
          <input type="hidden" name="date" value={date} />
          <input type="hidden" name="time" value={time} />
          <input type="hidden" name="partySize" value={party} />
          <input type="hidden" name="area" value={zone} />
          <div className="honeypot" aria-hidden="true">
            <label>Sito web <input name="website" tabIndex={-1} autoComplete="off" /></label>
          </div>
          <label className="field">
            Nome e cognome
            <input
              className="input"
              name="guestName"
              autoComplete="name"
              aria-invalid={!!fieldErrors.guestName}
              aria-describedby={fieldErrors.guestName ? "err-guestName" : undefined}
              onInput={() => clearError("guestName")}
            />
            <FieldError id="err-guestName" message={fieldErrors.guestName} />
          </label>
          <div className="grid-2">
            <label className="field">
              Telefono
              <input
                className="input"
                type="tel"
                name="guestPhone"
                autoComplete="tel"
                aria-invalid={!!fieldErrors.guestPhone}
                aria-describedby={fieldErrors.guestPhone ? "err-guestPhone" : undefined}
                onInput={() => clearError("guestPhone")}
              />
              <FieldError id="err-guestPhone" message={fieldErrors.guestPhone} />
            </label>
            <label className="field">
              Email <span className="hint">Ti mandiamo la conferma</span>
              <input
                className="input"
                type="email"
                name="guestEmail"
                autoComplete="email"
                aria-invalid={!!fieldErrors.guestEmail}
                aria-describedby={fieldErrors.guestEmail ? "err-guestEmail" : undefined}
                onInput={() => clearError("guestEmail")}
              />
              <FieldError id="err-guestEmail" message={fieldErrors.guestEmail} />
            </label>
          </div>
          {Object.keys(fieldErrors).length > 0 && (
            <p className="form-error" role="alert">Controlla i campi segnati in rosso.</p>
          )}
          <label className="field">
            Note per il ristorante <span className="hint">Allergie, seggiolone, una ricorrenza…</span>
            <textarea className="input" name="notes" maxLength={500} />
          </label>
          {state?.error && <p className="form-error" role="alert">{state.error}</p>}
          <button className="btn btn-fill btn-wide" type="submit" disabled={pending}>
            {pending ? "Prenoto…" : "Conferma la prenotazione"}
          </button>
          <p className="small muted">
            Usiamo i tuoi dati solo per gestire questa prenotazione e li condividiamo con {restaurantName}.
          </p>
        </form>
      </>
    );
  }

  return (
    <>
      {state?.error && <p className="form-error" role="alert">{state.error}</p>}
      <div>
        <p className="step-title">Quante persone?</p>
        <div className="chips">
          {partyChips.map((n) => (
            <button key={n} type="button" className="chip" aria-pressed={party === n} onClick={() => pick(() => setParty(n))}>
              {n}
            </button>
          ))}
          {maxPartySize > 8 && (
            <select
              className="input chip"
              style={{ width: "auto" }}
              aria-label="Più di 8 persone"
              value={party > 8 ? party : ""}
              onChange={(e) => e.target.value && pick(() => setParty(Number(e.target.value)))}
            >
              <option value="">9+</option>
              {Array.from({ length: maxPartySize - 8 }, (_, i) => i + 9).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          )}
        </div>
        {phone && (
          <p className="small muted" style={{ marginTop: 8 }}>
            Siete più di {maxPartySize}? Chiamate il ristorante al <a href={`tel:${phone.replace(/\s/g, "")}`}>{phone}</a>.
          </p>
        )}
      </div>

      {zones.length > 0 && (
        <div>
          <p className="step-title">Dove?</p>
          <div className="chips">
            <button type="button" className="chip" aria-pressed={zone === ""} onClick={() => pick(() => setZone(""))}>
              Indifferente
            </button>
            {zones.map((name) => (
              <button key={name} type="button" className="chip" aria-pressed={zone === name} onClick={() => pick(() => setZone(name))}>
                {name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="step-title">Quando?</p>
        <div className="chips">
          {quickDays.map((d, i) => (
            <button
              key={d.date}
              type="button"
              className="chip"
              aria-pressed={date === d.date}
              disabled={!d.open}
              style={d.open ? undefined : { opacity: 0.4, cursor: "not-allowed", textDecoration: "line-through" }}
              onClick={() => pick(() => setDate(d.date))}
            >
              {i === 0 ? "Oggi" : i === 1 ? "Domani" : dayFmt.format(asDate(d.date))}
            </button>
          ))}
          <DatePicker
            key={quickDays.some((d) => d.date === date) ? "other" : date}
            className="chip-date"
            defaultValue={quickDays.some((d) => d.date === date) ? "" : date}
            placeholder="Altro giorno"
            label="Un altro giorno"
            min={days[0].date}
            max={days[days.length - 1].date}
            isDisabled={(d) => !isOpenOn.get(d)}
            onChange={(d) => pick(() => setDate(d))}
          />
        </div>
      </div>

      <div>
        <p className="step-title">{capitalize(longFmt.format(asDate(date)))}</p>
        {!isOpen ? (
          <p className="panel">Il ristorante è chiuso in questo giorno. Scegline un altro.</p>
        ) : slots === null ? (
          <p className="muted" aria-live="polite">Cerco i tavoli liberi…</p>
        ) : slots.length === 0 ? (
          <div className="panel stack">
            <p>
              Nessun tavolo libero per {people(party)} in questo giorno{zone ? " in quest’area" : ""}. Prova un altro giorno{zone ? " o un’altra area" : ""}
              {phone ? <> o chiama al <a href={`tel:${phone.replace(/\s/g, "")}`}>{phone}</a></> : ""}.
            </p>
            <WaitlistForm key={`${date}-${party}`} slug={slug} date={date} party={party} />
          </div>
        ) : (
          <div className="slots">
            {slots.map((s) => (
              <button key={s} type="button" className="chip" onClick={() => setTime(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/** For a full day: leave an email and get one if a table frees up. */
function WaitlistForm({ slug, date, party }: { slug: string; date: string; party: number }) {
  const [open, setOpen] = useState(false);
  const [state, run, pending] = useActionState<WaitResult, FormData>(joinWaitlist.bind(null, slug), null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  if (state?.ok) return <p className="form-ok" role="status">{state.ok}</p>;
  if (!open) {
    return (
      <div>
        <button type="button" className="btn" onClick={() => setOpen(true)}>Avvisami se si libera un tavolo</button>
      </div>
    );
  }
  return (
    <form
      className="stack"
      style={{ gap: 12 }}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const found = checkContact(data, { name: "name", email: "email", phone: "phone", phoneOptional: true });
        setErrors(found);
        if (Object.keys(found).length) return focusFirstError(e.currentTarget, found);
        startTransition(() => run(data));
      }}
    >
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="partySize" value={party} />
      <div className="honeypot" aria-hidden="true">
        <label>Sito web <input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      <label className="field">
        Nome e cognome
        <input className="input" name="name" autoComplete="name" aria-invalid={!!errors.name} aria-describedby={errors.name ? "werr-name" : undefined} />
        <FieldError id="werr-name" message={errors.name} />
      </label>
      <label className="field">
        Email <span className="hint">Ti scriviamo qui se si libera un tavolo</span>
        <input className="input" type="email" name="email" autoComplete="email" aria-invalid={!!errors.email} aria-describedby={errors.email ? "werr-email" : undefined} />
        <FieldError id="werr-email" message={errors.email} />
      </label>
      <label className="field">
        Telefono <span className="hint">Facoltativo</span>
        <input className="input" type="tel" name="phone" autoComplete="tel" aria-invalid={!!errors.phone} aria-describedby={errors.phone ? "werr-phone" : undefined} />
        <FieldError id="werr-phone" message={errors.phone} />
      </label>
      {state?.error && <p className="form-error" role="alert">{state.error}</p>}
      <div>
        <button type="submit" className="btn btn-fill" disabled={pending}>{pending ? "Un attimo…" : "Mettimi in lista d’attesa"}</button>
      </div>
    </form>
  );
}
