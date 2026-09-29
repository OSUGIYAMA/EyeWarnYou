// Cross-jurisdiction list landscape: how far US, Japanese and Chinese designations agree, and how they evolve.
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Loader2 } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api.ts";
import { cx, fmtDate, LIST_NAMES } from "../lib/format.ts";
import { Badge, Card, CardHeader } from "./ui/index.tsx";
import { RankBars, StackedBars, type ChartSeries } from "./charts.tsx";
import { CountryName } from "./CountryPicker.tsx";

interface OverlapRow {
  id: string;
  label: string;
  sourceNote: string;
  n: number;
  anyHit: number;
  byList: Record<string, number>;
  examples: { name: string; matched: string; list: string; score: number }[];
}
interface Landscape {
  status: "ready" | "computing";
  computedAt: string;
  threshold: number;
  elByYear: { years: string[]; series: ChartSeries[] };
  cnByQuarter: { periods: string[]; series: ChartSeries[] };
  metiByCountry: { iso2: string; total: number; codes: Record<string, number> }[];
  overlap: OverlapRow[];
}

const CODE: Record<string, string> = { N: "nuclear", M: "missile", C: "chemical", B: "biological", CW: "conventional" };

export function LandscapeView() {
  const q = useQuery({
    queryKey: ["landscape"],
    queryFn: async () => {
      const res = await fetch("/api/landscape");
      return (await res.json()) as Landscape;
    },
    refetchInterval: (query) => (query.state.data?.status === "ready" ? false : 3000),
  });
  const d = q.data;
  if (!d || d.status !== "ready")
    return (
      <Card className="flex items-center gap-3 p-6 text-[13px] text-fg-2">
        <Loader2 className="size-4 animate-spin text-fg-3" />
        Matching every designation against the other jurisdictions’ lists — this takes about 20 seconds after each data update.
      </Card>
    );
  const years = d.elByYear.years.filter((y) => y >= "2008");
  const offset = d.elByYear.years.indexOf(years[0]);
  const elSeries = d.elByYear.series.map((s) => ({ ...s, values: s.values.slice(offset) }));
  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-[13.5px] text-fg-2">
        The same entity can be designated by Washington, Tokyo and Beijing for different reasons — or by only one of them. These views compare the lists Kanmon holds, matching names with the screening engine at a score of {d.threshold} or more (strict enough that most matches are the same legal entity; a few will be namesakes). Computed {fmtDate(d.computedAt)}.
      </p>

      <Card>
        <CardHeader title="How far do the lists agree?" subtitle="Share of each group of designations that also appears on the other jurisdiction’s lists" />
        <div className="divide-y divide-line">
          {d.overlap.map((o) => (
            <OverlapLine key={o.id} o={o} />
          ))}
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="US Entity List — entries by year listed" subtitle="Current entries by the year of their original listing, grouped by address country (entries removed since are not shown)" />
          <div className="p-4">
            <StackedBars periods={years} series={elSeries} ariaLabel="US Entity List entries by year of listing and country" />
          </div>
        </Card>
        <Card>
          <CardHeader title="China’s designations — by quarter and target" subtitle="MOFCOM Control List, Watch List, Unreliable Entity List and countermeasure designations held by Kanmon" />
          <div className="p-4">
            <StackedBars periods={d.cnByQuarter.periods} series={d.cnByQuarter.series} ariaLabel="Chinese designations by quarter and target country" />
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="METI End User List — by country" subtitle="Number of listed entities; concern types shown as counts" />
        <div className="p-4">
          <RankBars
            rows={d.metiByCountry.map((r) => ({
              label: r.iso2 === "—" ? "Unspecified" : <CountryName iso2={r.iso2} />,
              value: r.total,
              note: Object.entries(r.codes)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([k, v]) => `${CODE[k] ?? k} ${v}`)
                .join(" · "),
            }))}
          />
        </div>
      </Card>
    </div>
  );
}

function OverlapLine({ o }: { o: OverlapRow }) {
  const [open, setOpen] = useState(false);
  const pct = o.n ? (o.anyHit / o.n) * 100 : 0;
  return (
    <div className="px-4 py-3">
      <button onClick={() => setOpen((x) => !x)} className="grid w-full grid-cols-[minmax(0,1fr)_220px_110px] items-center gap-4 text-left">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[13.5px] font-medium">
            <ChevronDown className={cx("size-3.5 text-fg-3 transition-transform", !open && "-rotate-90")} />
            {o.label}
          </div>
          <div className="pl-5 text-[12px] text-fg-3">
            {o.sourceNote} · also on{" "}
            {Object.entries(o.byList)
              .sort((a, b) => b[1] - a[1])
              .map(([l, n]) => `${LIST_NAMES[l]?.name ?? l} (${n})`)
              .join(", ") || "none"}
          </div>
        </div>
        <div className="h-2.5 rounded-r-[4px] bg-panel-2">
          <div className="h-full rounded-r-[4px]" style={{ width: `${Math.max(pct, 0.5)}%`, background: "var(--seq-1)" }} />
        </div>
        <div className="text-right text-[13px] tabular">
          <span className="font-semibold">{pct.toFixed(pct < 10 ? 1 : 0)}%</span>
          <span className="ml-1.5 text-[12px] text-fg-3">
            {o.anyHit.toLocaleString()} / {o.n.toLocaleString()}
          </span>
        </div>
      </button>
      {open && o.examples.length > 0 && (
        <div className="mt-2 space-y-1 pl-5 text-[12.5px]">
          {o.examples.map((e, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="truncate">{e.name}</span>
              <span className="text-fg-3">→</span>
              <span className="truncate text-fg-2">{e.matched}</span>
              <Badge tone={LIST_NAMES[e.list]?.tone ?? "gray"}>{e.list}</Badge>
              <span className="font-mono text-[11.5px] text-fg-3">{Math.round(e.score)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
