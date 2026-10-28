"use client";

import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import {
  autoAssign as planAssignments,
  conflictOn,
  isPlaced,
  tableStates,
  tablesOf,
  type FloorBooking,
  type PlanCombo,
  type PlanFixture,
  type PlanFloor,
  type PlanTable,
  type PlanZone,
  type Spot,
  type TableState,
} from "@/lib/floor";
import { fromMinutes, toMinutes } from "@/lib/time";
import type { GuestInfo } from "@/lib/guests";
import { ComboOutline, FixtureShape, PlanDefs, TableShape, ZoneBody, ZoneTab } from "@/components/PlanShapes";
import {
  addToWaitlist,
  assignTable,
  autoAssign,
  leaveWaitlist,
  notifyWaitEntry,
  seatFromWaitlist,
  seatWalkIn,
  setAreaClosed,
  setFloorStatus,
  type FloorResult,
} from "./actions";

export type WaitEntry = {
  id: string;
  name: string;
  phone: string;
  email: string;
  partySize: number;
  notes: string;
  status: "waiting" | "notified" | "seated" | "left";
  source: "door" | "online";
  waitedMinutes: number;
};

const STATE_LABEL: Record<TableState["state"], string> = {
  free: "Libero",
  seated: "Seduti",
  arriving: "In arrivo",
  late: "In ritardo",
};

/** A change shown on the plan before the server confirms it; undone automatically if the server refuses. */
type Change =
  | { id: string; status?: FloorBooking["status"]; tableId?: string | null; combinationId?: string | null }
  | { add: FloorBooking };

const NOWHERE: Spot = { tableId: null, combinationId: null };

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
  floors,
  zones,
  fixtures,
  tables,
  combos,
  closedAreas,
  guestInfo,
  waitlist,
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
  floors: PlanFloor[];
  zones: PlanZone[];
  fixtures: PlanFixture[];
  tables: PlanTable[];
  combos: (PlanCombo & { label: string })[];
  /** Names of the areas closed to online booking on this date. */
  closedAreas: string[];
  /** Guest markers, allergies and notes, by booking id. */
  guestInfo: Record<string, GuestInfo>;
  waitlist: WaitEntry[];
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
  const [waits, showWait] = useOptimistic(waitlist, (list: WaitEntry[], c: { id: string; status: WaitEntry["status"] }) =>
    list.map((w) => (w.id === c.id ? { ...w, status: c.status } : w)),
  );
  const [seatingWait, setSeatingWait] = useState<string | null>(null);
  const [newWait, setNewWait] = useState({ name: "", phone: "", partySize: 2, notes: "" });
  const [closed, showClosed] = useOptimistic(closedAreas, (list: string[], c: { name: string; closed: boolean }) =>
    c.closed ? [...list, c.name] : list.filter((n) => n !== c.name),
  );
  const [zoom, setZoom] = useState(1);
  const [floorId, setFloorId] = useState(() => tables[0]?.floorId ?? floors[0]?.id);
  const floor = floors.find((f) => f.id === floorId) ?? floors[0];
  const zoneName = new Map(zones.map((z) => [z.id, z.name]));

  // In live mode the clock follows the server's "now", which refreshes every few seconds.
  const t = live ? nowMinutes : picked;
  const states = tableStates(tables, view, t, live, combos);
  const unassigned = view.filter((b) => !isPlaced(b) && isActive(b)).sort((a, b) => a.time.localeCompare(b.time));
  const placingBooking = view.find((b) => b.id === placing) ?? null;
  const comboLabel = new Map(combos.map((c) => [c.id, c.label]));
  const placeLabel = (b: FloorBooking) =>
    b.combinationId ? `Tavoli ${comboLabel.get(b.combinationId) ?? ""}` : b.tableId ? `Tavolo ${tables.find((x) => x.id === b.tableId)?.label ?? ""}` : "";

  /**
   * Where tapping this table would put the booking being placed: the table itself if the party fits and it's
   * free, otherwise the smallest free group of joined tables that includes it and fits the party.
   */
  const placeFor = (table: PlanTable): { spot: Spot; fits: boolean } | null => {
    if (!placingBooking) return null;
    const p = placingBooking.partySize;
    if (table.seats >= p && !conflictOn([table.id], placingBooking, view, combos)) return { spot: { tableId: table.id, combinationId: null }, fits: true };
    const group = combos
      .filter((c) => c.tableIds.includes(table.id) && c.maxCovers >= p && !conflictOn(c.tableIds, placingBooking, view, combos))
      .sort((a, b) => a.maxCovers - b.maxCovers)[0];
    if (group) return { spot: { tableId: null, combinationId: group.id }, fits: true };
    return { spot: { tableId: table.id, combinationId: null }, fits: false };
  };
  const waitEntry = waits.find((w) => w.id === seatingWait) ?? null;
  const fits = (table: PlanTable) =>
    waitEntry ? table.seats >= waitEntry.partySize && states.get(table.id)?.state === "free" : !!placeFor(table)?.fits;
  const choosing = !!placingBooking || !!waitEntry;

  const run = (action: () => Promise<FloorResult>, changes: Change[] = [], after?: () => void) =>
    startTransition(async () => {
      if (changes.length) show(changes);
      const result = await action();
      setMessage(result);
      if (!result?.error) after?.();
    });

  const onTable = (table: PlanTable) => {
    if (waitEntry) {
      const walkIn: FloorBooking = {
        id: `wait-${waitEntry.id}`,
        tableId: table.id,
        combinationId: null,
        time: fromMinutes(nowMinutes - (nowMinutes % 5)),
        durationMinutes,
        partySize: waitEntry.partySize,
        guestName: waitEntry.name,
        notes: waitEntry.notes,
        status: "seated",
      };
      startTransition(async () => {
        show([{ add: walkIn }]);
        showWait({ id: waitEntry.id, status: "seated" });
        const result = await seatFromWaitlist(waitEntry.id, table.id);
        setMessage(result);
        if (!result?.error) {
          setSeatingWait(null);
          setSelected(table.id);
        }
      });
      return;
    }
    const place = placeFor(table);
    if (placingBooking && place) {
      run(() => assignTable(placingBooking.id, place.spot), [{ id: placingBooking.id, ...place.spot }], () => {
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
  const selBookings = sel
    ? view.filter((b) => isActive(b) && tablesOf(b, combos).includes(sel.id)).sort((a, b) => a.time.localeCompare(b.time))
    : [];
  const areaNames = [...new Set(zones.map((z) => z.name))].sort((a, b) => a.localeCompare(b, "it"));
  const zoneOf = new Map(tables.map((tb) => [tb.id, tb.zoneId ? zoneName.get(tb.zoneId) : undefined]));
  const inArea = (name: string) => view.filter((b) => isActive(b) && tablesOf(b, combos).some((id) => zoneOf.get(id) === name)).length;
  // Groups of joined tables in use right now on this floor get an outline.
  const combosInUse = new Set(
    [...states.values()].map((s) => s.booking?.combinationId).filter((id): id is string => !!id),
  );

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

        {waitEntry && (
          <div className="placing" role="status">
            <span>
              Tocca un tavolo libero per <strong>{waitEntry.name}</strong> ({people(waitEntry.partySize)}, dalla lista d’attesa).
            </span>
            <button type="button" className="btn btn-small" onClick={() => setSeatingWait(null)}>Annulla</button>
          </div>
        )}

        {placingBooking && (
          <div className="placing" role="status">
            <span>
              Tocca un tavolo per <strong>{placingBooking.guestName}</strong> ({people(placingBooking.partySize)}, {placingBooking.time}).
              I tavoli adatti sono evidenziati; se il gruppo è grande, tocca uno dei tavoli da unire.
            </span>
            <button type="button" className="btn btn-small" onClick={() => setPlacing(null)}>Annulla</button>
          </div>
        )}

        {floors.length > 1 && (
          <div className="floor-tabs" role="tablist" aria-label="Piani">
            {floors.map((f) => {
              const fitting = choosing ? tables.filter((tb) => tb.floorId === f.id && fits(tb)).length : 0;
              return (
                <button key={f.id} type="button" role="tab" aria-selected={f.id === floor.id} className="floor-tab" onClick={() => setFloorId(f.id)}>
                  {f.name}
                  {choosing && <span className="floor-tab-count"> · {fitting} adatti</span>}
                </button>
              );
            })}
          </div>
        )}

        <div className="plan-tools">
          <span className="plan-tools-gap" />
          <button type="button" className="btn btn-small" aria-label="Riduci" disabled={zoom <= 1} onClick={() => setZoom((z) => Math.max(1, z - 0.5))}>−</button>
          <span className="small num">{Math.round(zoom * 100)}%</span>
          <button type="button" className="btn btn-small" aria-label="Ingrandisci" disabled={zoom >= 3} onClick={() => setZoom((z) => Math.min(3, z + 0.5))}>+</button>
        </div>

        <div className="plan-scroll">
          <svg
            className="plan-svg"
            style={{ width: `${zoom * 100}%`, minWidth: 620 * zoom }}
            viewBox={`0 0 ${floor.width} ${floor.height}`}
            role="group"
            aria-label={`${floor.name} alle ${fromMinutes(t)}`}
          >
            <PlanDefs />
            <rect className="plan-floor" x="0" y="0" width={floor.width} height={floor.height} onClick={() => setSelected(null)} />
            {zones
              .filter((z) => z.floorId === floor.id)
              .map((z) => (
                <ZoneBody key={z.id} z={{ ...z, closedToday: closed.includes(z.name) }} />
              ))}
            {fixtures
              .filter((x) => x.floorId === floor.id)
              .sort((a, b) => Number(b.kind === "wall") - Number(a.kind === "wall"))
              .map((x) => (
                <FixtureShape key={x.id} f={x} />
              ))}
            {tables.filter((tb) => tb.floorId === floor.id).map((tb) => {
              const s = states.get(tb.id)!;
              const who = s.booking ? s.booking.guestName : "";
              const lines = [tb.label];
              if (who) lines.push(who);
              if (s.state === "seated" && s.next) lines.push(`→ ${s.next.time}`);
              else if (s.booking && s.state !== "seated") lines.push(s.booking.time);
              else if (s.next) lines.push(`→ ${s.next.time}`);
              return (
                <g
                  key={tb.id}
                  className={`tb is-${s.state}${tb.id === selected ? " is-selected" : ""}${choosing ? (fits(tb) ? " is-fit" : " is-dim") : ""}`}
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
                  <TableShape t={tb} lines={lines} />
                </g>
              );
            })}
            {combos
              .filter((c) => combosInUse.has(c.id))
              .map((c) => {
                const members = tables.filter((tb) => c.tableIds.includes(tb.id) && tb.floorId === floor.id);
                return <ComboOutline key={c.id} tables={members} label={c.label} />;
              })}
            {zones
              .filter((z) => z.floorId === floor.id)
              .map((z) => (
                <ZoneTab key={z.id} z={{ ...z, closedToday: closed.includes(z.name) }} />
              ))}
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
              <span className="small muted">
                {sel.zoneId && zoneName.get(sel.zoneId) ? `${zoneName.get(sel.zoneId)} · ` : ""}
                {sel.minCovers > 1 ? `${sel.minCovers}–${sel.seats}` : sel.seats} posti · {STATE_LABEL[selState.state]}
              </span>
            </div>

            {selState.booking && (
              <BookingCard b={selState.booking} place={placeLabel(selState.booking)} guest={guestInfo[selState.booking.id]}>
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
                    id: `walk-in-${sel.id}`,
                    tableId: sel.id,
                    combinationId: null,
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
                        {b.combinationId && <span className="small muted"> · tavoli {comboLabel.get(b.combinationId)}</span>}
                        {b.status === "seated" && <span className="tag" style={{ marginLeft: 6 }}>Seduti</span>}
                      </span>
                      {b.status === "confirmed" && (
                        <button type="button" className="btn btn-small btn-quiet" disabled={pending} onClick={() => run(() => assignTable(b.id, NOWHERE), [{ id: b.id, ...NOWHERE }])}>
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
          !choosing && <p className="muted">Tocca un tavolo per vedere chi c’è, far sedere qualcuno o spostarlo.</p>
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
                      [...planAssignments(tables, view, combos)].map(([id, spot]) => ({ id, ...spot })),
                    )
                  }>
                  Assegna tutto in automatico
                </button>
              </div>
            </>
          )}
        </div>

        <div className="panel stack">
          <div className="spread">
            <h2>Lista d’attesa</h2>
            <span className="small muted">{waits.filter((w) => w.status === "waiting" || w.status === "notified").length}</span>
          </div>
          {waits.filter((w) => w.status !== "seated").length === 0 && (
            <p className="small muted">Nessuno in attesa. Chi arriva senza prenotare e trova pieno, aggiungilo qui.</p>
          )}
          <ul className="list-plain">
            {waits
              .filter((w) => w.status === "waiting" || w.status === "notified")
              .map((w) => (
                <li key={w.id} className="wait-item">
                  <span>
                    <strong>{w.name}</strong> <span className="party-inline">{w.partySize}</span>
                    <span className="small muted" style={{ display: "block" }}>
                      {w.source === "online" ? "Online" : `In attesa da ${w.waitedMinutes} min`}
                      {w.status === "notified" && " · avvisato"}
                      {w.notes && ` · ${w.notes}`}
                    </span>
                  </span>
                  <span className="row" style={{ gap: 4 }}>
                    {isToday && (
                      <button type="button" className={`btn btn-small${seatingWait === w.id ? " btn-fill" : ""}`} onClick={() => setSeatingWait(seatingWait === w.id ? null : w.id)}>
                        Fai sedere
                      </button>
                    )}
                    {w.phone && (
                      <a className="btn btn-small" href={`tel:${w.phone.replace(/\s/g, "")}`}>
                        Chiama
                      </a>
                    )}
                    {w.status === "waiting" && (
                      <button
                        type="button"
                        className="btn btn-small"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            showWait({ id: w.id, status: "notified" });
                            setMessage(await notifyWaitEntry(w.id));
                          })
                        }
                      >
                        {w.email ? "Avvisa" : "Segna avvisato"}
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-small btn-quiet"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          showWait({ id: w.id, status: "left" });
                          setMessage(await leaveWaitlist(w.id));
                        })
                      }
                    >
                      Togli
                    </button>
                  </span>
                </li>
              ))}
          </ul>
          <details className="wait-add">
            <summary className="btn btn-small">+ Aggiungi in attesa</summary>
            <form
              className="stack"
              style={{ gap: 10, marginTop: 10 }}
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                startTransition(async () => {
                  const result = await addToWaitlist({ date, ...newWait });
                  setMessage(result);
                  if (!result?.error) {
                    setNewWait({ name: "", phone: "", partySize: 2, notes: "" });
                    form.closest("details")?.removeAttribute("open");
                  }
                });
              }}
            >
              <div className="row">
                <label className="field" style={{ flex: "1 1 140px" }}>
                  Nome
                  <input className="input" value={newWait.name} onChange={(e) => setNewWait({ ...newWait, name: e.target.value })} required />
                </label>
                <label className="field" style={{ width: 90 }}>
                  Persone
                  <input className="input" type="number" min={1} max={200} value={newWait.partySize} onChange={(e) => setNewWait({ ...newWait, partySize: Number(e.target.value) || 1 })} />
                </label>
              </div>
              <label className="field">
                Telefono <span className="hint">Per chiamarli quando il tavolo è pronto</span>
                <input className="input" type="tel" value={newWait.phone} onChange={(e) => setNewWait({ ...newWait, phone: e.target.value })} />
              </label>
              <label className="field">
                Note <span className="hint">Es. preferiscono fuori</span>
                <input className="input" value={newWait.notes} onChange={(e) => setNewWait({ ...newWait, notes: e.target.value })} />
              </label>
              <div>
                <button type="submit" className="btn btn-small btn-fill" disabled={pending}>Aggiungi</button>
              </div>
            </form>
          </details>
        </div>

        {areaNames.length > 0 && (
          <div className="panel stack">
            <h2>Aree {isToday ? "oggi" : "in questo giorno"}</h2>
            <p className="small muted">Chiudi un’area per un giorno (il dehors quando piove): online non si prenota lì, le prenotazioni già fatte restano.</p>
            <ul className="list-plain area-list">
              {areaNames.map((name) => {
                const isClosed = closed.includes(name);
                const count = inArea(name);
                return (
                  <li key={name}>
                    <span>
                      <strong>{name}</strong> <span className="small muted">{isClosed ? "Chiusa" : "Aperta"}{count ? ` · ${count} prenotazioni` : ""}</span>
                    </span>
                    <button
                      type="button"
                      className={`btn btn-small${isClosed ? " btn-fill" : ""}`}
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          showClosed({ name, closed: !isClosed });
                          setMessage(await setAreaClosed(name, date, !isClosed));
                        })
                      }
                    >
                      {isClosed ? "Riapri" : `Chiudi ${isToday ? "per oggi" : "questo giorno"}`}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <p className="small">
          <Link href="/app/sala/modifica">Modifica la pianta</Link> · <Link href={`/app?data=${date}`}>Elenco prenotazioni</Link>
        </p>
      </aside>
    </div>
  );
}

function BookingCard({ b, place, guest, children }: { b: FloorBooking; place: string; guest?: GuestInfo; children: React.ReactNode }) {
  const end = fromMinutes(toMinutes(b.time) + b.durationMinutes);
  return (
    <div className="booking-card stack" style={{ gap: 8 }}>
      <div>
        {guest ? (
          <Link href={`/app/ospiti/${guest.guestId}`} style={{ fontSize: 18, fontWeight: 700 }}>
            {b.guestName}
          </Link>
        ) : (
          <strong style={{ fontSize: 18 }}>{b.guestName}</strong>
        )}{" "}
        <span className="party-inline">{b.partySize}</span>
        <div className="small muted">
          {b.time}–{end}
          {place && ` · ${place}`}
        </div>
      </div>
      {guest && (
        <div className="row" style={{ gap: 4 }}>
          {guest.badges.map((badge) => (
            <span key={badge.text} className={`tag${badge.tone === "alert" ? " tag-alert" : badge.tone === "ok" ? " tag-ok" : ""}`}>
              {badge.text}
            </span>
          ))}
        </div>
      )}
      {guest?.allergies && <p className="note small note-alert">Allergie: {guest.allergies}</p>}
      {b.notes && <p className="note small">{b.notes}</p>}
      {guest?.note && <p className="note small note-guest">{guest.note}</p>}
      <div className="row" style={{ gap: 6 }}>{children}</div>
    </div>
  );
}
