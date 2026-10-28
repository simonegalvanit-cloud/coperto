"use client";

import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { autoAssign as planAssignments, conflictOn, PLAN_H, PLAN_W, tableStates, type FloorBooking, type PlanTable, type TableState } from "@/lib/floor";
import { fromMinutes, toMinutes } from "@/lib/time";
import { fit, PlanGrid, PlanTableShape } from "@/components/PlanTableShape";
import { assignTable, autoAssign, seatWalkIn, setFloorStatus, type FloorResult } from "./actions";

const STATE_LABEL: Record<TableState["state"], string> = {
  free: "Libero",
  seated: "Seduti",
  arriving: "In arrivo",
  late: "In ritardo",
};

/** A change shown on the plan before the server confirms it; undone automatically if the server refuses. */
type Change = { id: string; status?: FloorBooking["status"]; tableId?: string | null } | { add: FloorBooking };

function applyChanges(list: FloorBooking[], changes: Change[]): FloorBooking[] {
  return changes.reduce(
    (acc, c) => ("add" in c ? [...acc, c.add] : acc.map((b) => (b.id === c.id ? { ...b, ...c } : b))),
    list,
  );
}

const people = (n: number) => (n === 1 ? "1 persona" : `${n} persone`);
const isActive = (b: FloorBooking) => b.status === "confirmed" || b.status === "seated";

export function FloorLive({
  date,
  isToday,
  nowMinutes,
  range,
  startAt,
  durationMinutes,
  tables,
  bookings,
}: {
  date: string;
  isToday: boolean;
  nowMinutes: number;
  range: { from: number; to: number };
  /** Where the clock starts when looking at another day. */
  startAt: number;
  /** Default length of a stay, for walk-ins shown before the server confirms them. */
  durationMinutes: number;
  tables: PlanTable[];
  bookings: FloorBooking[];
}) {
  const [live, setLive] = useState(isToday);
  const [picked, setPicked] = useState(() => (isToday ? nowMinutes : startAt));
  const [selected, setSelected] = useState<string | null>(null);
  const [placing, setPlacing] = useState<string | null>(null);
  const [walkInParty, setWalkInParty] = useState(2);
  const [walkInName, setWalkInName] = useState("");
  const [message, setMessage] = useState<FloorResult>(null);
  const [pending, startTransition] = useTransition();
  const [view, show] = useOptimistic(bookings, applyChanges);

  // In live mode the clock follows the server's "now", which refreshes every few seconds.
  const t = live ? nowMinutes : picked;
  const states = tableStates(tables, view, t, live);
  const unassigned = view.filter((b) => !b.tableId && isActive(b)).sort((a, b) => a.time.localeCompare(b.time));
  const placingBooking = view.find((b) => b.id === placing) ?? null;
  const fits = (table: PlanTable) => !!placingBooking && table.seats >= placingBooking.partySize && !conflictOn(table.id, placingBooking, view);

  const run = (action: () => Promise<FloorResult>, changes: Change[] = [], after?: () => void) =>
    startTransition(async () => {
      if (changes.length) show(changes);
      const result = await action();
      setMessage(result);
      if (!result?.error) after?.();
    });

  const onTable = (table: PlanTable) => {
    if (placingBooking) {
      run(() => assignTable(placingBooking.id, table.id), [{ id: placingBooking.id, tableId: table.id }], () => {
        setPlacing(null);
        setSelected(table.id);
      });
    } else {
      setSelected(table.id === selected ? null : table.id);
      setMessage(null);
    }
  };

  const seated = tables.reduce((n, tb) => {
    const s = states.get(tb.id)!;
    return s.state === "seated" && s.booking ? n + s.booking.partySize : n;
  }, 0);
  const sel = tables.find((tb) => tb.id === selected) ?? null;
  const selState = sel ? states.get(sel.id)! : null;
  const selBookings = sel ? view.filter((b) => b.tableId === sel.id && isActive(b)).sort((a, b) => a.time.localeCompare(b.time)) : [];

  return (
    <div className="floor">
      <div className="floor-main">
        <div className="scrub">
          <span className="clock">{fromMinutes(t)}</span>
          <input
            type="range"
            min={range.from}
            max={range.to}
            step={15}
            value={Math.min(range.to, Math.max(range.from, t))}
            aria-label="Ora da visualizzare"
            onChange={(e) => {
              setLive(false);
              setPicked(Number(e.target.value));
            }}
          />
          {isToday &&
            (live ? (
              <span className="tag live-tag">Adesso</span>
            ) : (
              <button type="button" className="btn btn-small" onClick={() => setLive(true)}>Torna ad adesso</button>
            ))}
          <span className="small"><strong className="num">{seated}</strong> coperti a tavola</span>
        </div>

        {placingBooking && (
          <div className="placing" role="status">
            <span>
              Tocca un tavolo per <strong>{placingBooking.guestName}</strong> ({people(placingBooking.partySize)}, {placingBooking.time}).
              I tavoli adatti sono evidenziati.
            </span>
            <button type="button" className="btn btn-small" onClick={() => setPlacing(null)}>Annulla</button>
          </div>
        )}

        <div className="plan-scroll">
          <svg className="plan-svg" viewBox={`0 0 ${PLAN_W} ${PLAN_H}`} role="group" aria-label={`Sala alle ${fromMinutes(t)}`}>
            <PlanGrid />
            <rect className="plan-floor" x="0" y="0" width={PLAN_W} height={PLAN_H} onClick={() => setSelected(null)} />
            {tables.map((tb) => {
              const s = states.get(tb.id)!;
              const who = s.booking ? fit(s.booking.guestName, tb.w) : "";
              const lines = [fit(tb.label, tb.w, 13)];
              if (who) lines.push(who);
              if (s.state === "seated" && s.next) lines.push(`→ ${s.next.time}`);
              else if (s.booking && s.state !== "seated") lines.push(s.booking.time);
              else if (s.next) lines.push(`→ ${s.next.time}`);
              return (
                <g
                  key={tb.id}
                  className={`tb is-${s.state}${tb.id === selected ? " is-selected" : ""}${placingBooking ? (fits(tb) ? " is-fit" : " is-dim") : ""}`}
                  tabIndex={0}
                  role="button"
                  aria-label={`Tavolo ${tb.label}, ${tb.seats} posti, ${STATE_LABEL[s.state]}${s.booking ? `, ${s.booking.guestName}` : ""}`}
                  onClick={() => onTable(tb)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onTable(tb);
                    }
                  }}
                >
                  <PlanTableShape t={tb} lines={lines} />
                </g>
              );
            })}
          </svg>
        </div>
        <div className="legend small">
          <span><i className="sw sw-seated" /> Seduti</span>
          <span><i className="sw sw-arriving" /> In arrivo entro 30 minuti</span>
          {live && <span><i className="sw sw-late" /> In ritardo</span>}
          <span><i className="sw" /> Libero</span>
          <span>→ prossima prenotazione</span>
        </div>
      </div>

      <aside className="floor-side">
        {message?.error && <p className="form-error" role="alert">{message.error}</p>}
        {message?.ok && <p className="form-ok" role="status">{message.ok}</p>}

        {sel && selState ? (
          <div className="panel stack">
            <div className="spread">
              <h2>Tavolo {sel.label}</h2>
              <span className="small muted">{sel.seats} posti · {STATE_LABEL[selState.state]}</span>
            </div>

            {selState.booking && (
              <BookingCard b={selState.booking}>
                {selState.booking.status === "seated" ? (
                  <button type="button" className="btn btn-small btn-fill" disabled={pending} onClick={() => run(() => setFloorStatus(selState.booking!.id, "completed"), [{ id: selState.booking!.id, status: "completed" }])}>
                    Si sono alzati
                  </button>
                ) : (
                  isToday && (
                    <button type="button" className="btn btn-small btn-fill" disabled={pending} onClick={() => run(() => setFloorStatus(selState.booking!.id, "seated"), [{ id: selState.booking!.id, status: "seated" }])}>
                      Fai sedere
                    </button>
                  )
                )}
                <button type="button" className="btn btn-small" onClick={() => setPlacing(selState.booking!.id)}>Sposta</button>
              </BookingCard>
            )}

            {selState.state === "free" && live && (
              <form
                className="stack"
                style={{ gap: 10 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  const walkIn: FloorBooking = {
                    id: `walk-in-${Date.now()}`,
                    tableId: sel.id,
                    time: fromMinutes(nowMinutes - (nowMinutes % 5)),
                    durationMinutes,
                    partySize: walkInParty,
                    guestName: walkInName.trim() || "Senza prenotazione",
                    notes: "",
                    status: "seated",
                  };
                  run(() => seatWalkIn(sel.id, walkInParty, walkInName), [{ add: walkIn }], () => setWalkInName(""));
                }}
              >
                <h3>Senza prenotazione</h3>
                <div className="row">
                  <label className="field" style={{ width: 90 }}>
                    Persone
                    <input className="input" type="number" min={1} max={200} value={walkInParty} onChange={(e) => setWalkInParty(Number(e.target.value) || 1)} />
                  </label>
                  <label className="field" style={{ flex: "1 1 140px" }}>
                    Nome <span className="hint">Facoltativo</span>
                    <input className="input" value={walkInName} onChange={(e) => setWalkInName(e.target.value)} />
                  </label>
                </div>
                <div>
                  <button type="submit" className="btn btn-small btn-fill" disabled={pending}>Fai sedere qui</button>
                </div>
              </form>
            )}

            {selBookings.length > 0 && (
              <div className="stack" style={{ gap: 6 }}>
                <h3>Stasera a questo tavolo</h3>
                <ul className="list-plain">
                  {selBookings.map((b) => (
                    <li key={b.id}>
                      <span>
                        <strong>{b.time}</strong> {b.guestName} <span className="muted">({b.partySize})</span>
                        {b.status === "seated" && <span className="tag" style={{ marginLeft: 6 }}>Seduti</span>}
                      </span>
                      {b.status === "confirmed" && (
                        <button type="button" className="btn btn-small btn-quiet" disabled={pending} onClick={() => run(() => assignTable(b.id, null), [{ id: b.id, tableId: null }])}>
                          Togli
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          !placingBooking && <p className="muted">Tocca un tavolo per vedere chi c’è, far sedere qualcuno o spostarlo.</p>
        )}

        <div className="panel stack">
          <div className="spread">
            <h2>Senza tavolo</h2>
            <span className="small muted">{unassigned.length}</span>
          </div>
          {unassigned.length === 0 ? (
            <p className="small muted">Tutte le prenotazioni hanno un tavolo.</p>
          ) : (
            <>
              <ul className="list-plain">
                {unassigned.map((b) => (
                  <li key={b.id}>
                    <span>
                      <strong>{b.time}</strong> {b.guestName} <span className="party-inline">{b.partySize}</span>
                      {b.notes && <span className="small muted" style={{ display: "block" }}>{b.notes}</span>}
                    </span>
                    <button
                      type="button"
                      className={`btn btn-small${placing === b.id ? " btn-fill" : ""}`}
                      onClick={() => setPlacing(placing === b.id ? null : b.id)}
                    >
                      Assegna
                    </button>
                  </li>
                ))}
              </ul>
              <div>
                <button type="button" className="btn btn-small" disabled={pending} onClick={() =>
                    run(
                      () => autoAssign(date),
                      [...planAssignments(tables, view)].map(([id, tableId]) => ({ id, tableId })),
                    )
                  }>
                  Assegna tutto in automatico
                </button>
              </div>
            </>
          )}
        </div>

        <p className="small">
          <Link href="/app/sala/modifica">Modifica la pianta</Link> · <Link href={`/app?data=${date}`}>Elenco prenotazioni</Link>
        </p>
      </aside>
    </div>
  );
}

function BookingCard({ b, children }: { b: FloorBooking; children: React.ReactNode }) {
  const end = fromMinutes(toMinutes(b.time) + b.durationMinutes);
  return (
    <div className="booking-card stack" style={{ gap: 8 }}>
      <div>
        <strong style={{ fontSize: 18 }}>{b.guestName}</strong> <span className="party-inline">{b.partySize}</span>
        <div className="small muted">{b.time}–{end}</div>
      </div>
      {b.notes && <p className="note small">{b.notes}</p>}
      <div className="row" style={{ gap: 6 }}>{children}</div>
    </div>
  );
}
