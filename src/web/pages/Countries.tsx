// Country reference: find a destination, then see what applies to it — US EAR Country Groups, Country Chart
// and Part 746 controls, and the Japanese FEFTA destination lists.
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronRight, ExternalLink, Globe2, ScanSearch, Search, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { Status } from "@/shared/assessment.ts";
import { CHART_COLUMNS, CHART_REASONS, COUNTRY_GROUP_IDS, type ChartColumn } from "@/shared/regs.ts";
import { Page, useMeta } from "../components/AppShell.tsx";
import { useCountries } from "../components/CountryPicker.tsx";
import { useRegSheet } from "../components/RegSheet.tsx";
import { Button, Card, Empty, PageHeader, Section, Segmented, Skeleton, StatusDot, Tooltip } from "../components/ui/index.tsx";
import { api, type CountryChart, type CountryGroups, type CountryInfo, type SourceStamp } from "../lib/api.ts";
import { cx, fmtDate } from "../lib/format.ts";

// ---------------------------------------------------------------------------
// Shared helpers

const ORDER_SECTION = "jp:324CO0000000378";

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

function groupSummary(groups: string[]): string {
  const fams: string[] = [];
  for (const f of ["A", "B", "D", "E"]) {
    const mine = groups.filter((g) => g[0] === f);
    if (!mine.length) continue;
    const nums = mine.map((g) => Number(g.split(":")[1] ?? 0)).sort((a, b) => a - b);
    fams.push(f === "B" ? "B" : `${f}:${runs(nums)}`);
  }
  return fams.join(" · ");
}

function jpTiers(c: CountryInfo): { key: string; label: string; ja: string }[] {
  const t: { key: string; label: string; ja: string }[] = [];
  if (c.jp.groupA) t.push({ key: "a", label: "Group A", ja: "別表第三" });
  if (c.jp.unArmsEmbargo) t.push({ key: "un", label: "UN arms embargo", ja: "別表第三の二" });
  if (c.jp.concern) t.push({ key: "concern", label: "Concern country", ja: "別表第四" });
  if (c.jp.russiaDiversion) t.push({ key: "ru", label: "Russia diversion", ja: "別表第二の四" });
  return t;
}

/** Reason families with at least one X, in chart order. */
function markedReasons(x: string[]): string[] {
  return [...new Set(CHART_COLUMNS.filter((c) => x.includes(c)).map((c) => c.replace(/\d$/, "")))];
}

const listJoin = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

function CiteButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="whitespace-nowrap text-[13px] text-accent-text hover:underline">
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// /regulations/countries

type Filter = "all" | "sanctioned" | "jpA" | "jpOther";
const isSanctioned = (c: CountryInfo) => c.groups.includes("E:1") || c.groups.includes("E:2") || c.groups.includes("D:5");

const LIST_COLS = "grid grid-cols-[minmax(0,1fr)_28px] items-center gap-x-4 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1.1fr)_84px_64px_16px]";

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

  const count = (n: number) => <span className="ml-1.5 font-normal tabular text-fg-3">{n}</span>;

  return (
    <Page>
      <PageHeader title="Countries" description="Pick a destination to see which US and Japanese controls apply to it." />

      <div className="flex items-center gap-2.5 rounded-2xl bg-fill-2 px-4 transition-shadow focus-within:ring-4 focus-within:ring-accent/15">
        <Search className="size-5 shrink-0 text-fg-3" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setQ("");
            if (e.key === "Enter" && rows[0]) nav(`/regulations/countries/${rows[0].iso2}`);
          }}
          placeholder="Country, 国名 or two-letter code"
          aria-label="Find a country"
          className="h-12 min-w-0 flex-1 bg-transparent text-[17px] tracking-tight outline-none placeholder:text-fg-3"
        />
        {q && (
          <button type="button" onClick={() => setQ("")} className="rounded-full p-1 text-fg-3 hover:bg-fill hover:text-fg" aria-label="Clear">
            <X className="size-4" />
          </button>
        )}
      </div>

      <div className="mb-4 mt-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented<Filter>
          value={filter}
          onChange={(v) => setParams(v === "all" ? {} : { f: v }, { replace: true })}
          options={[
            { value: "all", label: <>All{count(counts.all)}</> },
            { value: "sanctioned", label: <>Embargoed or sanctioned{count(counts.sanctioned)}</> },
            { value: "jpA", label: <>Japan Group A{count(counts.jpA)}</> },
            { value: "jpOther", label: <>Other destinations{count(counts.jpOther)}</> },
          ]}
        />
        <Segmented<"name" | "marks">
          value={sort}
          onChange={setSort}
          options={[
            { value: "name", label: "A–Z" },
            { value: "marks", label: "Most chart marks" },
          ]}
        />
      </div>

      <Card className="overflow-hidden">
        {countries.isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-9" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <Empty icon={<Globe2 />} title={list.length ? "No countries match" : "No country data"}>
            {list.length ? "Try another name, a Japanese name or a two-letter code." : "Sync the regulatory data in Settings."}
          </Empty>
        ) : (
          <>
            <div className={cx(LIST_COLS, "hidden border-b border-line px-4 py-2 text-[12.5px] font-medium text-fg-3 md:grid")}>
              <span className="pl-10">Country</span>
              <Tooltip content="EAR Country Groups, Supplement No. 1 to Part 740">
                <span className="cursor-default">EAR Country Groups</span>
              </Tooltip>
              <Tooltip content="Destination lists of Japan’s Export Trade Control Order (輸出貿易管理令)">
                <span className="cursor-default">Japan</span>
              </Tooltip>
              <Tooltip content="UN arms embargo under 15 CFR 746.1(b)(2)">
                <span className="cursor-default">UN embargo</span>
              </Tooltip>
              <Tooltip content="Country Chart columns marked with an X, of 16">
                <span className="cursor-default text-right">Chart X</span>
              </Tooltip>
              <span />
            </div>
            <div className="k-list [--inset:56px]">
              {rows.map((c) => {
                const tiers = jpTiers(c);
                return (
                  <Link key={c.iso2} to={`/regulations/countries/${c.iso2}`} className={cx(LIST_COLS, "px-4 py-2.5 transition-colors hover:bg-fill-2")}>
                    <div className="flex min-w-0 items-center gap-4">
                      <span className="w-6 shrink-0 text-[12px] font-medium tabular text-fg-3">{c.iso2}</span>
                      <div className="min-w-0">
                        <div className="truncate text-[14px] font-medium">{c.en}</div>
                        <div className="truncate text-[12.5px] text-fg-3">{c.ja}</div>
                      </div>
                    </div>
                    <span className="hidden truncate text-[13px] tabular text-fg-2 md:block" title={c.groups.join(", ")}>
                      {c.groups.length ? groupSummary(c.groups) : "—"}
                    </span>
                    <span className="hidden truncate text-[13px] md:block">
                      {c.iso2 === "JP" ? <span className="text-fg-3">Exporting country</span> : tiers.length ? tiers.map((t) => t.label).join(", ") : <span className="text-fg-3">Not Group A</span>}
                    </span>
                    <span className="hidden text-[13px] md:block">{c.unArmsEmbargoUS ? "Yes" : <span className="text-fg-3">—</span>}</span>
                    <span className="hidden text-right text-[13px] tabular md:block" title={c.chart.length ? `X in ${c.chart.join(", ")}` : "No X marks"}>
                      {c.chart.length || <span className="text-fg-3">0</span>}
                    </span>
                    <ChevronRight className="size-4 justify-self-end text-fg-3" />
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </Card>
      <p className="mt-3 px-1 text-[12.5px] text-fg-3">Countries without a Country Chart row of their own (Hong Kong is treated as China) show no marks.</p>
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

function StampNote({ label, stamp }: { label: string; stamp?: SourceStamp }) {
  if (!stamp) return null;
  return (
    <a href={stamp.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-fg">
      {label} as of {fmtDate(stamp.asOf)}
      <ExternalLink className="size-3" />
    </a>
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

/** The destination's row of the Country Chart, drawn like the chart itself. */
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
      <table className="w-full min-w-[560px] border-separate border-spacing-0 text-center">
        <thead>
          <tr>
            {groups.map((g, i) => (
              <th key={g.reason} colSpan={g.cols.length} title={CHART_REASONS[g.reason]} className={cx("h-8 text-[12.5px] font-semibold", i > 0 && "border-l border-line")}>
                {g.reason}
              </th>
            ))}
          </tr>
          <tr>
            {groups.flatMap((g, gi) =>
              g.cols.map((c, ci) => (
                <th key={c} className={cx("h-6 border-b border-line text-[12px] font-normal tabular text-fg-3", gi > 0 && ci === 0 && "border-l")}>
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
                <td key={c} className={cx("h-10", gi > 0 && ci === 0 && "border-l border-line")} title={set.has(c) ? `${c}: X — license required for items controlled under this column` : `${c}: no X`}>
                  {set.has(c) ? <span className="inline-block size-[8px] rounded-full bg-fg/75 align-middle" /> : null}
                </td>
              )),
            )}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

interface Fact {
  status: Status;
  title: ReactNode;
  text?: ReactNode;
  cite?: { label: string; onClick: () => void };
}

function FactRow({ f }: { f: Fact }) {
  return (
    <div className="flex gap-3 px-4 py-3.5">
      <StatusDot status={f.status} className="size-[17px]" />
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-medium leading-snug">{f.title}</div>
        {f.text && <div className="mt-0.5 text-[13px] leading-relaxed text-fg-2">{f.text}</div>}
      </div>
      {f.cite && (
        <div className="shrink-0 pt-px">
          <CiteButton onClick={f.cite.onClick}>{f.cite.label}</CiteButton>
        </div>
      )}
    </div>
  );
}

export function CountryPage() {
  const { iso: rawIso = "" } = useParams();
  const iso = rawIso.toUpperCase();
  const open = useRegSheet();
  const nav = useNavigate();
  const meta = useMeta();
  const countries = useCountries();
  const groups = useQuery({ queryKey: ["groups"], queryFn: () => api.get<CountryGroups>("/groups"), staleTime: Infinity });
  const chart = useQuery({ queryKey: ["chart"], queryFn: () => api.get<CountryChart>("/chart"), staleTime: Infinity });

  const c = countries.data?.find((x) => x.iso2 === iso);
  const row = chart.data?.rows.find((r) => r.iso2 === iso);
  const jpStamp = meta.data?.stamps.jp;

  if (countries.isLoading)
    return (
      <Page>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-4 h-9 w-64" />
        <Skeleton className="mt-2 h-4 w-80" />
        <Skeleton className="mt-10 h-72 rounded-xl" />
      </Page>
    );

  if (!c)
    return (
      <Page>
        <Card>
          <Empty icon={<Globe2 />} title={`No country with code “${iso}”`} action={<Button onClick={() => nav("/regulations/countries")}>All countries</Button>}>
            Countries are listed when they appear on the Country Chart, in the EAR Country Groups or in Japan’s country lists.
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
  const catchAll = c.jp.groupA
    ? "METI notification (インフォーム) only — a license is needed for 16の項 goods only when METI informs the exporter."
    : c.jp.unArmsEmbargo
      ? "WMD and conventional-weapons use / end-user checks plus METI notification, for all 16の項 goods."
      : "WMD use / end-user checks and METI notification for all 16の項 goods; conventional-weapons use / end-user checks for 16の項（1）HS-designated goods only.";
  const cite = (id: string, label: string, highlight?: string) => () => open({ kind: "section", id, label, highlight });

  // What applies — US first, then Japan. Plain sentences; the detail sections below carry the tables.
  const us: Fact[] = [];
  if (embargo) us.push({ status: "block", title: embargo.title, text: embargo.text, cite: { label: `§${embargo.sec}`, onClick: cite(embargo.sec, `15 CFR ${embargo.sec}`) } });
  if (chart.isLoading) us.push({ status: "incomplete", title: "Reading the Country Chart…" });
  else if (row && row.x.length)
    us.push({
      status: "flag",
      title: `License required for items controlled for ${listJoin(markedReasons(row.x))}`,
      text: `The Country Chart marks ${row.x.length} of ${CHART_COLUMNS.length} columns for this destination. Whether your item is caught depends on the columns its ECCN names.`,
      cite: { label: "§738.4", onClick: cite("738.4", "15 CFR 738.4") },
    });
  else if (row) us.push({ status: "pass", title: "No Country Chart license requirement", text: "No column is marked for this destination." });
  else
    us.push({
      status: "info",
      title: "No row on the Country Chart",
      text: iso === "HK" ? "Since December 2020 the EAR treat Hong Kong as China for licensing purposes." : `${c.en} has no row of its own on the Commerce Country Chart.`,
    });
  if (c.unArmsEmbargoUS)
    us.push({
      status: "flag",
      title: "UN arms embargo",
      text: "A license is required for items with a “UN” reason for control; applications contrary to the Security Council resolution are denied.",
      cite: { label: "§746.1(b)", onClick: cite("746.1", "15 CFR 746.1(b)", "(b)") },
    });

  const jp: Fact[] = [];
  if (home) jp.push({ status: "info", title: "Japan is the exporting country", text: "The destination lists of the Export Trade Control Order do not apply." });
  else {
    if (jpSanction) jp.push({ status: iso === "KP" ? "block" : "flag", title: jpSanction.title, text: jpSanction.text, cite: { label: "輸出令 第2条", onClick: cite(`${ORDER_SECTION}:2`, "輸出令 第2条") } });
    jp.push({
      status: c.jp.groupA ? "pass" : "flag",
      title: c.jp.groupA ? "Catch-all: METI notification only (Group A)" : "Catch-all: use and end-user checks apply",
      text: catchAll,
      cite: { label: "輸出令 第4条", onClick: cite(`${ORDER_SECTION}:4`, "輸出令 第4条") },
    });
    if (c.jp.russiaDiversion)
      jp.push({
        status: "flag",
        title: "Russia-diversion destination (別表第二の四)",
        text: "Export approval (輸出承認) is required for 別表第二の三 goods in transactions with persons designated by METI notice — 輸出令 第2条第1項第1号の8.",
        cite: { label: "別表第二の四", onClick: cite(`${ORDER_SECTION}:別表第二の四`, "輸出令 別表第二の四") },
      });
    jp.push(
      c.jp.concern
        ? { status: "flag", title: "Small-value exception not available", text: "This is a concern country (別表第四) — 輸出令 第4条第1項第5号.", cite: { label: "別表第四", onClick: cite(`${ORDER_SECTION}:別表第四`, "輸出令 別表第四") } }
        : {
            status: "info",
            title: "Small-value exception available",
            text: "For 5–13 and 15の項 goods up to ¥1,000,000 (¥50,000 for 別表第三の三 goods), provided no catch-all condition applies.",
            cite: { label: "第4条第1項第5号", onClick: cite(`${ORDER_SECTION}:4`, "輸出令 第4条") },
          },
    );
  }

  const fefta: { on: boolean; title: string; ja: string; id: string; note?: string }[] = [
    { on: c.jp.groupA, title: "Group A", ja: "別表第三", id: "別表第三", note: "Catch-all applies only when METI informs the exporter — 輸出令 第1条第3項, 第4条第2項第3号." },
    { on: c.jp.unArmsEmbargo, title: "UN arms embargo", ja: "別表第三の二", id: "別表第三の二", note: "Conventional-weapons use / end-user checks extend to all 16の項 goods — 輸出令 第4条第1項第4号." },
    { on: c.jp.concern, title: "Concern country", ja: "別表第四", id: "別表第四", note: "The small-value exception (少額特例) is not available — 輸出令 第4条第1項第5号." },
    { on: c.jp.russiaDiversion, title: "Russia-diversion destination", ja: "別表第二の四", id: "別表第二の四" },
  ];

  return (
    <Page>
      <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1 text-[13px] text-fg-3">
        <Link to="/regulations/countries" className="hover:text-fg">
          Countries
        </Link>
        <ChevronRight className="size-3.5" />
      </nav>
      <PageHeader
        title={c.en}
        description={
          <>
            {c.ja}
            {c.jaLawName && c.jaLawName !== c.ja && <span className="text-fg-3"> · 法令上の表記 {c.jaLawName}</span>}
            <span className="text-fg-3">
              {" "}
              · {c.iso2} · EAR name {c.earName ?? row?.earName ?? "—"}
            </span>
          </>
        }
        actions={
          <Button variant="primary" icon={<ScanSearch className="size-4" />} onClick={() => nav(`/screening?country=${iso}`)}>
            Screen parties in {c.en}
          </Button>
        }
      />

      <div className="space-y-10">
        <Section title="What applies" description="Destination-based controls only. List-controlled goods (Japan 1–15の項) need a license to every destination.">
          <div className="space-y-4">
            <div>
              <div className="mb-1.5 px-1 text-[13px] font-semibold text-fg-2">United States</div>
              <Card className="k-list overflow-hidden [--inset:45px]">
                {us.map((f, i) => (
                  <FactRow key={i} f={f} />
                ))}
              </Card>
            </div>
            <div>
              <div className="mb-1.5 px-1 text-[13px] font-semibold text-fg-2">Japan</div>
              <Card className="k-list overflow-hidden [--inset:45px]">
                {jp.map((f, i) => (
                  <FactRow key={i} f={f} />
                ))}
              </Card>
            </div>
          </div>
        </Section>

        <Section
          title="Country Chart row"
          actions={
            <Link to="/regulations/chart" className="text-[13px] text-accent-text hover:underline">
              Full chart
            </Link>
          }
        >
          <Card className="overflow-hidden">
            {chart.isLoading ? (
              <div className="p-4">
                <Skeleton className="h-20" />
              </div>
            ) : row ? (
              <>
                <div className="px-4 py-3">
                  <ChartRow x={row.x} />
                </div>
                {row.footnotes.length > 0 && (
                  <div className="k-list border-t border-line [--inset:44px]">
                    {row.footnotes.map((n) => (
                      <div key={n} className="flex gap-3 px-4 py-3 text-[13.5px] leading-relaxed">
                        <span className="w-4 shrink-0 text-right text-[12.5px] font-semibold tabular text-fg-3">{n}</span>
                        <span className="min-w-0 text-fg-2">
                          <SectionRefs text={chart.data?.footnotes[String(n)] ?? ""} />
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="px-4 py-4 text-[13.5px] text-fg-2">
                {iso === "HK" ? "Hong Kong has no row of its own: since December 2020 the EAR treat Hong Kong as China for licensing purposes." : `${c.en} has no row on the Commerce Country Chart.`}
              </div>
            )}
          </Card>
          {!c.unArmsEmbargoUS && <p className="mt-2 px-1 text-[12.5px] text-fg-3">Not on the UN arms embargo list in §746.1(b)(2), so UN reasons for control do not apply.</p>}
        </Section>

        <Section title="EAR Country Groups" actions={<CiteButton onClick={cite("740 Supp. 1", "15 CFR 740 Supp. No. 1")}>Supp. No. 1 to Part 740</CiteButton>}>
          <Card className="overflow-hidden">
            {groups.isLoading ? (
              <div className="p-4">
                <Skeleton className="h-40" />
              </div>
            ) : (
              <div className="grid sm:grid-cols-2">
                {COUNTRY_GROUP_IDS.map((g, i) => {
                  const on = c.groups.includes(g);
                  return (
                    <div key={g} className={cx("flex items-center gap-3 px-4 py-2.5 text-[13.5px]", i > 1 && "border-t border-line", i === 1 && "max-sm:border-t max-sm:border-line", i % 2 === 1 && "sm:border-l sm:border-line")}>
                      <span className={cx("w-9 shrink-0 text-[13px] font-medium tabular", on ? "text-fg" : "text-fg-3")}>{g}</span>
                      <span className={cx("min-w-0 flex-1 truncate", on ? "text-fg" : "text-fg-3")} title={labelFor(g)}>
                        {labelFor(g)}
                      </span>
                      {on && <Check className="size-4 shrink-0 text-accent" strokeWidth={2.5} aria-label="Member" />}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </Section>

        {!home && (
          <Section
            title="Japan’s destination lists"
            description="輸出貿易管理令 — which lists this destination is on."
            actions={
              <Link to="/regulations/japan?tab=countries" className="text-[13px] text-accent-text hover:underline">
                Japan reference
              </Link>
            }
          >
            <Card className="k-list overflow-hidden">
              {fefta.map((f) => (
                <div key={f.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px]">
                      <span className={cx(f.on ? "font-medium text-fg" : "text-fg-2")}>{f.title}</span> <span className="text-fg-3">{f.ja}</span>
                    </div>
                    {f.on && f.note && <div className="mt-0.5 text-[13px] leading-relaxed text-fg-2">{f.note}</div>}
                  </div>
                  <span className={cx("w-20 shrink-0 text-right text-[13px]", f.on ? "font-medium text-fg" : "text-fg-3")}>{f.on ? "Listed" : "Not listed"}</span>
                  <span className="w-28 shrink-0 text-right">
                    <CiteButton onClick={cite(`${ORDER_SECTION}:${f.id}`, `輸出令 ${f.id}`)}>輸出令 {f.id}</CiteButton>
                  </span>
                </div>
              ))}
            </Card>
          </Section>
        )}

        <p className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-[12.5px] text-fg-3">
          <StampNote label="EAR Country Groups" stamp={groups.data?.stamp ?? meta.data?.stamps.groups} />
          <StampNote label="Country Chart" stamp={chart.data?.stamp} />
          <StampNote label="輸出令" stamp={jpStamp} />
        </p>
      </div>
    </Page>
  );
}
