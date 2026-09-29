// Commerce Country Chart (15 CFR 738 Supp. No. 1): a calm, filterable matrix of reasons for control by destination.
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Grid3x3, Search, X } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CHART_COLUMNS, CHART_REASONS, type ChartColumn, type CountryChartRow } from "@/shared/regs.ts";
import { Page } from "../components/AppShell.tsx";
import { useRegSheet } from "../components/RegSheet.tsx";
import { Button, Card, Empty, Input, PageHeader, Section, Skeleton } from "../components/ui/index.tsx";
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
const colLabel = (c: string) => `${c.replace(/\d$/, "")} ${c.slice(-1)}`;

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
          <button key={i} type="button" onClick={() => open(target)} className="text-accent-text hover:underline">
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
          <tr key={r.iso2} className="group">
            <th scope="row" className="sticky left-0 z-10 border-b border-r border-b-line/60 border-r-line bg-panel px-4 py-0 text-left font-normal group-hover:bg-panel-2">
              <div className="flex h-8 items-center gap-2.5">
                <span className="w-6 shrink-0 text-[12px] font-medium tabular text-fg-3">{r.iso2}</span>
                <Link to={`/regulations/countries/${r.iso2}`} className="truncate text-[13.5px] text-fg hover:text-accent-text">
                  {r.earName}
                </Link>
                {r.footnotes.length > 0 && (
                  <span className="-mt-2 flex shrink-0 gap-1">
                    {r.footnotes.map((n) => (
                      <button key={n} type="button" title={footnotes[String(n)]} onClick={() => onFootnote(n)} className="text-[10.5px] font-medium leading-none text-accent-text hover:underline">
                        {n}
                      </button>
                    ))}
                  </span>
                )}
              </div>
            </th>
            {CHART_COLUMNS.map((c) => (
              <td key={c} data-col={c} className={cx("border-b border-b-line/60 p-0 text-center group-hover:bg-fill-2", GROUP_START.has(c) && "border-l border-l-line/70")}>
                {xs.has(c) && <span className="inline-block size-[7px] rounded-full bg-fg/75 align-middle" aria-label={`X in ${c}`} />}
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
    const m: Record<string, CountryChartRow[]> = {};
    for (const r of all) for (const n of r.footnotes) (m[n] ??= []).push(r);
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
            Find the destination and the column your ECCN names. An X means a license is required unless an exception applies.
            <span className="mt-1 block text-[12.5px] text-fg-3">
              {stamp ? (
                <>
                  <span title={stamp.source}>As amended to {fmtDate(stamp.asOf)}</span>
                  {" · "}
                  <a href={stamp.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 hover:text-fg">
                    eCFR <ExternalLink className="size-3" />
                  </a>
                </>
              ) : (
                "Loading source…"
              )}
            </span>
          </>
        }
        actions={
          <Button variant="ghost" onClick={() => open({ kind: "section", id: "738.4", label: "15 CFR 738.4" })}>
            How to use the chart
          </Button>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="relative w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setQ("")} placeholder="Find a country" className="pl-9" aria-label="Find a country" />
        </div>
        {cols.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-fg-2">
            Marked in
            {cols.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => toggle(c)}
                className="inline-flex h-7 items-center gap-1 rounded-full bg-accent-soft pl-3 pr-2 text-[13px] font-medium text-accent-text hover:opacity-80"
                aria-label={`Remove filter ${c}`}
              >
                {colLabel(c)}
                <X className="size-3.5" />
              </button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => setCols([])}>
              Clear
            </Button>
          </div>
        ) : (
          <span className="text-[13px] text-fg-3">Select a column number to show only the countries marked in it.</span>
        )}
        <span className="ml-auto text-[13px] tabular text-fg-3">{chart.data ? (rows.length === all.length ? `${all.length} countries` : `${rows.length} of ${all.length} countries`) : ""}</span>
      </div>

      <div className="scroll-thin max-h-[calc(100vh-150px)] min-h-[420px] overflow-auto border-y border-line bg-panel">
        {chart.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 14 }, (_, i) => (
              <Skeleton key={i} className="h-6" />
            ))}
          </div>
        ) : chart.isError ? (
          <Empty icon={<Grid3x3 />} title="The Country Chart could not be loaded">
            Check that the server is running and the regulatory data has been synced in Settings.
          </Empty>
        ) : (
          <table
            className="w-full min-w-[880px] table-fixed border-separate border-spacing-0"
            onMouseOver={(e) => setHover((e.target as HTMLElement).closest("td")?.dataset.col ?? null)}
            onMouseLeave={() => setHover(null)}
          >
            <colgroup>
              <col className="w-[260px]" />
              {CHART_COLUMNS.map((c) => (
                <col key={c} className={cx(hover === c ? "bg-fill-2" : cols.includes(c) && "bg-accent-soft/50")} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th rowSpan={2} scope="col" className="sticky left-0 top-0 z-30 border-b border-r border-line bg-panel px-4 pb-2.5 text-left align-bottom text-[12.5px] font-medium text-fg-3">
                  Country
                </th>
                {REASON_GROUPS.map((g) => (
                  <th
                    key={g.reason}
                    colSpan={g.cols.length}
                    scope="colgroup"
                    title={CHART_REASONS[g.reason]}
                    className="sticky top-0 z-20 h-9 border-l border-line bg-panel px-1 pt-1 text-center text-[12.5px] font-semibold text-fg"
                  >
                    {g.reason}
                  </th>
                ))}
              </tr>
              <tr>
                {CHART_COLUMNS.map((c) => {
                  const on = cols.includes(c);
                  return (
                    <th key={c} scope="col" className={cx("sticky top-9 z-20 h-8 border-b border-line bg-panel p-0", GROUP_START.has(c) && "border-l")}>
                      <button
                        type="button"
                        onClick={() => toggle(c)}
                        onMouseEnter={() => setHover(c)}
                        aria-pressed={on}
                        title={`${CHART_REASONS[c.replace(/\d$/, "")]}, column ${c.slice(-1)} — ${colCount[c] ?? 0} countries marked. Select to filter.`}
                        className="flex h-8 w-full min-w-[38px] items-center justify-center"
                      >
                        <span
                          className={cx(
                            "inline-flex size-6 items-center justify-center rounded-full text-[12px] tabular transition-colors",
                            on ? "bg-accent font-semibold text-accent-fg" : hover === c ? "bg-fill text-fg" : "text-fg-3 hover:text-fg",
                          )}
                        >
                          {c.slice(-1)}
                        </span>
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
                    <Empty icon={<Search />} title="No countries match">
                      {cols.length ? `No country is marked in all of ${cols.map(colLabel).join(", ")}.` : "Try another name or a two-letter code."}
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
        <Section title="Footnotes" description="As printed under the chart." className="mt-10">
          <Card className="k-list overflow-hidden [--inset:52px]">
            {fnKeys.map((n) => (
              <div key={n} id={`chart-fn-${n}`} className={cx("flex scroll-mt-24 gap-3 px-4 py-3 transition-colors duration-500", flash === Number(n) && "bg-amber-soft")}>
                <span className="w-6 shrink-0 text-right text-[13px] font-semibold tabular text-fg-2">{n}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] leading-relaxed">
                    <SectionRefs text={footnotes[n]} />
                  </div>
                  {(byFootnote[n]?.length ?? 0) > 0 && (
                    <div className="mt-1 text-[12.5px] leading-relaxed text-fg-3">
                      Applies to{" "}
                      {byFootnote[n].map((r, i) => (
                        <span key={r.iso2}>
                          {i > 0 && ", "}
                          <Link to={`/regulations/countries/${r.iso2}`} className="text-fg-2 hover:text-accent-text hover:underline">
                            {r.earName}
                          </Link>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </Card>
        </Section>
      )}
    </Page>
  );
}
