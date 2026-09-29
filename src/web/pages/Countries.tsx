// Country reference: every destination's EAR Country Groups, Country Chart row and Japanese FEFTA tiers.
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, ArrowUpDown, Check, ExternalLink, Globe2, ScanSearch, Search, ShieldAlert } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { CHART_COLUMNS, CHART_REASONS, COUNTRY_GROUP_IDS, type ChartColumn } from "@/shared/regs.ts";
import { Page, useMeta } from "../components/AppShell.tsx";
import { useCountries } from "../components/CountryPicker.tsx";
import { useRegSheet } from "../components/RegSheet.tsx";
import { Badge, Button, Card, CardHeader, Empty, Input, PageHeader, Segmented, SectionLabel, Skeleton } from "../components/ui/index.tsx";
import { api, type CountryChart, type CountryGroups, type CountryInfo, type SourceStamp } from "../lib/api.ts";
import { cx, fmtDate, type Tone } from "../lib/format.ts";

// ---------------------------------------------------------------------------
// Shared helpers

const ORDER_SECTION = "jp:324CO0000000378";

function squareTone(col: string): string {
  const r = col.replace(/\d$/, "");
  if (r === "AT") return "bg-fg-3";
  if (r === "RS" || r === "CC" || r === "FC") return "bg-amber";
  return "bg-orange";
}

/** "1,3,4,5" → "1, 3–5" (runs of three or more collapse). */
function runs(nums: number[]): string {
  const out: string[] = [];
  for (let i = 0; i < nums.length; ) {
    let j = i;
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
    if (j - i >= 2) out.push(`${nums[i]}–${nums[j]}`);
    else for (let k = i; k <= j; k++) out.push(String(nums[k]));
    i = j + 1;
  }
  return out.join(",");
}

function GroupChips({ groups }: { groups: string[] }) {
  if (!groups.length) return <span className="text-fg-3">—</span>;
  const fams: { fam: string; text: string; cls: string }[] = [];
  for (const f of ["A", "B", "D", "E"]) {
    const mine = groups.filter((g) => g[0] === f);
    if (!mine.length) continue;
    const nums = mine.map((g) => Number(g.split(":")[1] ?? 0)).sort((a, b) => a - b);
    fams.push({
      fam: f,
      text: f === "B" ? "B" : `${f}:${runs(nums)}`,
      cls: f === "E" ? "bg-red-soft text-red-text ring-red/20" : f === "D" ? "bg-orange-soft text-orange-text ring-orange/20" : "bg-panel-2 text-fg-2 ring-line",
    });
  }
  return (
    <span className="inline-flex flex-wrap gap-1" title={groups.join(", ")}>
      {fams.map((x) => (
        <span key={x.fam} className={cx("inline-flex h-5 items-center rounded px-1.5 font-mono text-[11px] font-medium ring-1 ring-inset", x.cls)}>
          {x.text}
        </span>
      ))}
    </span>
  );
}

function jpTiers(c: CountryInfo): { key: string; label: string; ja: string; tone: Tone }[] {
  const t: { key: string; label: string; ja: string; tone: Tone }[] = [];
  if (c.jp.groupA) t.push({ key: "a", label: "Group A", ja: "別表第三", tone: "green" });
  if (c.jp.unArmsEmbargo) t.push({ key: "un", label: "UN arms embargo", ja: "別表第三の二", tone: "orange" });
  if (c.jp.concern) t.push({ key: "concern", label: "Concern", ja: "別表第四", tone: "red" });
  if (c.jp.russiaDiversion) t.push({ key: "ru", label: "Russia diversion", ja: "別表第二の四", tone: "amber" });
  return t;
}

function MiniChart({ x }: { x: string[] }) {
  const set = new Set(x);
  return (
    <span className="inline-flex gap-[2px]" title={x.length ? `X in ${x.join(", ")}` : "No X marks"}>
      {CHART_COLUMNS.map((c) => (
        <span key={c} className={cx("h-2.5 w-[5px] rounded-[1px]", set.has(c) ? squareTone(c) : "bg-panel-3")} />
      ))}
    </span>
  );
}

function SortHeader({ label, active, onClick, align = "left" }: { label: string; active: boolean; onClick: () => void; align?: "left" | "right" }) {
  return (
    <button type="button" onClick={onClick} className={cx("inline-flex items-center gap-1 font-medium hover:text-fg", active && "text-fg", align === "right" && "flex-row-reverse")}>
      {label}
      <ArrowUpDown className={cx("size-3", active ? "opacity-100" : "opacity-40")} />
    </button>
  );
}

// ---------------------------------------------------------------------------
// /regulations/countries

type Filter = "all" | "sanctioned" | "jpA" | "jpOther";
const isSanctioned = (c: CountryInfo) => c.groups.includes("E:1") || c.groups.includes("E:2") || c.groups.includes("D:5");

export function CountriesPage() {
  const countries = useCountries();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const filter = (params.get("f") as Filter) ?? "all";
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"name" | "marks">("name");

  const list = countries.data ?? [];
  const counts = useMemo(
    () => ({
      all: list.length,
      sanctioned: list.filter(isSanctioned).length,
      jpA: list.filter((c) => c.jp.groupA).length,
      jpOther: list.filter((c) => !c.jp.groupA && c.iso2 !== "JP").length,
    }),
    [list],
  );
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const out = list.filter((c) => {
      if (filter === "sanctioned" && !isSanctioned(c)) return false;
      if (filter === "jpA" && !c.jp.groupA) return false;
      if (filter === "jpOther" && (c.jp.groupA || c.iso2 === "JP")) return false;
      if (!s) return true;
      return c.en.toLowerCase().includes(s) || c.iso2.toLowerCase() === s || c.ja.includes(q.trim()) || (c.earName ?? "").toLowerCase().includes(s);
    });
    return out.sort((a, b) => (sort === "marks" ? b.chart.length - a.chart.length || a.en.localeCompare(b.en) : a.en.localeCompare(b.en)));
  }, [list, filter, q, sort]);

  const count = (n: number) => <span className="ml-1 tabular text-fg-3">{n}</span>;

  return (
    <Page wide>
      <PageHeader
        title="Countries"
        description="Every destination with its EAR Country Groups (Supp. No. 1 to Part 740), Country Chart marks and its tier under Japan’s Export Trade Control Order (輸出貿易管理令)."
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented<Filter>
          value={filter}
          onChange={(v) => setParams(v === "all" ? {} : { f: v }, { replace: true })}
          options={[
            { value: "all", label: <>All{count(counts.all)}</> },
            { value: "sanctioned", label: <>Sanctioned (E:1, E:2, D:5){count(counts.sanctioned)}</> },
            { value: "jpA", label: <>Japan Group A{count(counts.jpA)}</> },
            { value: "jpOther", label: <>Japan non-Group A{count(counts.jpOther)}</> },
          ]}
        />
        <div className="relative ml-auto w-72">
          <Search className="pointer-events-none absolute left-2.5 top-2 size-4 text-fg-3" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setQ("")} placeholder="Filter by name, 国名 or ISO code" className="pl-8" aria-label="Filter countries" />
        </div>
      </div>

      <Card className="overflow-hidden">
        {countries.isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-9" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <Empty icon={<Globe2 className="size-5" />} title={list.length ? "No countries match" : "No country data"}>
            {list.length ? "Try another name, a Japanese name or a two-letter ISO code." : "Sync the regulatory data from Settings → Data."}
          </Empty>
        ) : (
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[980px] text-[13px]">
              <thead>
                <tr className="border-b border-line bg-panel-2/60 text-left text-[11.5px] font-medium text-fg-3">
                  <th className="px-4 py-2 font-medium">
                    <SortHeader label="Country" active={sort === "name"} onClick={() => setSort("name")} />
                  </th>
                  <th className="px-4 py-2 font-medium">EAR Country Groups</th>
                  <th className="px-4 py-2 font-medium">Japan tier</th>
                  <th className="px-4 py-2 font-medium" title="UN Security Council arms embargo per 15 CFR 746.1(b)(2)">
                    UN arms embargo (US)
                  </th>
                  <th className="px-4 py-2 text-right font-medium">
                    <SortHeader label="Country Chart X" active={sort === "marks"} onClick={() => setSort("marks")} align="right" />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((c) => {
                  const tiers = jpTiers(c);
                  return (
                    <tr key={c.iso2} className="cursor-pointer transition-colors hover:bg-panel-2/50" onClick={() => nav(`/regulations/countries/${c.iso2}`)}>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2.5">
                          <span className="w-7 shrink-0 rounded bg-panel-2 text-center font-mono text-[10.5px] text-fg-2 ring-1 ring-line">{c.iso2}</span>
                          <div className="min-w-0">
                            <Link to={`/regulations/countries/${c.iso2}`} onClick={(e) => e.stopPropagation()} className="font-medium hover:underline">
                              {c.en}
                            </Link>
                            <div className="text-[11.5px] text-fg-3">{c.ja}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <GroupChips groups={c.groups} />
                      </td>
                      <td className="px-4 py-2">
                        {c.iso2 === "JP" ? (
                          <span className="text-[12px] text-fg-3">Exporting country</span>
                        ) : tiers.length ? (
                          <span className="flex flex-wrap gap-1">
                            {tiers.map((t) => (
                              <Badge key={t.key} tone={t.tone}>
                                {t.label} <span className="font-normal opacity-75">{t.ja}</span>
                              </Badge>
                            ))}
                          </span>
                        ) : (
                          <span className="text-[12px] text-fg-3">Non-Group A</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {c.unArmsEmbargoUS ? (
                          <span className="inline-flex items-center gap-1.5 text-[12.5px] text-orange-text">
                            <span className="size-1.5 rounded-full bg-orange" />
                            §746.1(b)
                          </span>
                        ) : (
                          <span className="text-fg-3">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-end gap-3">
                          <MiniChart x={c.chart} />
                          <span className={cx("w-5 text-right tabular", c.chart.length ? "text-fg" : "text-fg-3")}>{c.chart.length}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="mt-3 text-[11.5px] text-fg-3">
        Chart marks: <span className="text-orange-text">orange</span> NS, MT, NP, CB · <span className="text-amber-text">amber</span> RS, FC, CC · gray AT. Countries without a Country Chart row
        (e.g. Hong Kong, treated as China) show no marks.
      </p>
    </Page>
  );
}

// ---------------------------------------------------------------------------
// /regulations/countries/:iso

const GROUP_FALLBACK: Record<string, string> = {
  "A:1": "Wassenaar Arrangement participating states",
  "A:2": "Missile Technology Control Regime",
  "A:3": "Australia Group",
  "A:4": "Nuclear Suppliers Group",
  "A:5": "STA — broadest eligibility",
  "A:6": "STA — limited eligibility",
  B: "License exceptions such as GBS",
  "D:1": "National security",
  "D:2": "Nuclear",
  "D:3": "Chemical & biological",
  "D:4": "Missile technology",
  "D:5": "U.S. arms embargoed countries",
  "E:1": "Terrorist supporting countries",
  "E:2": "Unilateral embargo",
};

const EMBARGO: Record<string, { sec: string; title: string; text: string }> = {
  CU: {
    sec: "746.2",
    title: "Cuba — comprehensive embargo",
    text: "A license is required for all items subject to the EAR, including EAR99, other than under the license exceptions listed in §746.2(a)(1). Most applications face a policy of denial.",
  },
  IR: {
    sec: "746.7",
    title: "Iran — embargo",
    text: "A license is required for CCL items with any Country Chart reason and for items in Supp. No. 7 to Part 746. OFAC’s Iranian Transactions and Sanctions Regulations (31 CFR 560) separately prohibit most transactions.",
  },
  KP: {
    sec: "746.4",
    title: "North Korea — embargo",
    text: "A license is required for all items subject to the EAR except EAR99 food and medicine. Arms, NP and MT items face a policy of denial.",
  },
  SY: {
    sec: "746.9",
    title: "Syria — embargo",
    text: "A license is required for all items subject to the EAR except EAR99 food and medicine; only the license exceptions listed in §746.9(b) are available.",
  },
  RU: {
    sec: "746.8",
    title: "Russia — sanctions",
    text: "A license is required for every item in any ECCN on the CCL (§746.8(a)(1)) and for the HTS-listed goods in Supps. No. 4, 5 and 6 to Part 746. The Russia/Belarus foreign direct product rules also apply.",
  },
  BY: {
    sec: "746.8",
    title: "Belarus — sanctions",
    text: "A license is required for every item in any ECCN on the CCL (§746.8(a)(1)) and for the HTS-listed goods in Supps. No. 4, 5 and 6 to Part 746. The Russia/Belarus foreign direct product rules also apply.",
  },
  IQ: {
    sec: "746.3",
    title: "Iraq — additional controls",
    text: "A license is required for CCL items controlled for NS, MT, NP, CW, CB, RS, CC, EI, SI, SL or UN reasons, and for any item intended for a military end use or end user (§746.3(a)).",
  },
  UA: {
    sec: "746.6",
    title: "Crimea, DNR and LNR regions",
    text: "A license is required for all items subject to the EAR destined to these regions, except EAR99 food and medicine and certain personal-communications software. The rest of Ukraine follows its Country Chart row.",
  },
};

/** Japan's destination-specific export approval regimes (輸出令 第2条第1項). */
const JP_SANCTIONS: Record<string, { title: string; text: string }> = {
  RU: {
    title: "Russia — export approval regime",
    text: "Export approval (輸出承認) is required for goods in 別表第二の三 (輸出令 第2条第1項第1号の4) and for any goods in transactions with persons designated by METI notice (第1号の7).",
  },
  BY: {
    title: "Belarus — export approval regime",
    text: "Export approval (輸出承認) is required for goods in 別表第二の三, with listed exclusions (輸出令 第2条第1項第1号の3), and for any goods in transactions with persons designated by METI notice (第1号の6).",
  },
  KP: {
    title: "North Korea — comprehensive export ban",
    text: "Export approval (輸出承認) is required for goods in 別表第二の二 destined to North Korea (輸出令 第2条第1項第1号の2).",
  },
  UA: {
    title: "Donetsk and Luhansk areas",
    text: "Export approval (輸出承認) is required for goods to the areas of Donetsk and Luhansk designated by METI notice (輸出令 第2条第1項第1号の5).",
  },
};

function StampNote({ stamp }: { stamp?: SourceStamp }) {
  if (!stamp) return null;
  return (
    <a href={stamp.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11.5px] text-fg-3 hover:text-fg">
      as of {fmtDate(stamp.asOf)}
      <ExternalLink className="size-3" />
    </a>
  );
}

function CiteButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="whitespace-nowrap text-[12px] text-accent-text decoration-accent/40 underline-offset-2 hover:underline">
      {children}
    </button>
  );
}

/** Turn "§ 746.8" / "supplement no. 2 to part 746" in chart footnotes into links to the regulation sheet. */
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

function ChartRow({ x }: { x: string[] }) {
  const set = new Set(x);
  const groups: { reason: string; cols: ChartColumn[] }[] = [];
  for (const c of CHART_COLUMNS) {
    const r = c.replace(/\d$/, "");
    const last = groups.at(-1);
    if (last && last.reason === r) last.cols.push(c);
    else groups.push({ reason: r, cols: [c] });
  }
  return (
    <div className="scroll-thin overflow-x-auto">
      <table className="w-full min-w-[520px] border-separate border-spacing-0 overflow-hidden rounded-lg border border-line text-center text-[11.5px]">
        <thead>
          <tr className="bg-panel-2">
            {groups.map((g, i) => (
              <th key={g.reason} colSpan={g.cols.length} title={CHART_REASONS[g.reason]} className={cx("h-7 border-b border-line font-semibold text-fg-2", i > 0 && "border-l")}>
                {g.reason}
              </th>
            ))}
          </tr>
          <tr className="bg-panel-2/50">
            {groups.flatMap((g, gi) =>
              g.cols.map((c, ci) => (
                <th key={c} className={cx("h-6 border-b border-line font-mono font-normal text-fg-3", gi > 0 && ci === 0 && "border-l")}>
                  {c.slice(-1)}
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          <tr>
            {groups.flatMap((g, gi) =>
              g.cols.map((c, ci) => (
                <td key={c} className={cx("h-9", gi > 0 && ci === 0 && "border-l border-line")} title={set.has(c) ? `${c}: X — license required for items controlled under this column` : `${c}: no X`}>
                  {set.has(c) ? <span className={cx("inline-block size-2.5 rounded-[2px] align-middle", squareTone(c))} /> : <span className="text-fg-3/60">·</span>}
                </td>
              )),
            )}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function FeftaRow({ on, title, ja, cite, children }: { on: boolean; title: string; ja: string; cite: { id: string; label: string }; children?: ReactNode }) {
  const open = useRegSheet();
  return (
    <div className="flex gap-3 px-4 py-3">
      <span className={cx("mt-1 size-2 shrink-0 rounded-full", on ? "bg-fg" : "bg-transparent ring-[1.5px] ring-inset ring-line-strong")} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <div className="text-[13px]">
            <span className={cx("font-medium", !on && "text-fg-2")}>{title}</span> <span className="text-fg-3">{ja}</span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className={cx("text-[12px]", on ? "font-medium text-fg" : "text-fg-3")}>{on ? "Listed" : "Not listed"}</span>
            <CiteButton onClick={() => open({ kind: "section", id: cite.id, label: cite.label })}>{cite.label}</CiteButton>
          </div>
        </div>
        {children && <div className="mt-1 text-[12.5px] leading-relaxed text-fg-2">{children}</div>}
      </div>
    </div>
  );
}

export function CountryPage() {
  const { iso: rawIso = "" } = useParams();
  const iso = rawIso.toUpperCase();
  const open = useRegSheet();
  const meta = useMeta();
  const countries = useCountries();
  const groups = useQuery({ queryKey: ["groups"], queryFn: () => api.get<CountryGroups>("/groups"), staleTime: Infinity });
  const chart = useQuery({ queryKey: ["chart"], queryFn: () => api.get<CountryChart>("/chart"), staleTime: Infinity });

  const c = countries.data?.find((x) => x.iso2 === iso);
  const row = chart.data?.rows.find((r) => r.iso2 === iso);
  const jpStamp = meta.data?.stamps.jp;

  if (countries.isLoading)
    return (
      <Page wide>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-3 h-7 w-64" />
        <Skeleton className="mt-2 h-4 w-80" />
        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <Skeleton className="h-96" />
          <Skeleton className="h-72" />
        </div>
      </Page>
    );

  if (!c)
    return (
      <Page>
        <Card>
          <Empty
            icon={<Globe2 className="size-5" />}
            title={`No country with code “${iso}”`}
            action={
              <Link to="/regulations/countries">
                <Button>All countries</Button>
              </Link>
            }
          >
            Countries are listed when they appear on the Commerce Country Chart, in the EAR Country Groups, or in Japan’s country lists.
          </Empty>
        </Card>
      </Page>
    );

  const labels = (groups.data?.labels ?? {}) as Record<string, string>;
  const labelFor = (g: string) => {
    const l = labels[g];
    return l && l !== g && !/^Country Group/i.test(l) ? l : GROUP_FALLBACK[g] ?? g;
  };
  const embargo = EMBARGO[iso];
  const jpSanction = JP_SANCTIONS[iso];
  const home = iso === "JP";
  const tiers = jpTiers(c);
  const catchAll = c.jp.groupA
    ? "METI notification (インフォーム) only — a license is needed for 16の項 goods only when METI informs the exporter."
    : c.jp.unArmsEmbargo
      ? "WMD and conventional-weapons use / end-user checks plus METI notification, for all 16の項 goods."
      : "WMD use / end-user checks and METI notification for all 16の項 goods; conventional-weapons use / end-user checks for 16の項（1）HS-designated goods only.";

  return (
    <Page wide>
      <Link to="/regulations/countries" className="inline-flex items-center gap-1 text-[12.5px] text-fg-3 hover:text-fg">
        <ArrowLeft className="size-3.5" /> Countries
      </Link>
      <div className="mb-6 mt-2 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[22px] font-semibold tracking-tight">{c.en}</h1>
            <span className="rounded bg-panel-2 px-1.5 py-0.5 font-mono text-[12px] text-fg-2 ring-1 ring-line">{c.iso2}</span>
            {tiers.map((t) => (
              <Badge key={t.key} tone={t.tone}>
                {t.label} <span className="font-normal opacity-75">{t.ja}</span>
              </Badge>
            ))}
            {c.groups.some((g) => g.startsWith("E")) && <Badge tone="red">Country Group {c.groups.filter((g) => g.startsWith("E")).join(", ")}</Badge>}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 text-[13.5px] text-fg-2">
            <span>{c.ja}</span>
            {c.jaLawName && c.jaLawName !== c.ja && <span className="text-fg-3">法令上の表記: {c.jaLawName}</span>}
            <span className="text-fg-3">
              EAR name: <span className="text-fg-2">{c.earName ?? row?.earName ?? "—"}</span>
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        {/* US EAR */}
        <Card className="self-start">
          <CardHeader title="US EAR" subtitle="Country Groups, Country Chart and Part 746 controls" actions={<StampNote stamp={groups.data?.stamp ?? meta.data?.stamps.groups} />} />
          <div className="space-y-6 px-4 py-4">
            {embargo && (
              <div className="flex gap-3 rounded-lg border border-red/25 bg-red-soft px-3.5 py-3">
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-red-text" />
                <div className="min-w-0 text-[12.5px] leading-relaxed">
                  <div className="font-medium text-red-text">{embargo.title}</div>
                  <div className="mt-0.5 text-fg-2">{embargo.text}</div>
                  <div className="mt-1.5">
                    <CiteButton onClick={() => open({ kind: "section", id: embargo.sec, label: `15 CFR ${embargo.sec}` })}>Read §{embargo.sec}</CiteButton>
                  </div>
                </div>
              </div>
            )}

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <SectionLabel>Country Groups</SectionLabel>
                <CiteButton onClick={() => open({ kind: "section", id: "740 Supp. 1", label: "15 CFR 740 Supp. No. 1" })}>Supp. No. 1 to Part 740</CiteButton>
              </div>
              {groups.isLoading ? (
                <Skeleton className="h-40" />
              ) : (
                <div className="overflow-hidden rounded-lg border border-line">
                <div className="-mb-px grid sm:grid-cols-2">
                  {COUNTRY_GROUP_IDS.map((g) => {
                    const on = c.groups.includes(g);
                    const tone = g.startsWith("E") ? "text-red-text" : g.startsWith("D") ? "text-orange-text" : "text-fg";
                    return (
                      <div key={g} className={cx("flex items-center gap-2.5 border-b border-line px-3 py-1.5 text-[12.5px] sm:odd:border-r", on ? "bg-panel" : "bg-panel-2/40")}>
                        <span className={cx("w-8 shrink-0 font-mono text-[11.5px] font-medium", on ? tone : "text-fg-3")}>{g}</span>
                        <span className={cx("min-w-0 flex-1 truncate", on ? "text-fg" : "text-fg-3")} title={labelFor(g)}>
                          {labelFor(g)}
                        </span>
                        {on ? <Check className={cx("size-3.5 shrink-0", tone)} strokeWidth={2.5} aria-label="Member" /> : <span className="w-3.5 shrink-0 text-center text-[11.5px] text-fg-3/60">—</span>}
                      </div>
                    );
                  })}
                </div>
                </div>
              )}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <SectionLabel>Commerce Country Chart</SectionLabel>
                <Link to="/regulations/chart" className="text-[12px] text-accent-text hover:underline">
                  Full chart
                </Link>
              </div>
              {chart.isLoading ? (
                <Skeleton className="h-20" />
              ) : row ? (
                <>
                  <ChartRow x={row.x} />
                  <div className="mt-1.5 text-[11.5px] text-fg-3">
                    {row.x.length ? `X in ${row.x.length} of ${CHART_COLUMNS.length} columns.` : "No X marks."} An X means items controlled under that reason and column need a license to this destination.
                  </div>
                  {row.footnotes.length > 0 && (
                    <ol className="mt-3 space-y-1.5">
                      {row.footnotes.map((n) => (
                        <li key={n} className="flex gap-2 text-[12.5px] leading-relaxed text-fg-2">
                          <span className="w-4 shrink-0 text-right font-mono text-[11px] font-semibold text-fg-3">{n}</span>
                          <span className="min-w-0">
                            <SectionRefs text={chart.data?.footnotes[String(n)] ?? ""} />
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </>
              ) : (
                <div className="rounded-lg border border-dashed border-line-strong px-3 py-3 text-[12.5px] text-fg-3">
                  {iso === "HK"
                    ? "Hong Kong has no row of its own: since December 2020 the EAR treat Hong Kong as China for licensing purposes."
                    : `${c.en} has no row on the Commerce Country Chart.`}
                </div>
              )}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <SectionLabel>UN arms embargo</SectionLabel>
                <CiteButton onClick={() => open({ kind: "section", id: "746.1", highlight: "(b)", label: "15 CFR 746.1(b)" })}>§746.1(b)</CiteButton>
              </div>
              <div className="flex items-start gap-2 text-[12.5px] leading-relaxed">
                <span className={cx("mt-1.5 size-1.5 shrink-0 rounded-full", c.unArmsEmbargoUS ? "bg-orange" : "bg-line-strong")} />
                <span className="text-fg-2">
                  {c.unArmsEmbargoUS ? (
                    <>
                      <span className="font-medium text-fg">Listed in §746.1(b)(2).</span> A license is required for items with a “UN” reason for control; applications contrary to the
                      Security Council resolution are denied.
                    </>
                  ) : (
                    "Not listed in §746.1(b)(2) — UN reasons for control do not apply."
                  )}
                </span>
              </div>
            </div>
          </div>
        </Card>

        <div className="space-y-6 self-start">
          {/* Japan FEFTA */}
          <Card>
            <CardHeader title="Japan FEFTA" subtitle="輸出貿易管理令 — country lists and what they change" actions={<StampNote stamp={jpStamp} />} />
            {home ? (
              <div className="px-4 py-4 text-[12.5px] text-fg-2">Japan is the exporting country; the destination tiers of the Export Trade Control Order do not apply.</div>
            ) : (
              <>
                {jpSanction && (
                  <div className="border-b border-line px-4 py-3">
                    <div className="flex gap-3 rounded-lg border border-amber/30 bg-amber-soft px-3.5 py-3">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-text" />
                      <div className="min-w-0 text-[12.5px] leading-relaxed">
                        <div className="font-medium text-amber-text">{jpSanction.title}</div>
                        <div className="mt-0.5 text-fg-2">{jpSanction.text}</div>
                        <div className="mt-1.5">
                          <CiteButton onClick={() => open({ kind: "section", id: `${ORDER_SECTION}:2`, label: "輸出令 第2条" })}>Read 輸出令 第2条</CiteButton>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                <div className="divide-y divide-line">
                  <FeftaRow on={c.jp.groupA} title="Group A" ja="別表第三" cite={{ id: `${ORDER_SECTION}:別表第三`, label: "輸出令 別表第三" }}>
                    {c.jp.groupA ? (
                      <>
                        Catch-all (16の項) applies only when METI informs the exporter — 輸出令 第1条第3項, 第4条第2項第3号.
                      </>
                    ) : (
                      <>Catch-all (16の項) applies with objective use / end-user requirements — see below.</>
                    )}
                  </FeftaRow>
                  <FeftaRow on={c.jp.unArmsEmbargo} title="UN arms embargo" ja="別表第三の二" cite={{ id: `${ORDER_SECTION}:別表第三の二`, label: "輸出令 別表第三の二" }}>
                    {c.jp.unArmsEmbargo ? <>Conventional-weapons use / end-user checks extend to all 16の項 goods, not only 16の項（1） — 輸出令 第4条第1項第4号.</> : null}
                  </FeftaRow>
                  <FeftaRow on={c.jp.concern} title="Concern country" ja="別表第四" cite={{ id: `${ORDER_SECTION}:別表第四`, label: "輸出令 別表第四" }}>
                    {c.jp.concern ? <>The small-value exception (少額特例) is not available — 輸出令 第4条第1項第5号.</> : null}
                  </FeftaRow>
                  <FeftaRow on={c.jp.russiaDiversion} title="Russia-diversion destination" ja="別表第二の四" cite={{ id: `${ORDER_SECTION}:別表第二の四`, label: "輸出令 別表第二の四" }}>
                    {c.jp.russiaDiversion ? (
                      <>Export approval (輸出承認) is required for 別表第二の三 goods in transactions with persons designated by METI notice — 輸出令 第2条第1項第1号の8.</>
                    ) : null}
                  </FeftaRow>
                </div>
                <div className="space-y-2.5 border-t border-line bg-panel-2/40 px-4 py-3 text-[12.5px] leading-relaxed">
                  <div>
                    <div className="font-medium text-fg">Catch-all (16の項) for this destination</div>
                    <div className="text-fg-2">{catchAll}</div>
                  </div>
                  <div>
                    <div className="font-medium text-fg">Small-value exception (少額特例)</div>
                    <div className="text-fg-2">
                      {c.jp.concern
                        ? "Not available."
                        : "Available for 5–13 and 15の項 goods up to ¥1,000,000 (¥50,000 for 別表第三の三 goods), provided no catch-all condition applies."}{" "}
                      <CiteButton onClick={() => open({ kind: "section", id: `${ORDER_SECTION}:4`, label: "輸出令 第4条" })}>輸出令 第4条第1項第5号</CiteButton>
                    </div>
                  </div>
                  <div className="text-[11.5px] text-fg-3">
                    List control (1–15の項) requires a license to every destination regardless of tier.{" "}
                    <Link to="/regulations/japan" className="text-accent-text hover:underline">
                      Japan (FEFTA) reference
                    </Link>
                  </div>
                </div>
              </>
            )}
          </Card>

          {/* Screening */}
          <Card>
            <CardHeader title="Screening lists" icon={<ScanSearch className="size-4" />} />
            <div className="px-4 py-3.5 text-[12.5px] leading-relaxed text-fg-2">
              Check consignees and end users located in {c.en} against the US Consolidated Screening List (Entity List, MEU, SDN and others) and METI’s End User List (外国ユーザーリスト).
              <div className="mt-3">
                <Link to={`/screening?country=${iso}`}>
                  <Button size="sm" icon={<Search className="size-3.5" />}>
                    Screen with {c.iso2} pre-selected
                  </Button>
                </Link>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </Page>
  );
}
