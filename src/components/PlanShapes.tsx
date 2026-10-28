import type { ReactNode } from "react";
import type { FixtureKind, Shape } from "@/lib/floor";

type Box = { x: number; y: number; w: number; h: number };

/** Patterns used by the plan: the 50 cm floor grid and the hatching for kitchens. */
export function PlanDefs() {
  return (
    <defs>
      <pattern id="plan-grid" width="50" height="50" patternUnits="userSpaceOnUse">
        <path d="M50 0H0V50" fill="none" className="plan-grid-line" />
      </pattern>
      <pattern id="plan-hatch" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <path d="M0 0V18" className="plan-hatch-line" />
      </pattern>
    </defs>
  );
}

/** Shortens text to what fits in this width (`charWidth` in cm per character). */
export function fit(text: string, width: number, charWidth = 10): string {
  const max = Math.max(3, Math.floor((width - 6) / charWidth));
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

function Label({ b, text, size = 20 }: { b: Box; text: string; size?: number }) {
  if (!text) return null;
  const vertical = b.h > b.w * 1.6 && b.w < size * 4;
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  return (
    <text
      className="fx-label"
      x={cx}
      y={cy}
      fontSize={size}
      dominantBaseline="central"
      textAnchor="middle"
      transform={vertical ? `rotate(-90 ${cx} ${cy})` : undefined}
    >
      {fit(text, vertical ? b.h : b.w, size * 0.55)}
    </text>
  );
}

/** A door or entrance: the leaf drawn open with its swing, along the box's long side. */
function Swing({ b }: { b: Box }) {
  if (b.w >= b.h) {
    const y = b.y + b.h / 2;
    return <path className="fx-swing" d={`M${b.x} ${y}V${y - b.w}M${b.x + b.w} ${y}A${b.w} ${b.w} 0 0 0 ${b.x} ${y - b.w}`} />;
  }
  const x = b.x + b.w / 2;
  return <path className="fx-swing" d={`M${x} ${b.y}H${x + b.h}M${x} ${b.y + b.h}A${b.h} ${b.h} 0 0 0 ${x + b.h} ${b.y}`} />;
}

/** Step lines across the long side of a staircase. */
function Steps({ b }: { b: Box }) {
  const along = b.h >= b.w;
  const length = along ? b.h : b.w;
  const lines: string[] = [];
  for (let d = 28; d < length; d += 28) {
    lines.push(along ? `M${b.x} ${b.y + d}h${b.w}` : `M${b.x + d} ${b.y}v${b.h}`);
  }
  return <path className="fx-steps" d={lines.join("")} />;
}

export function FixtureShape({ f }: { f: Box & { kind: FixtureKind; label: string } }) {
  const r = <rect x={f.x} y={f.y} width={f.w} height={f.h} />;
  switch (f.kind) {
    case "wall":
      return <g className="fx fx-wall">{r}</g>;
    case "column":
      return <g className="fx fx-column">{r}</g>;
    case "window":
      return (
        <g className="fx fx-window">
          {r}
          {f.w >= f.h ? (
            <path d={`M${f.x} ${f.y + f.h / 2}h${f.w}`} />
          ) : (
            <path d={`M${f.x + f.w / 2} ${f.y}v${f.h}`} />
          )}
        </g>
      );
    case "door":
    case "entrance":
      return (
        <g className={`fx fx-door${f.kind === "entrance" ? " fx-entrance" : ""}`}>
          {r}
          <Swing b={f} />
          {f.kind === "entrance" && <Label b={{ ...f, y: f.y + f.h + 4, h: 26 }} text={f.label} size={18} />}
        </g>
      );
    case "stairs":
      return (
        <g className="fx fx-stairs">
          {r}
          <Steps b={f} />
          <Label b={f} text={f.label} />
        </g>
      );
    case "plant":
      return (
        <g className="fx fx-plant">
          <ellipse cx={f.x + f.w / 2} cy={f.y + f.h / 2} rx={f.w / 2} ry={f.h / 2} />
          <Label b={f} text={f.label} size={16} />
        </g>
      );
    default:
      return (
        <g className={`fx fx-${f.kind}`}>
          {r}
          <Label b={f} text={f.label} size={f.kind === "kitchen" || f.kind === "toilets" ? 24 : 20} />
        </g>
      );
  }
}

type ZoneLike = Box & { name: string; bookableOnline: boolean };

const zoneLabel = (z: ZoneLike) => `${z.name}${z.bookableOnline ? "" : " · non online"}`;

/** Width of a zone's name tab, which is also its grab handle in the editor. */
export const zoneTabWidth = (z: ZoneLike) => Math.min(z.w, zoneLabel(z).length * 15 + 24);

/** A room or area: a light field. Drawn first, under everything. */
export function ZoneBody({ z }: { z: ZoneLike }) {
  return <rect className={`zone-body${z.bookableOnline ? "" : " is-offline"}`} x={z.x} y={z.y} width={z.w} height={z.h} />;
}

/** The zone's name in a tab at its top-left corner. Drawn last, so walls and fixtures never hide it. */
export function ZoneTab({ z, children }: { z: ZoneLike; children?: ReactNode }) {
  const w = zoneTabWidth(z);
  return (
    <g className={`zone-tab${z.bookableOnline ? "" : " is-offline"}`}>
      <rect x={z.x} y={z.y} width={w} height={36} />
      <text x={z.x + 12} y={z.y + 18} dominantBaseline="central">
        {fit(zoneLabel(z), w, 14)}
      </text>
      {children}
    </g>
  );
}

/** One table, at its real size, with up to three short lines of text inside. */
export function TableShape({ t, lines }: { t: Box & { shape: Shape }; lines: ReactNode[] }) {
  const cx = t.x + t.w / 2;
  const cy = t.y + t.h / 2;
  const lineH = 20;
  const top = cy - ((lines.length - 1) * lineH) / 2;
  return (
    <>
      {t.shape === "round" ? (
        <ellipse className="tb-body" cx={cx} cy={cy} rx={t.w / 2} ry={t.h / 2} />
      ) : (
        <rect className="tb-body" x={t.x} y={t.y} width={t.w} height={t.h} rx={3} />
      )}
      {lines.map((line, i) => (
        <text key={i} className={i === 0 ? "tb-label" : "tb-line"} x={cx} y={top + i * lineH} dominantBaseline="central" textAnchor="middle">
          {line}
        </text>
      ))}
    </>
  );
}
