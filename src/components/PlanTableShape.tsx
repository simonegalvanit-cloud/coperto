import type { ReactNode } from "react";
import type { PlanTable } from "@/lib/floor";

/** One table drawn on the floor plan, with up to three short lines of text inside. */
export function PlanTableShape({ t, lines }: { t: PlanTable; lines: ReactNode[] }) {
  const cx = t.x + t.w / 2;
  const cy = t.y + t.h / 2;
  const lineH = 21;
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

/** Shortens text to what fits in a table this wide (`charWidth` in plan units). */
export function fit(text: string, width: number, charWidth = 10): string {
  const max = Math.max(3, Math.floor((width - 6) / charWidth));
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

export function PlanGrid() {
  return (
    <defs>
      <pattern id="plan-grid" width="25" height="25" patternUnits="userSpaceOnUse">
        <path d="M25 0H0V25" fill="none" className="plan-grid-line" />
      </pattern>
    </defs>
  );
}
