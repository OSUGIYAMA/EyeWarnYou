// Commerce Country Chart (15 CFR 738 Supp. No. 1) as a dense, filterable matrix.
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Grid3x3, Search, X } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CHART_COLUMNS, CHART_REASONS, type ChartColumn, type CountryChartRow } from "@/shared/regs.ts";
import { Page } from "../components/AppShell.tsx";
import { useRegSheet } from "../components/RegSheet.tsx";
import { Button, Card, CardHeader, Empty, Input, PageHeader, Skeleton } from "../components/ui/index.tsx";
import { api, type CountryChart } from "../lib/api.ts";
import { cx, fmtDate } from "../lib/format.ts";

type Reason = keyof typeof CHART_REASONS;

const REASON_GROUPS: { reason: Reason; cols: ChartColumn[] }[] = (() => {
  const out: { reason: Reason; cols: ChartColumn[] }[] = [];
  for (const c of CHART_COLUMNS) {
    const r = c.replace(/\d$/, "") as Reason;
    const last = out.at(-1);
    if (last && last.reason === r) last.cols.push(c);
    else out.push({ reason: r, cols: [c] });
  }
  return out;
})();
const GROUP_START = new Set(REASON_GROUPS.map((g) => g.cols[0]));

/** Tone by reason family: multilateral regimes orange, foreign-policy reasons amber, anti-terrorism gray. */
function squareTone(col: string): string {
  const r = col.replace(/\d$/, "");
  if (r === "AT") return "bg-fg-3";
  if (r === "RS" || r === "CC" || r === "FC") return "bg-amber";
  return "bg-orange";
}

/** Turn "§ 746.8" and "supplement no. 2 to part 746" into links that open the regulation sheet. */
function SectionRefs({ text }: { text: string }) {
  const open = useRegSheet();
  const parts = text.split(/(§+\s*7\d\d\.\d+[a-z]?(?:\([a-z0-9]+\))*|[Ss]upplement [Nn]o\.\s*\d+ to part 7\d\d)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (i % 2 === 0) return p;
        const sec = p.match(/(7\d\d\.\d+[a-z]?)((?:\([a-z0-9]+\))*)/);
        const supp = p.match(/no\.\s*(\d+) to part (7\d\d)/i);
        const target = sec
          ? { kind: "section" as const, id: sec[1], highlight: sec[2] || undefined, label: `15 CFR ${sec[1]}${sec[2]}` }
          : supp
            ? { kind: "section" as const, id: `${supp[2]} Supp. ${supp[1]}`, label: `15 CFR ${supp[2]} Supp. No. ${supp[1]}` }
            : null;
        return target ? (
          <button key={i} type="button" onClick={() => open(target)} className="text-accent-text decoration-accent/40 underline-offset-2 hover:underline">
            {p}
          </button>
        ) : (
          p
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// Body rows — memoised so column hover (which only restyles <col>) never re-renders 200 rows.

const ChartBody = memo(function ChartBody({ rows, footnotes, onFootnote }: { rows: CountryChartRow[]; footnotes: Record<string, string>; onFootnote: (n: number) => void }) {
  return (
    <tbody>
      {rows.map((r) => {
        const xs = new Set<string>(r.x);
        return (
          <tr key={r.iso2} className="group hover:bg-panel-2">
            <th scope="row" className="sticky left-0 z-10 border-b border-r border-line bg-panel px-3 py-0 text-left font-normal group-hover:bg-panel-2">
              <div className="flex h-7 items-center gap-2">
                <span className="w-6 shrink-0 font-mono text-[10.5px] text-fg-3">{r.iso2}</span>
                <Link to={`/regulations/countries/${r.iso2}`} className="truncate text-[12.5px] text-fg hover:underline">
                  {r.earName}
                </Link>
                {r.footnotes.length > 0 && (
                  <span className="flex shrink-0 gap-0.5">
                    {r.footnotes.map((n) => (
                      <button
                        key={n}
                        type="button"
                        title={footnotes[String(n)]}
                        onClick={() => onFootnote(n)}
                        className="-mt-1.5 text-[9.5px] font-medium leading-none text-accent-text hover:underline"
                      >
                        {n}
                      </button>
                    ))}
                  </span>
                )}
              </div>
            </th>
            {CHART_COLUMNS.map((c) => (
              <td key={c} data-col={c} className={cx("border-b border-line/70 p-0 text-center hover:bg-accent-soft", GROUP_START.has(c) && "border-l border-l-line")}>
                {xs.has(c) && <span className={cx("inline-block size-[9px] rounded-[2px] align-middle", squareTone(c))} aria-label={`X in ${c}`} />}
              </td>
            ))}
          </tr>
        );
      })}
    </tbody>
  );
});

// ---------------------------------------------------------------------------

export function ChartPage() {
  const open = useRegSheet();
  const chart = useQuery({ queryKey: ["chart"], queryFn: () => api.get<CountryChart>("/chart"), staleTime: Infinity });
  const [q, setQ] = useState("");
  const [cols, setCols] = useState<ChartColumn[]>([]);
  const [hover, setHover] = useState<string | null>(null);
  const [flash, setFlash] = useState<number | null>(null);

  const footnotes = chart.data?.footnotes ?? {};
  const all = chart.data?.rows ?? [];
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return all.filter((r) => (!s || r.earName.toLowerCase().includes(s) || r.iso2.toLowerCase() === s) && cols.every((c) => r.x.includes(c)));
  }, [all, q, cols]);

  const toggle = (c: ChartColumn) => setCols((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));
  const onFootnote = useCallback((n: number) => {
    document.getElementById(`chart-fn-${n}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlash(n);
  }, []);
  useEffect(() => {
    if (flash === null) return;
    const t = setTimeout(() => setFlash(null), 1600);
    return () => clearTimeout(t);
  }, [flash]);

  const colCount = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of all) for (const c of r.x) m[c] = (m[c] ?? 0) + 1;
    return m;
  }, [all]);
  const byFootnote = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const r of all) for (const n of r.footnotes) (m[n] ??= []).push(r.iso2);
    return m;
  }, [all]);

  const stamp = chart.data?.stamp;
  const fnKeys = Object.keys(footnotes).sort((a, b) => Number(a) - Number(b));

  return (
    <Page wide>
      <PageHeader
        title="Commerce Country Chart"
        description={
          <>
            Supplement No. 1 to Part 738. Each ECCN names a reason and column (e.g. NS Column 2); an X where that column meets the destination means a license is required unless a license exception
            applies —{" "}
            <button type="button" onClick={() => open({ kind: "section", id: "738.4", label: "15 CFR 738.4" })} className="text-accent-text hover:underline">
              §738.4
            </button>
            .
            {stamp && (
              <span className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-fg-3">
                <span>{stamp.source}</span>
                <span>·</span>
                <span>
                  as amended to <span className="tabular text-fg-2">{fmtDate(stamp.asOf)}</span>
                </span>
                <span>·</span>
                <a href={stamp.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 hover:text-fg">
                  eCFR <ExternalLink className="size-3" />
                </a>
              </span>
            )}
          </>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-2.5 top-2 size-4 text-fg-3" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setQ("")} placeholder="Filter countries" className="pl-8" aria-label="Filter countries" />
        </div>
        {cols.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[12.5px] text-fg-3">Only countries with X in</span>
            {cols.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => toggle(c)}
                className="inline-flex h-6 items-center gap-1 rounded-md bg-accent-soft pl-1.5 pr-1 font-mono text-[11.5px] font-medium text-accent-text ring-1 ring-inset ring-accent/20 hover:ring-accent/40"
                aria-label={`Remove filter ${c}`}
              >
                {c}
                <X className="size-3" />
              </button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => setCols([])}>
              Clear
            </Button>
          </div>
        ) : (
          <span className="text-[12.5px] text-fg-3">Click a column header to show only countries with an X in that column.</span>
        )}
        <div className="ml-auto flex items-center gap-3 text-[11.5px] text-fg-3">
          <span className="flex items-center gap-1.5">
            <span className="size-[9px] rounded-[2px] bg-orange" /> NS · MT · NP · CB
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-[9px] rounded-[2px] bg-amber" /> RS · FC · CC
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-[9px] rounded-[2px] bg-fg-3" /> AT
          </span>
          <span className="tabular">{chart.data ? `${rows.length} of ${all.length}` : ""}</span>
        </div>
      </div>

      <div className="scroll-thin max-h-[calc(100vh-230px)] min-h-[420px] overflow-auto rounded-xl border border-line bg-panel shadow-card">
        {chart.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 14 }, (_, i) => (
              <Skeleton key={i} className="h-6" />
            ))}
          </div>
        ) : chart.isError ? (
          <Empty icon={<Grid3x3 className="size-5" />} title="The Country Chart could not be loaded">
            Check that the Kanmon server is running and the regulatory data has been synced (Settings → Data).
          </Empty>
        ) : (
          <table className="w-full min-w-[820px] border-separate border-spacing-0 text-[12.5px]" onMouseOver={(e) => setHover((e.target as HTMLElement).closest("td")?.dataset.col ?? null)} onMouseLeave={() => setHover(null)}>
            <colgroup>
              <col className="w-[240px]" />
              {CHART_COLUMNS.map((c) => (
                <col key={c} className={cx(hover === c ? "bg-accent-soft/70" : cols.includes(c) && "bg-accent-soft/35")} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th rowSpan={2} scope="col" className="sticky left-0 top-0 z-30 border-b border-r border-line bg-panel-2 px-3 text-left align-bottom text-[11.5px] font-medium text-fg-3">
                  <div className="pb-2">Country</div>
                </th>
                {REASON_GROUPS.map((g) => (
                  <th
                    key={g.reason}
                    colSpan={g.cols.length}
                    scope="colgroup"
                    title={CHART_REASONS[g.reason]}
                    className="sticky top-0 z-20 h-8 border-b border-l border-line bg-panel-2 px-1 text-center text-[11.5px] font-semibold tracking-wide text-fg-2"
                  >
                    {g.reason}
                  </th>
                ))}
              </tr>
              <tr>
                {CHART_COLUMNS.map((c) => {
                  const on = cols.includes(c);
                  return (
                    <th key={c} scope="col" className={cx("sticky top-8 z-20 h-8 border-b border-line bg-panel-2 p-0", GROUP_START.has(c) && "border-l")}>
                      <button
                        type="button"
                        onClick={() => toggle(c)}
                        onMouseEnter={() => setHover(c)}
                        aria-pressed={on}
                        title={`${CHART_REASONS[c.replace(/\d$/, "")]} — Column ${c.slice(-1)} · ${colCount[c] ?? 0} countries marked. Click to filter.`}
                        className={cx(
                          "flex h-8 w-full min-w-[38px] items-center justify-center font-mono text-[11px] transition-colors",
                          on ? "bg-accent-soft font-semibold text-accent-text" : hover === c ? "bg-accent-soft/70 text-fg" : "text-fg-3 hover:text-fg",
                        )}
                      >
                        {c.slice(-1)}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            {rows.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={CHART_COLUMNS.length + 1}>
                    <Empty icon={<Search className="size-5" />} title="No countries match">
                      {cols.length ? `No country has an X in all of ${cols.join(", ")}.` : "Try another name or ISO code."}
                    </Empty>
                  </td>
                </tr>
              </tbody>
            ) : (
              <ChartBody rows={rows} footnotes={footnotes} onFootnote={onFootnote} />
            )}
          </table>
        )}
      </div>

      {fnKeys.length > 0 && (
        <Card className="mt-6">
          <CardHeader title="Footnotes" subtitle="As printed under the Commerce Country Chart" />
          <ol className="divide-y divide-line">
            {fnKeys.map((n) => (
              <li
                key={n}
                id={`chart-fn-${n}`}
                className={cx("flex gap-3 px-4 py-2.5 text-[12.5px] leading-relaxed transition-colors", flash === Number(n) ? "bg-amber-soft" : "")}
              >
                <span className="w-5 shrink-0 pt-px text-right font-mono text-[11.5px] font-semibold text-fg-2">{n}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-fg-2">
                    <SectionRefs text={footnotes[n]} />
                  </div>
                  {(byFootnote[n]?.length ?? 0) > 0 && (
                    <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-fg-3">
                      Applies to
                      {byFootnote[n].map((iso) => (
                        <Link key={iso} to={`/regulations/countries/${iso}`} className="rounded bg-panel-2 px-1 font-mono text-[10.5px] text-fg-2 ring-1 ring-line hover:text-fg">
                          {iso}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </Page>
  );
}

