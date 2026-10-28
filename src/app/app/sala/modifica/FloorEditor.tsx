"use client";

import { useCallback, useEffect, useRef, useState, useTransition, type KeyboardEvent, type PointerEvent } from "react";
import { useRouter } from "next/navigation";
import { FIXTURES, FLOOR_NAMES, sizeFor, zoneFor, type FixtureKind, type Shape } from "@/lib/floor";
import { ComboOutline, FixtureShape, PlanDefs, rotateAbout, TableShape, ZoneBody, ZoneTab, zoneTabWidth } from "@/components/PlanShapes";
import { saveFloorPlan, type FloorPlanInput } from "../actions";
import { useConfirm } from "@/components/ConfirmButton";

// Everything is in centimetres. `key` identifies items in the editor; `id` is their database id once saved.
type Box = { x: number; y: number; w: number; h: number };
type ETable = Box & {
  key: string;
  id?: string;
  label: string;
  seats: number;
  minCovers: number;
  bookableOnline: boolean;
  shape: Shape;
  rotation: number;
};
type EZone = Box & { key: string; name: string; bookableOnline: boolean };
type EFixture = Box & { key: string; kind: FixtureKind; label: string; rotation: number };
/** Joined tables, by table key. `auto` keeps the min/max people following the members until edited by hand. */
type ECombo = { key: string; id?: string; tableKeys: string[]; minCovers: number; maxCovers: number; bookableOnline: boolean; auto?: boolean };
type EFloor = {
  key: string;
  id?: string;
  name: string;
  level: number;
  width: number;
  height: number;
  zones: EZone[];
  fixtures: EFixture[];
  tables: ETable[];
  combos: ECombo[];
};
type Kind = "table" | "zone" | "fixture";
type Selection = { kind: Kind; key: string } | null;
type Drag = {
  mode: "move" | "resize";
  kind: Kind;
  key: string;
  dx: number;
  dy: number;
  /** Centre and angle at the start of a resize of a rotated item, which resizes around its centre. */
  cx: number;
  cy: number;
  rot: number;
  before: EFloor[];
  moved: boolean;
};

export type EditorInput = {
  floors: { id: string; name: string; level: number; width: number; height: number }[];
  zones: (Box & { floorId: string; name: string; bookableOnline: boolean })[];
  fixtures: (Box & { floorId: string; kind: FixtureKind; label: string; rotation: number })[];
  tables: (Box & {
    id: string;
    floorId: string;
    label: string;
    seats: number;
    minCovers: number;
    bookableOnline: boolean;
    shape: Shape;
    rotation: number;
  })[];
  combos: { id: string; tableIds: string[]; minCovers: number; maxCovers: number; bookableOnline: boolean }[];
};

const SNAP = 5;
const MIN: Record<Kind, number> = { table: 30, zone: 100, fixture: 10 };
const ZOOMS = [1, 1.5, 2, 3, 4];
const snap = (v: number) => Math.round(v / SNAP) * SNAP;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
let lastKey = 0;
const newKey = () => `k${++lastKey}`;

const TABLE_PRESETS: { label: string; shape: Shape; seats: number }[] = [
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
const FIXTURE_NAMES: Record<FixtureKind, string> = {
  wall: "Muro",
  door: "Porta",
  window: "Finestra",
  entrance: "Ingresso",
  kitchen: "Cucina",
  bar: "Bar",
  cash: "Cassa",
  station: "Stazione di servizio",
  stairs: "Scale",
  toilets: "Bagni",
  column: "Colonna",
  plant: "Pianta",
  other: "Altro",
};
const LEVELS = [-1, 0, 1, 2, 3];

function fromInput(input: EditorInput): EFloor[] {
  return input.floors.map((f) => {
    const tables = input.tables.filter((t) => t.floorId === f.id).map((t) => ({ ...t, key: newKey() }));
    const keyOf = new Map(tables.map((t) => [t.id, t.key]));
    return {
      key: newKey(),
      id: f.id,
      name: f.name,
      level: f.level,
      width: f.width,
      height: f.height,
      zones: input.zones.filter((z) => z.floorId === f.id).map((z) => ({ ...z, key: newKey() })),
      fixtures: input.fixtures.filter((x) => x.floorId === f.id).map((x) => ({ ...x, key: newKey() })),
      tables,
      combos: input.combos
        .filter((c) => c.tableIds.length > 1 && c.tableIds.every((id) => keyOf.has(id)))
        .map(({ tableIds, ...c }) => ({ ...c, key: newKey(), tableKeys: tableIds.map((id) => keyOf.get(id)!) })),
    };
  });
}

function toInput(plan: EFloor[]): FloorPlanInput {
  const box = ({ x, y, w, h }: Box) => ({ x, y, w, h });
  const floors = plan.map((f) => ({
    id: f.id,
    name: f.name,
    level: f.level,
    width: f.width,
    height: f.height,
    zones: f.zones.map((z) => ({ name: z.name, bookableOnline: z.bookableOnline, ...box(z) })),
    fixtures: f.fixtures.map((x) => ({ kind: x.kind, label: x.label, rotation: x.rotation, ...box(x) })),
    tables: f.tables.map((t) => ({
      id: t.id,
      label: t.label,
      seats: t.seats,
      minCovers: t.minCovers,
      bookableOnline: t.bookableOnline,
      shape: t.shape,
      rotation: t.rotation,
      ...box(t),
    })),
  }));
  // Joined tables are saved by table name, since new tables have no id yet.
  const combos = plan.flatMap((f) => {
    const labelOf = new Map(f.tables.map((t) => [t.key, t.label]));
    return f.combos
      .filter((c) => c.tableKeys.length > 1)
      .map((c) => ({
        id: c.id,
        tables: c.tableKeys.map((k) => labelOf.get(k)!),
        minCovers: c.minCovers,
        maxCovers: c.maxCovers,
        bookableOnline: c.bookableOnline,
      }));
  });
  return { floors, combos };
}

/** Suggested people range for joined tables: more than the biggest member seats alone, up to all seats together. */
function comboDefaults(tables: ETable[], keys: string[]) {
  const members = tables.filter((t) => keys.includes(t.key));
  const max = members.reduce((n, t) => n + t.seats, 0);
  const biggest = Math.max(0, ...members.map((t) => t.seats));
  return { maxCovers: Math.max(1, max), minCovers: Math.max(1, Math.min(max, biggest + 1)) };
}

/** A new floor starts as one area covering it, so its tables belong to a room from the first one. */
const blankFloor = (level = 0, width = 1400, height = 900): EFloor => {
  const name = FLOOR_NAMES[level] ?? `Piano ${level}`;
  return {
    key: newKey(),
    name,
    level,
    width,
    height,
    zones: [{ key: newKey(), name: level === 0 ? "Sala" : `Sala ${name.toLowerCase()}`, bookableOnline: true, x: 0, y: 0, w: width, h: height }],
    fixtures: [],
    tables: [],
    combos: [],
  };
};

function nextLabel(plan: EFloor[]) {
  const nums = plan.flatMap((f) => f.tables).map((t) => Number(t.label.replace(/\D/g, ""))).filter(Number.isFinite);
  return `T${Math.max(0, ...nums) + 1}`;
}

/**
 * The free spot nearest to a point (the middle of what's on screen) where a box of this size doesn't touch a
 * table or fixture, so new items appear where the person is looking, not in a corner.
 */
function freeSpotNear(f: EFloor, w: number, h: number, near: { x: number; y: number }, gap = 30) {
  const taken = [...f.tables, ...f.fixtures];
  const want = { x: near.x - w / 2, y: near.y - h / 2 };
  const spots: { x: number; y: number; d: number }[] = [];
  for (let y = 0; y + h <= f.height; y += 25) {
    for (let x = 0; x + w <= f.width; x += 25) spots.push({ x, y, d: (x - want.x) ** 2 + (y - want.y) ** 2 });
  }
  spots.sort((a, b) => a.d - b.d);
  const free = spots.find(({ x, y }) => taken.every((t) => x + w + gap <= t.x || t.x + t.w + gap <= x || y + h + gap <= t.y || t.y + t.h + gap <= y));
  const at = free ?? spots[0] ?? { x: 0, y: 0 };
  return { x: snap(at.x), y: snap(at.y) };
}

/** A two-floor trattoria to start from: dining room, terrace, kitchen, bar, till, stairs to a private room. */
function exampleRestaurant(): EFloor[] {
  const k = newKey;
  const t = (label: string, shape: Shape, seats: number, x: number, y: number, minCovers = 1): ETable => ({
    key: k(),
    label,
    shape,
    seats,
    minCovers,
    bookableOnline: true,
    rotation: 0,
    x,
    y,
    ...sizeFor(shape, seats),
  });
  const fx = (kind: FixtureKind, x: number, y: number, w?: number, h?: number, label?: string): EFixture => ({
    key: k(),
    kind,
    label: label ?? FIXTURES[kind].label,
    x,
    y,
    w: w ?? FIXTURES[kind].w,
    h: h ?? FIXTURES[kind].h,
    rotation: 0,
  });
  const ground: EFloor = {
    ...blankFloor(0, 1600, 1000),
    zones: [
      { key: k(), name: "Sala", bookableOnline: true, x: 0, y: 0, w: 1100, h: 1000 },
      { key: k(), name: "Dehors", bookableOnline: true, x: 1115, y: 0, w: 485, h: 1000 },
    ],
    fixtures: [
      fx("wall", 0, 0, 1100, 15),
      fx("wall", 0, 985, 1100, 15),
      fx("wall", 0, 0, 15, 1000),
      fx("wall", 1100, 0, 15, 380),
      fx("wall", 1100, 500, 15, 500),
      fx("door", 1100, 390, 15, 100),
      fx("entrance", 60, 985, 160, 15),
      fx("kitchen", 700, 15, 400, 280),
      fx("bar", 500, 860, 330, 70),
      fx("cash", 860, 860, 120, 70),
      fx("toilets", 15, 15, 240, 200),
      fx("stairs", 15, 600, 110, 300, "Scale ↑"),
      fx("column", 520, 470, 40, 40),
      fx("plant", 1130, 30, 60, 60),
    ],
    tables: [
      t("T1", "square", 2, 310, 60),
      t("T2", "square", 2, 430, 60),
      t("T3", "square", 4, 300, 280),
      t("T4", "round", 4, 460, 270),
      t("T5", "square", 4, 640, 380),
      t("T6", "rect", 6, 200, 470),
      t("T7", "rect", 8, 660, 560, 5),
      t("T8", "square", 2, 200, 700),
      t("T9", "square", 2, 330, 700),
      t("D1", "round", 2, 1180, 140),
      t("D2", "round", 4, 1370, 130),
      t("D3", "square", 4, 1180, 360),
      t("D4", "square", 4, 1370, 360),
      t("D5", "rect", 6, 1200, 600),
      t("D6", "square", 2, 1200, 800),
      t("D7", "square", 2, 1380, 800),
    ],
  };
  const byLabel = (f: EFloor, label: string) => f.tables.find((x) => x.label === label)!.key;
  ground.tables.find((x) => x.label === "T5")!.rotation = 45;
  ground.combos = [
    { key: k(), tableKeys: [byLabel(ground, "T8"), byLabel(ground, "T9")], minCovers: 3, maxCovers: 4, bookableOnline: true },
    { key: k(), tableKeys: [byLabel(ground, "D3"), byLabel(ground, "D4")], minCovers: 5, maxCovers: 8, bookableOnline: true },
  ];
  const first: EFloor = {
    ...blankFloor(1, 1100, 800),
    zones: [{ key: k(), name: "Sala privata", bookableOnline: false, x: 0, y: 0, w: 1100, h: 800 }],
    fixtures: [
      fx("wall", 0, 0, 1100, 15),
      fx("wall", 0, 785, 1100, 15),
      fx("wall", 0, 0, 15, 800),
      fx("wall", 1085, 0, 15, 800),
      fx("stairs", 15, 600, 110, 185, "Scale ↓"),
      fx("window", 300, 0, 200, 15),
      fx("window", 650, 0, 200, 15),
      fx("station", 900, 650, 120, 70),
    ],
    tables: [t("P1", "rect", 12, 260, 300, 8), t("P2", "round", 6, 800, 150), t("P3", "round", 6, 800, 420)],
  };
  return [ground, first];
}

export function FloorEditor({ initial }: { initial: EditorInput }) {
  const router = useRouter();
  const svgRef = useRef<SVGSVGElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [plan, setPlan] = useState<EFloor[]>(() => {
    const loaded = fromInput(initial);
    return loaded.length ? loaded : [blankFloor()];
  });
  const [floorKey, setFloorKey] = useState(() => plan[0].key);
  const [sel, setSel] = useState<Selection>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [past, setPast] = useState<EFloor[][]>([]);
  const [future, setFuture] = useState<EFloor[][]>([]);
  const [zoom, setZoom] = useState(1);
  const [joining, setJoining] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ error?: string; ok?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const floor = plan.find((f) => f.key === floorKey) ?? plan[0];
  // Nothing drawn yet: no tables or fixed elements (a new floor's own "Sala" area doesn't count).
  const isEmpty = plan.every((f) => !f.tables.length && !f.fixtures.length);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    addEventListener("beforeunload", warn);
    return () => removeEventListener("beforeunload", warn);
  }, [dirty]);

  /** Applies a change and records it for undo. */
  const commit = useCallback(
    (next: EFloor[]) => {
      setPast((p) => [...p.slice(-49), plan]);
      setFuture([]);
      setPlan(next);
      setDirty(true);
      setMessage(null);
    },
    [plan],
  );

  const undo = useCallback(() => {
    if (!past.length) return;
    setFuture((f) => [plan, ...f]);
    setPlan(past[past.length - 1]);
    setPast((p) => p.slice(0, -1));
    setSel(null);
    setDirty(true);
  }, [past, plan]);

  const redo = useCallback(() => {
    if (!future.length) return;
    setPast((p) => [...p, plan]);
    setPlan(future[0]);
    setFuture((f) => f.slice(1));
    setSel(null);
    setDirty(true);
  }, [future, plan]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest("input, select, textarea");
      if (typing) return;
      if (e.key === "Escape") {
        setSel(null);
        return;
      }
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // ---------- Editing helpers ----------

  const listOf = (f: EFloor, kind: Kind): (Box & { key: string })[] =>
    kind === "table" ? f.tables : kind === "zone" ? f.zones : f.fixtures;

  /** Returns the plan with one item on the current floor patched, kept inside the floor. */
  const patched = (base: EFloor[], kind: Kind, key: string, patch: Partial<ETable & EZone & EFixture>) =>
    base.map((f) => {
      if (f.key !== floor.key) return f;
      const fix = <T extends Box & { key: string }>(items: T[]) =>
        items.map((it) => {
          if (it.key !== key) return it;
          const next = { ...it, ...patch };
          next.w = clamp(next.w, MIN[kind], f.width);
          next.h = clamp(next.h, MIN[kind], f.height);
          next.x = clamp(next.x, 0, f.width - next.w);
          next.y = clamp(next.y, 0, f.height - next.h);
          return next;
        });
      if (kind === "table") return { ...f, tables: fix(f.tables) };
      if (kind === "zone") return { ...f, zones: fix(f.zones) };
      return { ...f, fixtures: fix(f.fixtures) };
    });

  const update = (kind: Kind, key: string, patch: Partial<ETable & EZone & EFixture>) => commit(patched(plan, kind, key, patch));

  /** Floor changes; an area that covered the whole floor keeps covering it when the floor is resized. */
  const updateFloor = (patch: Partial<EFloor>) =>
    commit(
      plan.map((f) => {
        if (f.key !== floor.key) return f;
        const next = { ...f, ...patch };
        const zones = f.zones.map((z) =>
          z.x === 0 && z.y === 0 && z.w === f.width && z.h === f.height ? { ...z, w: next.width, h: next.height } : z,
        );
        return { ...next, zones };
      }),
    );

  /** The middle of the part of the plan that's on screen, in plan centimetres. */
  const viewCentre = () => {
    const svg = svgRef.current;
    const box = scrollRef.current?.getBoundingClientRect();
    if (!svg || !box) return { x: floor.width / 2, y: floor.height / 2 };
    const pt = svg.createSVGPoint();
    pt.x = (box.left + box.right) / 2;
    pt.y = (Math.max(box.top, 0) + Math.min(box.bottom, window.innerHeight)) / 2;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: clamp(p.x, 0, floor.width), y: clamp(p.y, 0, floor.height) };
  };

  const addTo = (kind: Kind, item: ETable | EZone | EFixture) => {
    commit(
      plan.map((f) => {
        if (f.key !== floor.key) return f;
        if (kind === "table") return { ...f, tables: [...f.tables, item as ETable] };
        if (kind === "zone") return { ...f, zones: [...f.zones, item as EZone] };
        return { ...f, fixtures: [...f.fixtures, item as EFixture] };
      }),
    );
    setSel({ kind, key: item.key });
  };

  const addTable = (shape: Shape, seats: number) => {
    const size = sizeFor(shape, seats);
    addTo("table", {
      key: newKey(),
      label: nextLabel(plan),
      shape,
      seats,
      minCovers: 1,
      bookableOnline: true,
      rotation: 0,
      ...size,
      ...freeSpotNear(floor, size.w, size.h, viewCentre()),
    });
  };

  const addZone = () => {
    const w = Math.min(600, floor.width);
    const h = Math.min(400, floor.height);
    const n = plan.flatMap((f) => f.zones).length + 1;
    const c = viewCentre();
    const x = snap(clamp(c.x - w / 2, 0, floor.width - w));
    const y = snap(clamp(c.y - h / 2, 0, floor.height - h));
    addTo("zone", { key: newKey(), name: n === 1 ? "Sala" : `Sala ${n}`, bookableOnline: true, x, y, w, h });
  };

  const addFixture = (kind: FixtureKind) => {
    const d = FIXTURES[kind];
    const w = Math.min(d.w, floor.width);
    const h = Math.min(d.h, floor.height);
    addTo("fixture", { key: newKey(), kind, label: d.label, w, h, rotation: 0, ...freeSpotNear(floor, w, h, viewCentre(), 10) });
  };

  const remove = (kind: Kind, key: string) => {
    commit(
      plan.map((f) =>
        f.key !== floor.key
          ? f
          : {
              ...f,
              tables: kind === "table" ? f.tables.filter((t) => t.key !== key) : f.tables,
              zones: kind === "zone" ? f.zones.filter((z) => z.key !== key) : f.zones,
              fixtures: kind === "fixture" ? f.fixtures.filter((x) => x.key !== key) : f.fixtures,
              // A deleted table leaves its groups; a group of fewer than two tables is no group.
              combos:
                kind === "table"
                  ? f.combos.map((c) => ({ ...c, tableKeys: c.tableKeys.filter((k) => k !== key) })).filter((c) => c.tableKeys.length > 1)
                  : f.combos,
            },
      ),
    );
    setSel(null);
  };

  const duplicate = (kind: Kind, key: string) => {
    const item = listOf(floor, kind).find((it) => it.key === key);
    if (!item || kind === "zone") return;
    const copy = { ...item, key: newKey(), id: undefined, x: item.x + 30, y: item.y + 30 } as ETable & EFixture;
    if (kind === "table") (copy as ETable).label = nextLabel(plan);
    copy.x = clamp(copy.x, 0, floor.width - copy.w);
    copy.y = clamp(copy.y, 0, floor.height - copy.h);
    addTo(kind, copy);
  };

  // ---------- Joined tables ----------

  const setCombos = (fn: (combos: ECombo[]) => ECombo[]) =>
    commit(plan.map((f) => (f.key === floor.key ? { ...f, combos: fn(f.combos) } : f)));

  const startJoin = (tableKey: string) => {
    const combo: ECombo = { key: newKey(), tableKeys: [tableKey], bookableOnline: true, auto: true, ...comboDefaults(floor.tables, [tableKey]) };
    setCombos((cs) => [...cs, combo]);
    setJoining(combo.key);
  };

  const toggleInJoin = (tableKey: string) =>
    setCombos((cs) =>
      cs.map((c) => {
        if (c.key !== joining) return c;
        const tableKeys = c.tableKeys.includes(tableKey) ? c.tableKeys.filter((k) => k !== tableKey) : [...c.tableKeys, tableKey];
        return { ...c, tableKeys, ...(c.auto ? comboDefaults(floor.tables, tableKeys) : {}) };
      }),
    );

  const finishJoin = () => {
    setCombos((cs) => cs.filter((c) => c.key !== joining || c.tableKeys.length > 1));
    setJoining(null);
  };

  const removeCombo = (key: string) => {
    setCombos((cs) => cs.filter((c) => c.key !== key));
    if (joining === key) setJoining(null);
  };

  const addFloor = () => {
    const level = Math.max(...plan.map((f) => f.level)) + 1;
    const f = blankFloor(level, floor.width, floor.height);
    commit([...plan, f]);
    setFloorKey(f.key);
    setSel(null);
  };

  const removeFloor = async () => {
    if (plan.length === 1) return;
    const n = floor.tables.length;
    const ok = await confirm(
      `Eliminare “${floor.name}”${n ? ` e i suoi ${n} tavoli? Le loro prenotazioni resteranno senza tavolo` : ""}?`,
      "Elimina piano",
    );
    if (!ok) return;
    const next = plan.filter((f) => f.key !== floor.key);
    commit(next);
    setFloorKey(next[0].key);
    setSel(null);
  };

  // ---------- Pointer interaction ----------

  const toPlan = (e: PointerEvent) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM()!.inverse());
  };

  const startDrag = (e: PointerEvent, kind: Kind, item: Box & { key: string; rotation?: number }, mode: Drag["mode"]) => {
    e.stopPropagation();
    // While joining tables, tapping a table adds or removes it instead of moving it.
    if (joining && kind === "table" && mode === "move") {
      toggleInJoin(item.key);
      return;
    }
    svgRef.current!.setPointerCapture(e.pointerId);
    const p = toPlan(e);
    setSel({ kind, key: item.key });
    setDrag({
      mode,
      kind,
      key: item.key,
      dx: mode === "move" ? p.x - item.x : item.x,
      dy: mode === "move" ? p.y - item.y : item.y,
      cx: item.x + item.w / 2,
      cy: item.y + item.h / 2,
      rot: item.rotation ?? 0,
      before: plan,
      moved: false,
    });
  };

  /** Size from a resize drag. A rotated item resizes around its centre, measured along its own axes. */
  const resizePatch = (d: Drag, p: { x: number; y: number }) => {
    if (!d.rot) return { w: snap(p.x - d.dx), h: snap(p.y - d.dy) };
    const a = (-d.rot * Math.PI) / 180;
    const dx = p.x - d.cx;
    const dy = p.y - d.cy;
    const w = snap(Math.abs(dx * Math.cos(a) - dy * Math.sin(a)) * 2);
    const h = snap(Math.abs(dx * Math.sin(a) + dy * Math.cos(a)) * 2);
    return { w, h, x: snap(d.cx - w / 2), y: snap(d.cy - h / 2) };
  };

  const onMove = (e: PointerEvent) => {
    if (!drag) return;
    const p = toPlan(e);
    const patch =
      drag.mode === "move"
        ? { x: snap(p.x - drag.dx), y: snap(p.y - drag.dy) }
        : resizePatch(drag, p);
    setPlan((cur) => patched(cur, drag.kind, drag.key, patch));
    if (!drag.moved) setDrag({ ...drag, moved: true });
  };

  const endDrag = () => {
    if (drag?.moved) {
      setPast((p) => [...p.slice(-49), drag.before]);
      setFuture([]);
      setDirty(true);
      setMessage(null);
    }
    setDrag(null);
  };

  const onItemKey = (e: KeyboardEvent, kind: Kind, item: Box & { key: string }) => {
    const step = e.shiftKey ? 50 : SNAP;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) {
      e.preventDefault();
      update(kind, item.key, { x: item.x + moves[e.key][0], y: item.y + moves[e.key][1] });
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      remove(kind, item.key);
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
      e.preventDefault();
      duplicate(kind, item.key);
    }
  };

  const save = () =>
    startTransition(async () => {
      const result = await saveFloorPlan(toInput(plan));
      setMessage(result);
      if (result?.ok) {
        setDirty(false);
        router.push("/app/sala");
      }
    });

  // ---------- Rendering ----------

  const selected = sel ? listOf(floor, sel.kind).find((it) => it.key === sel.key) : undefined;
  const selTable = sel?.kind === "table" ? (selected as ETable | undefined) : undefined;
  const selZone = sel?.kind === "zone" ? (selected as EZone | undefined) : undefined;
  const selFixture = sel?.kind === "fixture" ? (selected as EFixture | undefined) : undefined;
  const zoneOf = (t: ETable) => zoneFor({ ...t, floorId: "" }, floor.zones.map((z) => ({ ...z, floorId: "" })));
  // A table outside every drawn area belongs to no room: flag it so it isn't missed.
  const isOrphan = (t: ETable) => floor.zones.length > 0 && !zoneOf(t);
  const joinCombo = joining ? floor.combos.find((c) => c.key === joining) : undefined;
  const labelOfKey = new Map(floor.tables.map((t) => [t.key, t.label]));
  const comboName = (c: ECombo) => c.tableKeys.map((k) => labelOfKey.get(k)).join("+");
  // Outlines for the group being edited, or the groups of the selected table.
  const shownCombos = joinCombo
    ? [joinCombo]
    : selTable
      ? floor.combos.filter((c) => c.tableKeys.includes(selTable.key))
      : [];
  const handle = Math.max(16, 22 / zoom);
  const itemProps = (kind: Kind, item: Box & { key: string }, label: string) => ({
    tabIndex: 0,
    role: "button",
    "aria-label": label,
    onPointerDown: (e: PointerEvent) => startDrag(e, kind, item, "move"),
    onKeyDown: (e: KeyboardEvent) => onItemKey(e, kind, item),
    onFocus: () => setSel({ kind, key: item.key }),
  });
  // Walls first so doors and windows draw over them.
  const fixturesInOrder = [...floor.fixtures].sort((a, b) => Number(b.kind === "wall") - Number(a.kind === "wall"));
  const allTables = plan.flatMap((f) => f.tables);
  const totals = { tables: allTables.length, seats: allTables.reduce((n, t) => n + t.seats, 0) };

  return (
    <div className="floor">
      {dialog}
      <div className="floor-main">
        <div className="floor-tabs" role="tablist" aria-label="Piani">
          {plan.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={f.key === floor.key}
              className="floor-tab"
              onClick={() => {
                setFloorKey(f.key);
                setSel(null);
              }}
            >
              {f.name}
            </button>
          ))}
          <button type="button" className="floor-tab floor-tab-add" onClick={addFloor}>+ Piano</button>
        </div>

        <div className="palette">
          <div className="palette-row">
            <span className="palette-title">Tavoli</span>
            {TABLE_PRESETS.map((p) => (
              <button key={p.label} type="button" className="btn btn-small" onClick={() => addTable(p.shape, p.seats)}>
                + {p.label}
              </button>
            ))}
          </div>
          <div className="palette-row">
            <span className="palette-title">Spazi</span>
            <button type="button" className="btn btn-small" onClick={addZone}>+ Sala / area</button>
            {(Object.keys(FIXTURES) as FixtureKind[]).map((kind) => (
              <button key={kind} type="button" className="btn btn-small" onClick={() => addFixture(kind)}>
                + {FIXTURE_NAMES[kind]}
              </button>
            ))}
          </div>
        </div>

        <div className="plan-tools">
          <button type="button" className="btn btn-small" onClick={undo} disabled={!past.length} title="Ctrl+Z">Annulla</button>
          <button type="button" className="btn btn-small" onClick={redo} disabled={!future.length} title="Ctrl+Y">Ripeti</button>
          <span className="plan-tools-gap" />
          <button type="button" className="btn btn-small" aria-label="Riduci" onClick={() => setZoom(ZOOMS[Math.max(0, ZOOMS.indexOf(zoom) - 1)])}>−</button>
          <span className="small num">{Math.round(zoom * 100)}%</span>
          <button type="button" className="btn btn-small" aria-label="Ingrandisci" onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(zoom) + 1)])}>+</button>
        </div>

        <div className="plan-scroll" ref={scrollRef}>
          <svg
            ref={svgRef}
            className="plan-svg editing"
            style={{ width: `${zoom * 100}%`, minWidth: 620 * zoom }}
            viewBox={`0 0 ${floor.width} ${floor.height}`}
            role="application"
            aria-label={`${floor.name}: pianta modificabile. Trascina per spostare, l’angolo in basso a destra per ridimensionare.`}
            onPointerMove={onMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onPointerDown={() => setSel(null)}
          >
            <PlanDefs />
            <rect className="plan-floor" x="0" y="0" width={floor.width} height={floor.height} />
            {floor.zones.map((z) => (
              <ZoneBody key={z.key} z={z} />
            ))}
            {fixturesInOrder.map((x) => (
              <g key={x.key} className={`fx-item${sel?.key === x.key ? " is-selected" : ""}`} {...itemProps("fixture", x, `${FIXTURE_NAMES[x.kind]} ${x.label}`)}>
                <FixtureShape f={x} />
                <rect className="fx-hit" x={x.x - 6} y={x.y - 6} width={x.w + 12} height={x.h + 12} transform={rotateAbout(x)} />
              </g>
            ))}
            {floor.tables.map((t) => (
              <g
                key={t.key}
                className={`tb${sel?.key === t.key ? " is-selected" : ""}${t.bookableOnline ? "" : " is-offline"}${joinCombo?.tableKeys.includes(t.key) ? " is-picked" : ""}${isOrphan(t) ? " is-orphan" : ""}`}
                {...itemProps("table", t, `Tavolo ${t.label}, ${t.seats} posti`)}
              >
                <TableShape t={t} lines={[t.label, t.minCovers > 1 ? `${t.minCovers}–${t.seats}` : `${t.seats} posti`]} />
              </g>
            ))}
            {floor.zones.map((z) => (
              <ZoneTab key={z.key} z={z}>
                <rect className="zone-grab" x={z.x} y={z.y} width={zoneTabWidth(z)} height={36} {...itemProps("zone", z, `Sala ${z.name}`)} />
              </ZoneTab>
            ))}
            {shownCombos.map((c) => (
              <ComboOutline
                key={c.key}
                tables={floor.tables.filter((t) => c.tableKeys.includes(t.key))}
                label={`${comboName(c)} · ${c.minCovers}–${c.maxCovers}`}
              />
            ))}
            {selected && sel && !joining && (
              <g className="sel-frame" transform={rotateAbout(selected)}>
                <rect x={selected.x} y={selected.y} width={selected.w} height={selected.h} />
                <rect
                  className="sel-handle"
                  x={selected.x + selected.w - handle / 2}
                  y={selected.y + selected.h - handle / 2}
                  width={handle}
                  height={handle}
                  onPointerDown={(e) => startDrag(e, sel.kind, selected, "resize")}
                  aria-label="Ridimensiona"
                />
              </g>
            )}
          </svg>
        </div>
        <p className="small muted">
          {floor.name}: {(floor.width / 100).toLocaleString("it-IT")} × {(floor.height / 100).toLocaleString("it-IT")} m · in tutto {totals.tables} tavoli e{" "}
          {totals.seats} posti. Trascina per spostare, l’angolo per ridimensionare. Da tastiera: frecce, Canc, Ctrl+D per duplicare, Esc per deselezionare.
        </p>
      </div>

      <aside className="floor-side">
        {isEmpty && (
          <div className="panel stack">
            <h2>Disegna il tuo locale</h2>
            <p>Imposta le misure del piano, poi aggiungi sale, muri, cucina, bar e tavoli. Oppure parti da un esempio su due piani e modificalo.</p>
            <div>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  const ex = exampleRestaurant();
                  commit(ex);
                  setFloorKey(ex[0].key);
                }}
              >
                Parti da un esempio
              </button>
            </div>
          </div>
        )}

        {joinCombo && (
          <div className="panel stack">
            <h2>Unisci tavoli</h2>
            <p>
              Tocca sulla pianta i tavoli da unire. Uniti: <strong>{joinCombo.tableKeys.length > 0 ? comboName(joinCombo) : "nessuno"}</strong>
            </p>
            <div className="grid-fields">
              <NumberField
                label="Persone min"
                value={joinCombo.minCovers}
                min={1}
                max={joinCombo.maxCovers}
                onChange={(v) => setCombos((cs) => cs.map((c) => (c.key === joinCombo.key ? { ...c, minCovers: v, auto: false } : c)))}
              />
              <NumberField
                label="Persone max"
                value={joinCombo.maxCovers}
                min={1}
                max={200}
                onChange={(v) =>
                  setCombos((cs) => cs.map((c) => (c.key === joinCombo.key ? { ...c, maxCovers: v, minCovers: Math.min(c.minCovers, v), auto: false } : c)))
                }
              />
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={joinCombo.bookableOnline}
                onChange={(e) => setCombos((cs) => cs.map((c) => (c.key === joinCombo.key ? { ...c, bookableOnline: e.target.checked } : c)))}
              />
              Prenotabile online
            </label>
            <p className="small muted">
              Online li uniamo solo per gruppi da {joinCombo.minCovers} a {joinCombo.maxCovers} persone, quando nessun tavolo da solo basta e tutti sono liberi.
            </p>
            <div className="row" style={{ gap: 6 }}>
              <button type="button" className="btn btn-small btn-fill" onClick={finishJoin}>
                {joinCombo.tableKeys.length > 1 ? "Fatto" : "Annulla"}
              </button>
              <button type="button" className="btn btn-small btn-danger" onClick={() => removeCombo(joinCombo.key)}>Elimina unione</button>
            </div>
          </div>
        )}

        {selTable && !joining && (
          <div className="panel stack">
            <h2>Tavolo {selTable.label}</h2>
            {floor.zones.length === 0 ? (
              <p className="small muted">In: tutto il piano (non ci sono sale disegnate).</p>
            ) : zoneOf(selTable) ? (
              <p className="small muted">In: {zoneOf(selTable)!.name}</p>
            ) : (
              <p className="form-error small" role="alert">
                Fuori da ogni sala: spostalo dentro un’area, o allarga l’area. Altrimenti non conta per nessuna sala quando l’ospite sceglie dove sedersi.
              </p>
            )}
            <div className="grid-fields">
              <label className="field">
                Nome
                <input className="input" value={selTable.label} maxLength={12} onChange={(e) => update("table", selTable.key, { label: e.target.value })} />
              </label>
              <label className="field">
                Forma
                <select
                  className="input"
                  value={selTable.shape}
                  onChange={(e) => {
                    const shape = e.target.value as Shape;
                    update("table", selTable.key, { shape, ...sizeFor(shape, selTable.seats) });
                  }}
                >
                  {SHAPES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </label>
              <NumberField label="Persone min" value={selTable.minCovers} min={1} max={selTable.seats} onChange={(v) => update("table", selTable.key, { minCovers: v })} />
              <NumberField
                label="Persone max"
                value={selTable.seats}
                min={1}
                max={50}
                onChange={(v) => update("table", selTable.key, { seats: v, minCovers: Math.min(selTable.minCovers, v) })}
              />
              <NumberField label="Larghezza (cm)" value={selTable.w} min={30} max={floor.width} step={5} onChange={(v) => update("table", selTable.key, { w: v })} />
              <NumberField label="Profondità (cm)" value={selTable.h} min={30} max={floor.height} step={5} onChange={(v) => update("table", selTable.key, { h: v })} />
              <AngleField value={selTable.rotation} onChange={(v) => update("table", selTable.key, { rotation: v })} />
            </div>
            <label className="check">
              <input type="checkbox" checked={selTable.bookableOnline} onChange={(e) => update("table", selTable.key, { bookableOnline: e.target.checked })} />
              Prenotabile online
            </label>
            <p className="small muted">Online lo diamo solo a gruppi da {selTable.minCovers} a {selTable.seats} persone. Dalla sala puoi sempre metterci chi vuoi.</p>
            <ItemButtons onRotate={() => update("table", selTable.key, { w: selTable.h, h: selTable.w })} onDuplicate={() => duplicate("table", selTable.key)} onDelete={() => remove("table", selTable.key)} />
            <div className="stack" style={{ gap: 8 }}>
              <h3>Tavoli uniti</h3>
              {floor.combos.filter((c) => c.tableKeys.includes(selTable.key)).length === 0 && (
                <p className="small muted">Per gruppi grandi puoi unire questo tavolo ad altri vicini.</p>
              )}
              <ComboList combos={floor.combos.filter((c) => c.tableKeys.includes(selTable.key))} name={comboName} onEdit={setJoining} onDelete={removeCombo} />
              <div>
                <button type="button" className="btn btn-small" onClick={() => startJoin(selTable.key)}>Unisci con altri tavoli</button>
              </div>
            </div>
          </div>
        )}

        {selZone && !joining && (
          <div className="panel stack">
            <h2>{selZone.name || "Sala"}</h2>
            <label className="field">
              Nome
              <input className="input" value={selZone.name} maxLength={40} onChange={(e) => update("zone", selZone.key, { name: e.target.value })} />
            </label>
            <div className="grid-fields">
              <NumberField label="Larghezza (cm)" value={selZone.w} min={100} max={floor.width} step={10} onChange={(v) => update("zone", selZone.key, { w: v })} />
              <NumberField label="Profondità (cm)" value={selZone.h} min={100} max={floor.height} step={10} onChange={(v) => update("zone", selZone.key, { h: v })} />
            </div>
            <label className="check">
              <input type="checkbox" checked={selZone.bookableOnline} onChange={(e) => update("zone", selZone.key, { bookableOnline: e.target.checked })} />
              Prenotabile online
            </label>
            <p className="small muted">I tavoli dentro quest’area fanno parte di “{selZone.name}”. Se ci sono più aree prenotabili, l’ospite può scegliere dove sedersi.</p>
            <p className="small muted">
              Sala a L o di forma irregolare? Disegnala con più aree con lo stesso nome: contano come una sala sola, anche per chi prenota e per le chiusure.
            </p>
            <ItemButtons onDelete={() => remove("zone", selZone.key)} />
          </div>
        )}

        {selFixture && !joining && (
          <div className="panel stack">
            <h2>{FIXTURE_NAMES[selFixture.kind]}</h2>
            <div className="grid-fields">
              <label className="field">
                Tipo
                <select className="input" value={selFixture.kind} onChange={(e) => update("fixture", selFixture.key, { kind: e.target.value as FixtureKind })}>
                  {(Object.keys(FIXTURES) as FixtureKind[]).map((k) => (
                    <option key={k} value={k}>{FIXTURE_NAMES[k]}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                Scritta
                <input className="input" value={selFixture.label} maxLength={40} onChange={(e) => update("fixture", selFixture.key, { label: e.target.value })} />
              </label>
              <NumberField label="Larghezza (cm)" value={selFixture.w} min={10} max={floor.width} step={5} onChange={(v) => update("fixture", selFixture.key, { w: v })} />
              <NumberField label="Profondità (cm)" value={selFixture.h} min={10} max={floor.height} step={5} onChange={(v) => update("fixture", selFixture.key, { h: v })} />
              <AngleField value={selFixture.rotation} onChange={(v) => update("fixture", selFixture.key, { rotation: v })} />
            </div>
            <ItemButtons
              onRotate={() => update("fixture", selFixture.key, { w: selFixture.h, h: selFixture.w })}
              onDuplicate={() => duplicate("fixture", selFixture.key)}
              onDelete={() => remove("fixture", selFixture.key)}
            />
          </div>
        )}

        {!sel && !joining && (
          <div className="panel stack">
            <h2>{floor.name}</h2>
            <div className="grid-fields">
              <label className="field">
                Nome
                <input className="input" value={floor.name} maxLength={40} onChange={(e) => updateFloor({ name: e.target.value })} />
              </label>
              <label className="field">
                Piano
                <select className="input" value={floor.level} onChange={(e) => updateFloor({ level: Number(e.target.value) })}>
                  {LEVELS.map((l) => (
                    <option key={l} value={l}>{FLOOR_NAMES[l]}</option>
                  ))}
                </select>
              </label>
              <NumberField
                label="Larghezza (m)"
                value={floor.width / 100}
                min={2}
                max={100}
                step={0.5}
                onChange={(v) => updateFloor({ width: Math.round(v * 100) })}
              />
              <NumberField
                label="Profondità (m)"
                value={floor.height / 100}
                min={2}
                max={100}
                step={0.5}
                onChange={(v) => updateFloor({ height: Math.round(v * 100) })}
              />
            </div>
            <p className="small muted">
              {floor.tables.length} tavoli, {floor.zones.length} sale o aree, {floor.fixtures.length} elementi su questo piano.
              {floor.tables.some(isOrphan) && (
                <span className="form-error" style={{ display: "block", marginTop: 6 }}>
                  {floor.tables.filter(isOrphan).length} tavoli sono fuori da ogni sala (bordo rosso tratteggiato).
                </span>
              )} Tocca un elemento per modificarlo;
              per una sala, tocca la sua etichetta in alto a sinistra.
            </p>
            {plan.length > 1 && (
              <div>
                <button type="button" className="btn btn-small btn-danger" onClick={removeFloor}>Elimina questo piano</button>
              </div>
            )}
          </div>
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

/** A number input that only reports valid numbers, so typing "1" on the way to "12" doesn't jump the drawing. */
function NumberInput({ value, min, max, step = 1, onChange, label }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; label?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commitDraft = () => {
    if (draft === null) return;
    const v = Number(draft.replace(",", "."));
    if (Number.isFinite(v)) onChange(clamp(v, min, max));
    setDraft(null);
  };
  return (
    <input
      className="input"
      type="number"
      inputMode="decimal"
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={draft ?? String(value)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commitDraft}
      onKeyDown={(e) => e.key === "Enter" && commitDraft()}
    />
  );
}

function NumberField({ label, ...props }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  return (
    <label className="field">
      {label}
      <NumberInput {...props} />
    </label>
  );
}

/** Angle in degrees, with quick 15° turns either way. */
function AngleField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const turn = (d: number) => onChange((((value + d) % 360) + 360) % 360);
  return (
    <div className="field">
      Angolo (°)
      <div className="row angle-field" style={{ gap: 6, flexWrap: "nowrap" }}>
        <button type="button" className="btn btn-small" aria-label="Ruota di 15° a sinistra" onClick={() => turn(-15)}>↺</button>
        <NumberInput value={value} min={0} max={359} step={5} onChange={onChange} label="Angolo in gradi" />
        <button type="button" className="btn btn-small" aria-label="Ruota di 15° a destra" onClick={() => turn(15)}>↻</button>
      </div>
    </div>
  );
}

function ComboList({ combos, name, onEdit, onDelete }: { combos: ECombo[]; name: (c: ECombo) => string; onEdit: (key: string) => void; onDelete: (key: string) => void }) {
  if (!combos.length) return null;
  return (
    <ul className="list-plain">
      {combos.map((c) => (
        <li key={c.key}>
          <span>
            <strong>{name(c)}</strong>{" "}
            <span className="small muted">
              {c.minCovers}–{c.maxCovers} persone{c.bookableOnline ? "" : " · non online"}
            </span>
          </span>
          <span className="row" style={{ gap: 4 }}>
            <button type="button" className="btn btn-small btn-quiet" onClick={() => onEdit(c.key)}>Modifica</button>
            <button type="button" className="btn btn-small btn-quiet" onClick={() => onDelete(c.key)}>Elimina</button>
          </span>
        </li>
      ))}
    </ul>
  );
}

function ItemButtons({ onRotate, onDuplicate, onDelete }: { onRotate?: () => void; onDuplicate?: () => void; onDelete: () => void }) {
  return (
    <div className="row" style={{ gap: 6 }}>
      {onRotate && <button type="button" className="btn btn-small" onClick={onRotate}>Ruota 90°</button>}
      {onDuplicate && <button type="button" className="btn btn-small" onClick={onDuplicate}>Duplica</button>}
      <button type="button" className="btn btn-small btn-danger" onClick={onDelete}>Elimina</button>
    </div>
  );
}
