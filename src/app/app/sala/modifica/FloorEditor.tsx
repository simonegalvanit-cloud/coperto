"use client";

import { useEffect, useRef, useState, useTransition, type KeyboardEvent, type PointerEvent } from "react";
import { useRouter } from "next/navigation";
import { PLAN_H, PLAN_W, sizeFor, type PlanTable, type Shape } from "@/lib/floor";
import { fit, PlanGrid, PlanTableShape } from "@/components/PlanTableShape";
import { saveFloorPlan } from "../actions";

type EditTable = Omit<PlanTable, "id"> & { id?: string; key: string };

const SNAP = 5;
const snap = (v: number) => Math.round(v / SNAP) * SNAP;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
let nextKey = 0;
const newKey = () => `k${++nextKey}`;

const PRESETS: { label: string; shape: Shape; seats: number }[] = [
  { label: "Da 2", shape: "square", seats: 2 },
  { label: "Da 4", shape: "square", seats: 4 },
  { label: "Tondo da 4", shape: "round", seats: 4 },
  { label: "Tondo da 6", shape: "round", seats: 6 },
  { label: "Lungo da 6", shape: "rect", seats: 6 },
  { label: "Lungo da 8", shape: "rect", seats: 8 },
];

const SHAPES: { value: Shape; label: string }[] = [
  { value: "square", label: "Quadrato" },
  { value: "round", label: "Tondo" },
  { value: "rect", label: "Rettangolare" },
];

function nextLabel(tables: EditTable[]) {
  const nums = tables.map((t) => Number(t.label.replace(/\D/g, ""))).filter(Number.isFinite);
  return `T${Math.max(0, ...nums) + 1}`;
}

/** First spot, scanning the room row by row, where a table of this size doesn't touch another. */
function freeSpot(tables: EditTable[], w: number, h: number) {
  const gap = 20;
  for (let y = 30; y + h <= PLAN_H - 10; y += 25) {
    for (let x = 30; x + w <= PLAN_W - 10; x += 25) {
      const clear = tables.every((t) => x + w + gap <= t.x || t.x + t.w + gap <= x || y + h + gap <= t.y || t.y + t.h + gap <= y);
      if (clear) return { x, y };
    }
  }
  return { x: snap((PLAN_W - w) / 2), y: snap((PLAN_H - h) / 2) };
}

/** A typical trattoria, to start from instead of a blank room. */
function exampleRoom(): EditTable[] {
  const row = (y: number, specs: [Shape, number][], startX = 60) => {
    let x = startX;
    return specs.map(([shape, seats]) => {
      const size = sizeFor(shape, seats);
      const t = { shape, seats, ...size, x, y: y + (80 - size.h) / 2 };
      x += size.w + 60;
      return t;
    });
  };
  return [
    ...row(50, [["square", 2], ["square", 2], ["round", 4], ["square", 4], ["square", 4]]),
    ...row(240, [["rect", 6], ["round", 6], ["square", 4]]),
    ...row(440, [["square", 2], ["rect", 8], ["square", 2], ["square", 2]]),
  ].map((t, i) => ({ ...t, label: `T${i + 1}`, key: newKey() }));
}

export function FloorEditor({ initial }: { initial: PlanTable[] }) {
  const router = useRouter();
  const svgRef = useRef<SVGSVGElement>(null);
  const [tables, setTables] = useState<EditTable[]>(() => initial.map((t) => ({ ...t, key: newKey() })));
  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ key: string; dx: number; dy: number } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ error?: string; ok?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    addEventListener("beforeunload", warn);
    return () => removeEventListener("beforeunload", warn);
  }, [dirty]);

  const sel = tables.find((t) => t.key === selected) ?? null;

  const update = (key: string, patch: Partial<EditTable>) => {
    setDirty(true);
    setMessage(null);
    setTables((all) =>
      all.map((t) => {
        if (t.key !== key) return t;
        const next = { ...t, ...patch };
        next.x = clamp(next.x, 0, PLAN_W - next.w);
        next.y = clamp(next.y, 0, PLAN_H - next.h);
        return next;
      }),
    );
  };

  const add = (shape: Shape, seats: number) => {
    const size = sizeFor(shape, seats);
    const t: EditTable = { key: newKey(), label: nextLabel(tables), shape, seats, ...size, ...freeSpot(tables, size.w, size.h) };
    setTables((all) => [...all, t]);
    setSelected(t.key);
    setDirty(true);
  };

  const remove = (key: string) => {
    setTables((all) => all.filter((t) => t.key !== key));
    setSelected(null);
    setDirty(true);
  };

  const toPlan = (e: PointerEvent) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM()!.inverse());
  };

  const onTableDown = (e: PointerEvent, t: EditTable) => {
    e.stopPropagation();
    svgRef.current!.setPointerCapture(e.pointerId);
    const p = toPlan(e);
    setSelected(t.key);
    setDrag({ key: t.key, dx: p.x - t.x, dy: p.y - t.y });
  };

  const onMove = (e: PointerEvent) => {
    if (!drag) return;
    const p = toPlan(e);
    update(drag.key, { x: snap(p.x - drag.dx), y: snap(p.y - drag.dy) });
  };

  const onKey = (e: KeyboardEvent, t: EditTable) => {
    const step = e.shiftKey ? 25 : SNAP;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) {
      e.preventDefault();
      update(t.key, { x: t.x + moves[e.key][0], y: t.y + moves[e.key][1] });
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      remove(t.key);
    }
  };

  const save = () =>
    startTransition(async () => {
      const result = await saveFloorPlan(tables.map(({ id, label, seats, shape, x, y, w, h }) => ({ id, label, seats, shape, x, y, w, h })));
      setMessage(result);
      if (result?.ok) {
        setDirty(false);
        router.push("/app/sala");
      }
    });

  const seatsTotal = tables.reduce((n, t) => n + t.seats, 0);

  return (
    <div className="floor">
      <div className="floor-main">
        <div className="toolbar">
          <span className="small muted">Aggiungi:</span>
          {PRESETS.map((p) => (
            <button key={p.label} type="button" className="btn btn-small" onClick={() => add(p.shape, p.seats)}>
              + {p.label}
            </button>
          ))}
        </div>
        <div className="plan-scroll">
          <svg
            ref={svgRef}
            className="plan-svg editing"
            viewBox={`0 0 ${PLAN_W} ${PLAN_H}`}
            role="application"
            aria-label="Pianta della sala. Trascina i tavoli per spostarli."
            onPointerMove={onMove}
            onPointerUp={() => setDrag(null)}
            onPointerCancel={() => setDrag(null)}
            onPointerDown={() => setSelected(null)}
          >
            <PlanGrid />
            <rect className="plan-floor" x="0" y="0" width={PLAN_W} height={PLAN_H} />
            {tables.map((t) => (
              <g
                key={t.key}
                className={`tb${t.key === selected ? " is-selected" : ""}`}
                tabIndex={0}
                role="button"
                aria-label={`Tavolo ${t.label}, ${t.seats} posti`}
                onPointerDown={(e) => onTableDown(e, t)}
                onKeyDown={(e) => onKey(e, t)}
                onFocus={() => setSelected(t.key)}
              >
                <PlanTableShape t={{ ...t, id: t.key }} lines={[fit(t.label, t.w, 13), `${t.seats} posti`]} />
              </g>
            ))}
          </svg>
        </div>
        <p className="small muted">
          {tables.length} tavoli · {seatsTotal} posti. Trascina per spostare; da tastiera, frecce per spostare e Canc per eliminare.
        </p>
      </div>

      <aside className="floor-side">
        {tables.length === 0 && (
          <div className="panel stack">
            <h2>Disegna la tua sala</h2>
            <p>Aggiungi i tavoli con i pulsanti in alto e trascinali dove sono davvero. Oppure parti da un esempio e modificalo.</p>
            <div>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setTables(exampleRoom());
                  setDirty(true);
                }}
              >
                Parti da un esempio
              </button>
            </div>
          </div>
        )}
        {sel ? (
          <div className="panel stack">
            <h2>Tavolo {sel.label}</h2>
            <div className="grid-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <label className="field">
                Nome
                <input className="input" value={sel.label} maxLength={12} onChange={(e) => update(sel.key, { label: e.target.value })} />
              </label>
              <label className="field">
                Posti
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={50}
                  value={sel.seats}
                  onChange={(e) => update(sel.key, { seats: clamp(Number(e.target.value) || 1, 1, 50) })}
                />
              </label>
            </div>
            <label className="field">
              Forma
              <select
                className="input"
                value={sel.shape}
                onChange={(e) => {
                  const shape = e.target.value as Shape;
                  update(sel.key, { shape, ...sizeFor(shape, sel.seats) });
                }}
              >
                {SHAPES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </label>
            <div className="row">
              <button type="button" className="btn btn-small" onClick={() => update(sel.key, sizeFor(sel.shape, sel.seats))}>
                Adatta ai posti
              </button>
              {sel.w !== sel.h && (
                <button type="button" className="btn btn-small" onClick={() => update(sel.key, { w: sel.h, h: sel.w })}>
                  Ruota
                </button>
              )}
              <button type="button" className="btn btn-small btn-danger" onClick={() => remove(sel.key)}>
                Elimina
              </button>
            </div>
          </div>
        ) : (
          tables.length > 0 && <p className="muted">Tocca un tavolo per cambiarne nome, posti o forma.</p>
        )}

        <div className="stack" style={{ gap: 8 }}>
          {message?.error && <p className="form-error" role="alert">{message.error}</p>}
          {message?.ok && <p className="form-ok" role="status">{message.ok}</p>}
          <button type="button" className="btn btn-fill btn-wide" onClick={save} disabled={pending || !dirty}>
            {pending ? "Salvo…" : dirty ? "Salva la sala" : "Nessuna modifica"}
          </button>
          <p className="small muted">Se elimini un tavolo, le sue prenotazioni restano ma tornano senza tavolo.</p>
        </div>
      </aside>
    </div>
  );
}
