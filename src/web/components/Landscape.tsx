// Cross-jurisdiction list landscape: how far US, Japanese and Chinese designations agree, and how they evolve.
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { fmtDate, LIST_NAMES } from "../lib/format.ts";
import { Card, Section, Spinner, Tooltip } from "./ui/index.tsx";
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
      <Card className="flex flex-col items-center px-6 py-14 text-center">
        <Spinner className="size-5" />
        <div className="mt-3 text-[15px] font-semibold tracking-tight">Comparing the lists</div>
        <p className="mt-1 max-w-sm text-[13.5px] text-fg-2">Every designation is matched against the other jurisdictions’ lists. This takes about 20 seconds after each data update.</p>
      </Card>
    );
  const years = d.elByYear.years.filter((y) => y >= "2008");
  const offset = d.elByYear.years.indexOf(years[0]);
  const elSeries = d.elByYear.series.map((s) => ({ ...s, values: s.values.slice(offset) }));
  return (
    <div className="space-y-10">
      <Section title="How far the lists agree" description="The share of each group of designations that another jurisdiction has also listed.">
        <Card className="k-list overflow-hidden" style={{ ["--inset" as string]: "136px" }}>
          {d.overlap.map((o) => (
            <Finding key={o.id} o={o} />
          ))}
        </Card>
        <p className="mt-2 px-1 text-[12px] leading-snug text-fg-3">
          Names matched by the screening engine at a score of {d.threshold} or more — most are the same legal entity, a few may be namesakes. Computed {fmtDate(d.computedAt)}.
        </p>
      </Section>

      <div className="grid gap-10 xl:grid-cols-2 xl:gap-8">
        <Section className="min-w-0" title="US Entity List by year listed" description="Current entries by the year first listed and address country; removed entries are not shown.">
          <Card className="p-5">
            <StackedBars periods={years} series={elSeries} ariaLabel="US Entity List entries by year of listing and country" />
          </Card>
        </Section>
        <Section className="min-w-0" title="China’s designations by quarter" description="MOFCOM Control List, Watch List, Unreliable Entity List and countermeasures, by target.">
          <Card className="p-5">
            <StackedBars periods={d.cnByQuarter.periods} series={d.cnByQuarter.series} ariaLabel="Chinese designations by quarter and target country" />
          </Card>
        </Section>
      </div>

      <Section title="METI End User List by country" description="Listed entities per country, with the most common concern types.">
        <Card className="px-5 py-2">
          <RankBars
            rows={d.metiByCountry.map((r) => ({
              label: r.iso2 === "—" ? "Unspecified" : <CountryName iso2={r.iso2} withCode={false} />,
              value: r.total,
              note: Object.entries(r.codes)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([k, v]) => `${CODE[k] ?? k} ${v}`)
                .join(" · "),
            }))}
          />
        </Card>
      </Section>
    </div>
  );
}

const listName = (l: string) => LIST_NAMES[l]?.name ?? l;

function joinAnd(parts: string[]): string {
  return parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** One headline finding: the share as a large number, one sentence saying what it means, matches on demand. */
function Finding({ o }: { o: OverlapRow }) {
  const [open, setOpen] = useState(false);
  const pct = o.n ? (o.anyHit / o.n) * 100 : 0;
  const noun = o.sourceNote.replace(/^all /, "");
  const lists = Object.entries(o.byList)
    .sort((a, b) => b[1] - a[1])
    .map(([l, n], _, all) => (all.length > 1 ? `${listName(l)} (${n.toLocaleString()})` : listName(l)));
  const caption =
    o.anyHit === 0
      ? `None of the ${o.n.toLocaleString()} ${noun} appear on the other jurisdictions’ lists.`
      : `${o.anyHit.toLocaleString()} of ${o.n.toLocaleString()} ${noun} are also on the ${joinAnd(lists)}.`;
  return (
    <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-x-6 px-5 py-4">
      <div className="text-[32px] font-semibold leading-none tracking-[-0.02em]">
        {pct.toFixed(pct > 0 && pct < 10 ? 1 : 0)}
        <span className="ml-0.5 text-[20px] font-medium text-fg-2">%</span>
      </div>
      <div className="min-w-0">
        <div className="text-[15px] font-semibold leading-snug tracking-tight">{o.label}</div>
        <p className="mt-0.5 text-[13.5px] leading-relaxed text-fg-2">{caption}</p>
        {o.examples.length > 0 && (
          <button type="button" onClick={() => setOpen((x) => !x)} aria-expanded={open} className="mt-1.5 inline-flex items-center gap-0.5 text-[13px] font-medium text-accent-text hover:underline">
            {open ? "Hide examples" : "Show examples"}
            <ChevronRight className={`size-3.5 transition-transform ${open ? "rotate-90" : ""}`} />
          </button>
        )}
        {open && (
          <div className="mt-2 border-t border-line">
            <div className="k-list" style={{ ["--inset" as string]: "0px" }}>
              {o.examples.map((e, i) => (
                <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-baseline gap-3 py-2 text-[13px]">
                  <span className="truncate" title={e.name}>
                    {e.name}
                  </span>
                  <span className="truncate text-fg-2" title={e.matched}>
                    <span className="text-fg-3">matches </span>
                    {e.matched}
                  </span>
                  <span className="flex items-baseline gap-2 whitespace-nowrap text-[12.5px] text-fg-3">
                    {listName(e.list)}
                    <Tooltip content="Match score (100 = identical name)">
                      <span className="w-7 text-right tabular">{Math.round(e.score)}</span>
                    </Tooltip>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
