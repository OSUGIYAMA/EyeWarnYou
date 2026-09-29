// Small, dependency-free SVG charts following the house data-viz rules: thin marks, 2px surface
// gaps between stacked segments, 4px rounded data-ends, a recessive hairline grid, a legend for every
// multi-series chart, per-column hover/focus tooltips, and a table view as the accessible alternative.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "../lib/format.ts";
import { Segmented } from "./ui/index.tsx";

export interface ChartSeries {
  key: string;
  label: string;
  values: number[];
}

const SERIES_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)"];
/** Colour follows the entity: "Other" is always neutral, named series take slots in order. */
export const seriesColor = (s: ChartSeries, i: number) => (s.key === "OTHER" ? "var(--series-other)" : SERIES_COLORS[i] ?? "var(--series-other)");

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(640);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.floor(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function niceMax(v: number): number {
  if (v <= 5) return 5;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

export function Legend({ series }: { series: ChartSeries[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-fg-2">
      {series.map((s, i) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: seriesColor(s, i) }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

export function StackedBars({ periods, series, height = 220, ariaLabel }: { periods: string[]; series: ChartSeries[]; height?: number; ariaLabel: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [view, setView] = useState<"chart" | "table">("chart");
  const totals = periods.map((_, i) => series.reduce((n, s) => n + s.values[i], 0));
  const max = niceMax(Math.max(...totals, 1));
  const padL = 36;
  const padB = 22;
  const padT = 8;
  const plotW = width - padL - 8;
  const plotH = height - padB - padT;
  const slot = plotW / Math.max(1, periods.length);
  const barW = Math.min(24, Math.max(4, slot * 0.62));
  const y = (v: number) => padT + plotH - (v / max) * plotH;
  const ticks = [0, max / 4, max / 2, (3 * max) / 4, max];
  const labelEvery = Math.ceil(periods.length / Math.max(1, Math.floor(plotW / 56)));
  const tipW = 224;
  const tipLeft = (i: number) => {
    const cx0 = padL + slot * i + slot / 2;
    return cx0 + 14 + tipW <= width ? cx0 + 14 : Math.max(0, cx0 - 14 - tipW);
  };

  return (
    <div className="min-w-0">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 pt-1">
          <Legend series={series} />
        </div>
        <Segmented
          value={view}
          onChange={setView}
          className="!h-7 shrink-0 [&>button]:px-2.5 [&>button]:text-[12px]"
          options={[
            { value: "chart", label: "Chart" },
            { value: "table", label: "Table" },
          ]}
        />
      </div>
      {view === "table" ? (
        <DataTable periods={periods} series={series} totals={totals} />
      ) : (
        <div ref={ref} className="relative w-full min-w-0" onMouseLeave={() => setHover(null)}>
          <svg width={width} height={height} role="img" aria-label={ariaLabel} className="block">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={padL} x2={width - 8} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--border-strong)" : "var(--border)"} strokeWidth={1} shapeRendering="crispEdges" />
                <text x={padL - 8} y={y(t) + 3.5} textAnchor="end" className="fill-fg-3 text-[11px] tabular">
                  {Math.round(t).toLocaleString()}
                </text>
              </g>
            ))}
            {periods.map((p, i) => {
              const cx0 = padL + slot * i + slot / 2;
              let acc = 0;
              const segs = series
                .map((s, si) => ({ s, si, v: s.values[i] }))
                .filter((x) => x.v > 0)
                .map((x) => {
                  const y0 = y(acc);
                  acc += x.v;
                  return { ...x, y0, y1: y(acc) };
                });
              return (
                <g key={p} opacity={hover === null || hover === i ? 1 : 0.45} style={{ transition: "opacity 120ms" }}>
                  {segs.map((seg, k) => {
                    const top = k === segs.length - 1;
                    const x0 = cx0 - barW / 2;
                    const h = Math.max(0, seg.y0 - seg.y1 - (k > 0 ? 2 : 0)); // 2px surface gap
                    const yTop = seg.y1;
                    const r = top ? Math.min(4, h, barW / 2) : 0;
                    const d = `M${x0},${yTop + h} V${yTop + r} Q${x0},${yTop} ${x0 + r},${yTop} H${x0 + barW - r} Q${x0 + barW},${yTop} ${x0 + barW},${yTop + r} V${yTop + h} Z`;
                    return <path key={seg.s.key} d={d} fill={seriesColor(seg.s, seg.si)} />;
                  })}
                  {i % labelEvery === 0 && (
                    <text x={cx0} y={height - 6} textAnchor="middle" className="fill-fg-3 text-[11px] tabular">
                      {p}
                    </text>
                  )}
                  <rect
                    x={padL + slot * i}
                    y={padT}
                    width={slot}
                    height={plotH}
                    fill="transparent"
                    tabIndex={0}
                    aria-label={`${p}: ${totals[i]}`}
                    onMouseEnter={() => setHover(i)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                    className="cursor-default outline-none"
                  />
                </g>
              );
            })}
          </svg>
          {hover !== null && (
            <div className="material pointer-events-none absolute z-10 rounded-xl px-3 py-2.5 text-[12.5px] shadow-float" style={{ left: tipLeft(hover), top: 4, width: tipW }}>
              <div className="mb-1.5 font-semibold text-fg">{periods[hover]}</div>
              <div className="space-y-0.5">
                {series.map((s, i) =>
                  s.values[hover] ? (
                    <div key={s.key} className="flex items-center gap-2">
                      <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: seriesColor(s, i) }} />
                      <span className="min-w-6 font-semibold tabular text-fg">{s.values[hover].toLocaleString()}</span>
                      <span className="truncate text-fg-2">{s.label}</span>
                    </div>
                  ) : null,
                )}
              </div>
              <div className="mt-1.5 flex items-center gap-2 border-t border-line pt-1.5 text-fg-2">
                <span className="w-3" />
                <span className="min-w-6 font-semibold tabular text-fg">{totals[hover].toLocaleString()}</span>
                Total
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** The accessible alternative to a chart, drawn as a grouped list: hairline rows, numbers aligned. */
function DataTable({ periods, series, totals }: { periods: string[]; series: ChartSeries[]; totals: number[] }) {
  const cell = "border-b border-line px-2 py-1.5 first:pl-0 last:pr-0";
  return (
    <div className="scroll-thin max-h-72 overflow-auto border-y border-line">
      <table className="w-full text-[13px] tabular">
        <thead className="sticky top-0 bg-panel text-left text-[12px] text-fg-3">
          <tr>
            <th className={cx(cell, "font-medium")}>Period</th>
            {series.map((s) => (
              <th key={s.key} className={cx(cell, "text-right font-medium")}>
                {s.label}
              </th>
            ))}
            <th className={cx(cell, "text-right font-medium")}>Total</th>
          </tr>
        </thead>
        <tbody className="[&>tr:last-child>td]:border-b-0">
          {periods.map((p, i) => (
            <tr key={p}>
              <td className={cell}>{p}</td>
              {series.map((s) => (
                <td key={s.key} className={cx(cell, "text-right", !s.values[i] && "text-fg-3")}>
                  {s.values[i].toLocaleString()}
                </td>
              ))}
              <td className={cx(cell, "text-right font-semibold")}>{totals[i].toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Single-series horizontal bars for ranked magnitudes (one hue — no legend needed). Values sit at the bar tip. */
export function RankBars({ rows, max }: { rows: { label: ReactNode; value: number; note?: string }[]; max?: number }) {
  const m = max ?? Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="k-list" style={{ ["--inset" as string]: "0px" }}>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,150px)_minmax(0,1fr)] items-center gap-x-4 py-2 text-[13px] md:grid-cols-[minmax(0,170px)_minmax(0,1fr)_minmax(0,260px)]">
          <div className="truncate">{r.label}</div>
          <div className="flex items-center gap-2">
            <div className="h-2.5 shrink-0 rounded-r-[4px]" style={{ width: `calc(${(r.value / m) * 100}% - 3rem)`, minWidth: 2, background: "var(--seq-1)" }} />
            <span className="font-semibold tabular">{r.value.toLocaleString()}</span>
          </div>
          {r.note && <div className="hidden truncate text-right text-[12.5px] text-fg-3 md:block">{r.note}</div>}
        </div>
      ))}
    </div>
  );
}
