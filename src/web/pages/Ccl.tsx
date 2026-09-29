// Commerce Control List (15 CFR 774 Supp. No. 1): category browser with search, and the single-ECCN reference page.
import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ExternalLink, FileSearch, ListTree, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Page, useMeta } from "../components/AppShell.tsx";
import { CountryName } from "../components/CountryPicker.tsx";
import { EccnBody } from "../components/EccnView.tsx";
import { useRegSheet } from "../components/RegSheet.tsx";
import { Badge, Button, Card, CardHeader, Empty, Input, Kbd, PageHeader, SectionLabel, Skeleton, Tooltip } from "../components/ui/index.tsx";
import { api, ApiError, type EccnDetail, type SourceStamp } from "../lib/api.ts";
import { cx, fmtDate, type Tone } from "../lib/format.ts";

// ---------------------------------------------------------------------------
// Data

interface CclEntry {
  id: string;
  heading: string;
  category: string;
  group: string;
  reasons: string[];
  reserved: boolean;
  itar: boolean;
}
interface CclIndex {
  categories: { id: string; title: string }[];
  eccns: CclEntry[];
}
interface CclHit {
  id: string;
  heading: string;
  category: string;
  score: number;
  terms: string[];
}
interface CheckRow {
  index: number;
  reason: string;
  scope: string;
  chart: string;
  applies: "yes" | "no" | "maybe";
  appliesWhy: string;
  licenseRequired: "yes" | "no" | "unknown";
  cells: { reason: string; column: string; x: boolean }[];
  note?: string;
}
interface CheckResult {
  dest: string;
  groups: string[];
  rows: CheckRow[];
}

function useCclIndex() {
  return useQuery({ queryKey: ["ccl-index"], queryFn: () => api.get<CclIndex>("/ccl"), staleTime: Infinity });
}

function useDebounced<T>(value: T, ms = 180): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const CATEGORY_SHORT: Record<string, string> = {
  "0": "Nuclear & miscellaneous",
  "1": "Materials, chemicals & toxins",
  "2": "Materials processing",
  "3": "Electronics",
  "4": "Computers",
  "5": "Telecom & information security",
  "6": "Sensors & lasers",
  "7": "Navigation & avionics",
  "8": "Marine",
  "9": "Aerospace & propulsion",
};

const GROUPS: Record<string, string> = {
  A: "Systems, equipment & components",
  B: "Test, inspection & production equipment",
  C: "Materials",
  D: "Software",
  E: "Technology",
};

const REASONS: Record<string, string> = {
  NS: "National security",
  MT: "Missile technology",
  NP: "Nuclear nonproliferation",
  CB: "Chemical & biological weapons",
  RS: "Regional stability",
  CC: "Crime control",
  AT: "Anti-terrorism",
  FC: "Firearms convention",
  UN: "United Nations embargo",
  EI: "Encryption items",
  SL: "Surreptitious listening",
  SS: "Short supply",
  CW: "Chemical Weapons Convention",
  SI: "Significant items",
};
const MULTILATERAL = new Set(["NS", "MT", "NP", "CB"]);

const cleanHeading = (h: string) => h.replace(/\s*\(see List of Items Controlled\)/gi, "").trim();
const is600 = (id: string) => id[2] === "6";
const is515 = (id: string) => id.slice(2) === "515";
const categoryLabel = (id: string, fallback?: string) => CATEGORY_SHORT[id] ?? fallback?.replace(/[“”"]/g, "") ?? `Category ${id}`;

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
}

// ---------------------------------------------------------------------------
// Small pieces

function StampText({ stamp }: { stamp?: SourceStamp }) {
  if (!stamp) return <span className="mt-1.5 block text-[12.5px] text-fg-3">Loading source…</span>;
  return (
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
  );
}

function ReasonChip({ r, muted }: { r: string; muted?: boolean }) {
  return (
    <span
      title={REASONS[r] ?? r}
      className={cx(
        "inline-flex h-[18px] items-center rounded px-1 font-mono text-[10.5px] font-medium ring-1 ring-inset",
        muted || r === "AT" ? "bg-panel-2 text-fg-3 ring-line" : MULTILATERAL.has(r) ? "bg-orange-soft text-orange-text ring-orange/20" : "bg-accent-soft text-accent-text ring-accent/20",
      )}
    >
      {r}
    </span>
  );
}

function Marker({ children, title }: { children: ReactNode; title: string }) {
  return (
    <span title={title} className="inline-flex h-[18px] items-center rounded bg-red-soft px-1 text-[10.5px] font-medium text-red-text ring-1 ring-inset ring-red/20">
      {children}
    </span>
  );
}

function EccnRow({ e, showCategory }: { e: CclEntry; showCategory?: boolean }) {
  const reasons = e.reasons.filter((r) => r !== "?");
  const atOnly = reasons.length > 0 && reasons.every((r) => r === "AT");
  const muted = atOnly || e.reserved;
  return (
    <Link
      to={`/regulations/ccl/${e.id}`}
      className="group flex items-start gap-4 px-4 py-2.5 transition-colors hover:bg-panel-2/60 focus-visible:bg-panel-2 focus-visible:outline-none"
    >
      <span className={cx("w-[52px] shrink-0 pt-px font-mono text-[12.5px] font-medium", muted ? "text-fg-3" : "text-fg")}>{e.id}</span>
      <div className="min-w-0 flex-1">
        <div className={cx("line-clamp-2 text-[13px] leading-snug", muted ? "text-fg-3" : "text-fg-2 group-hover:text-fg")}>{e.reserved ? "[Reserved]" : cleanHeading(e.heading)}</div>
        {showCategory && <div className="mt-0.5 text-[11.5px] text-fg-3">Category {e.category} · {categoryLabel(e.category)}</div>}
      </div>
      <div className="flex max-w-[45%] shrink-0 flex-wrap justify-end gap-1 pt-px">
        {is600(e.id) && <Marker title="“600 series” — munitions items moved from the USML or on the Wassenaar Munitions List">600</Marker>}
        {is515(e.id) && <Marker title="9x515 — spacecraft and related items moved from USML Category XV">9x515</Marker>}
        {e.itar && <Marker title="Heading refers to items subject to the ITAR">ITAR</Marker>}
        {reasons.map((r) => (
          <ReasonChip key={r} r={r} muted={atOnly} />
        ))}
      </div>
    </Link>
  );
}

function RowsSkeleton({ n = 8 }: { n?: number }) {
  return (
    <div className="divide-y divide-line">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3">
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Explainer: how an ECCN is built (§738.2(d))

const RANGES: [string, string][] = [
  ["000–099", "National security (NS)"],
  ["100–199", "Missile technology (MT)"],
  ["200–299", "Nuclear nonproliferation (NP)"],
  ["300–399", "Chemical & biological (CB)"],
  ["500–599", "Firearms, spacecraft (0x5zz, 9x515)"],
  ["600–699", "“600 series” munitions items"],
  ["900–979", "Plurilateral NS, RS and other"],
  ["980–989", "Crime control, short supply"],
  ["990–999", "Anti-terrorism, RS, UN sanctions"],
];

function Anatomy() {
  const open = useRegSheet();
  return (
    <Card className="mb-6">
      <div className="grid md:grid-cols-[auto_minmax(0,1fr)]">
        <div className="flex items-center justify-center border-b border-line px-6 py-4 md:border-b-0 md:border-r">
          <div className="flex items-start gap-1.5" aria-label="ECCN 3A001: category 3, group A, number 001">
            {[
              { t: "3", l: "Category" },
              { t: "A", l: "Group" },
              { t: "001", l: "Number" },
            ].map((s) => (
              <div key={s.l} className="flex flex-col items-center gap-1.5">
                <span className="rounded-md bg-panel-2 px-2 py-1.5 font-mono text-[20px] font-semibold leading-none ring-1 ring-line">{s.t}</span>
                <span className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-fg-3">{s.l}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="min-w-0 px-5 py-4 text-[12.5px] leading-relaxed text-fg-2">
          <div className="flex items-center justify-between gap-3">
            <SectionLabel>Reading an ECCN</SectionLabel>
            <button type="button" onClick={() => open({ kind: "section", id: "738.2", highlight: "(d)", label: "15 CFR 738.2(d)" })} className="text-[12px] text-accent-text hover:underline">
              §738.2(d)
            </button>
          </div>
          <p className="mt-1.5">
            The first digit is the <span className="text-fg">category</span> (0–9); the letter is the <span className="text-fg">product group</span> — A systems & components, B test & production
            equipment, C materials, D software, E technology. The three-digit number tells you the regime behind the entry:
          </p>
          <div className="mt-2 grid gap-x-6 gap-y-0.5 sm:grid-cols-2 2xl:grid-cols-3">
            {RANGES.map(([r, l]) => (
              <div key={r} className="flex items-baseline gap-2">
                <span className="w-[58px] shrink-0 font-mono text-[11.5px] tabular text-fg">{r}</span>
                <span className="truncate text-fg-2">{l}</span>
              </div>
            ))}
          </div>
          <p className="mt-2.5 text-fg-3">
            <span className="font-medium text-fg-2">EAR99</span> covers items subject to the EAR that are not listed on the CCL. They rarely need a license, except for embargoed destinations, listed
            parties or prohibited end uses (Parts 744 and 746).
          </p>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// /regulations/ccl

export function CclPage() {
  const meta = useMeta();
  const index = useCclIndex();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const cat = params.get("c") ?? "0";
  const [q, setQ] = useState(params.get("q") ?? "");
  const dq = useDebounced(q.trim());
  const searching = dq.length >= 2;
  const inputRef = useRef<HTMLInputElement>(null);

  const search = useQuery({
    queryKey: ["ccl-search", dq],
    queryFn: () => api.get<{ results: CclHit[] }>(`/ccl?q=${encodeURIComponent(dq)}`),
    enabled: searching,
    placeholderData: keepPreviousData,
  });

  // Keep the search in the URL so Back from an ECCN restores it.
  useEffect(() => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (dq) next.set("q", dq);
        else next.delete("q");
        return next;
      },
      { replace: true },
    );
  }, [dq, setParams]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !isTyping(e) && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const byId = useMemo(() => new Map((index.data?.eccns ?? []).map((e) => [e.id, e])), [index.data]);
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of index.data?.eccns ?? []) m[e.category] = (m[e.category] ?? 0) + 1;
    return m;
  }, [index.data]);
  const groups = useMemo(() => {
    const rows = (index.data?.eccns ?? []).filter((e) => e.category === cat);
    return ["A", "B", "C", "D", "E"].map((g) => ({ g, rows: rows.filter((e) => e.group === g) })).filter((x) => x.rows.length);
  }, [index.data, cat]);

  const categories = index.data?.categories ?? [];
  const selectCategory = (id: string) => {
    setQ("");
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("c", id);
        next.delete("q");
        return next;
      },
      { replace: false },
    );
    window.scrollTo({ top: 0 });
  };

  const hits: CclEntry[] = (search.data?.results ?? []).map(
    (h) => byId.get(h.id) ?? { id: h.id, heading: h.heading, category: h.category, group: h.id[1] ?? "", reasons: [], reserved: false, itar: false },
  );
  const current = categories.find((c) => c.id === cat);

  return (
    <Page wide>
      <PageHeader
        title="Commerce Control List"
        description={
          <>
            Supplement No. 1 to Part 774 of the EAR — every ECCN, grouped by category and product group, with its reasons for control.
            <StampText stamp={meta.data?.stamps.ccl} />
          </>
        }
      />
      <Anatomy />

      <div className="grid gap-6 xl:grid-cols-[232px_minmax(0,1fr)]">
        {/* Categories — vertical on wide screens, wrapping pills below */}
        <nav aria-label="CCL categories" className="self-start xl:sticky xl:top-6">
          <SectionLabel className="mb-2 hidden px-2 xl:block">Categories</SectionLabel>
          <div className="flex flex-wrap gap-1.5 xl:flex-col xl:gap-0.5">
            {index.isLoading
              ? Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="h-8 w-40 xl:w-full" />)
              : categories.map((c) => {
                  const active = !searching && c.id === cat;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => selectCategory(c.id)}
                      title={c.title}
                      aria-current={active ? "page" : undefined}
                      className={cx(
                        "flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] transition-colors xl:w-full",
                        active ? "bg-panel font-medium text-fg shadow-sm ring-1 ring-line" : "text-fg-2 ring-1 ring-transparent hover:bg-panel-2 hover:text-fg max-xl:ring-line",
                      )}
                    >
                      <span className={cx("w-3 font-mono text-[12px]", active ? "text-fg" : "text-fg-3")}>{c.id}</span>
                      <span className="truncate">{categoryLabel(c.id, c.title)}</span>
                      <span className="ml-auto pl-2 text-[11.5px] tabular text-fg-3">{counts[c.id] ?? 0}</span>
                    </button>
                  );
                })}
          </div>
        </nav>

        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative min-w-[260px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-2 size-4 text-fg-3" />
              <Input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setQ("");
                  if (e.key === "Enter") {
                    const exact = byId.get(q.trim().toUpperCase().slice(0, 5));
                    const first = exact ?? hits[0];
                    if (first) nav(`/regulations/ccl/${first.id}`);
                  }
                }}
                placeholder="Search ECCNs, headings and item text — e.g. 3A090, lathes, “specially designed” sensors"
                className="pl-8 pr-9"
                aria-label="Search the Commerce Control List"
              />
              {!q && (
                <span className="pointer-events-none absolute right-2 top-1.5">
                  <Kbd>/</Kbd>
                </span>
              )}
            </div>
            <div className="text-[12.5px] tabular text-fg-3">
              {searching
                ? search.isFetching && !search.data
                  ? "Searching…"
                  : `${hits.length} result${hits.length === 1 ? "" : "s"}`
                : current
                  ? `${counts[cat] ?? 0} entries in Category ${cat}`
                  : null}
            </div>
          </div>

          {searching ? (
            <Card className={cx("overflow-hidden transition-opacity", search.isFetching && "opacity-70")}>
              {!search.data ? (
                <RowsSkeleton n={6} />
              ) : hits.length === 0 ? (
                <Empty icon={<Search className="size-5" />} title={`No entries match “${dq}”`}>
                  Search covers ECCN numbers, headings, item paragraphs and notes. Try a broader term or an ECCN prefix such as 3A0.
                </Empty>
              ) : (
                <div className="divide-y divide-line">
                  {hits.map((e) => (
                    <EccnRow key={e.id} e={e} showCategory />
                  ))}
                </div>
              )}
            </Card>
          ) : index.isLoading ? (
            <Card className="overflow-hidden">
              <RowsSkeleton />
            </Card>
          ) : index.isError ? (
            <Card>
              <Empty icon={<ListTree className="size-5" />} title="The Commerce Control List could not be loaded">
                Check that the Kanmon server is running and the regulatory data has been synced (Settings → Data).
              </Empty>
            </Card>
          ) : (
            <div className="space-y-6">
              {current && (
                <div>
                  <h2 className="text-[15px] font-semibold tracking-tight">
                    Category {cat} — {categoryLabel(cat, current.title)}
                  </h2>
                  <div className="mt-0.5 text-[12.5px] text-fg-3">{current.title.replace(/[“”]/g, "")}</div>
                </div>
              )}
              {groups.map(({ g, rows }) => (
                <section key={g} aria-label={`${cat}${g} ${GROUPS[g]}`}>
                  <div className="mb-2 flex items-baseline gap-2 px-1">
                    <span className="font-mono text-[12px] font-semibold text-fg">
                      {cat}
                      {g}
                    </span>
                    <span className="text-[12.5px] font-medium text-fg-2">{GROUPS[g]}</span>
                    <span className="text-[11.5px] tabular text-fg-3">{rows.length}</span>
                  </div>
                  <Card className="divide-y divide-line overflow-hidden">
                    {rows.map((e) => (
                      <EccnRow key={e.id} e={e} />
                    ))}
                  </Card>
                </section>
              ))}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-[11.5px] text-fg-3">
                <span className="flex items-center gap-1.5">
                  <ReasonChip r="NS" /> Multilateral regime reasons
                </span>
                <span className="flex items-center gap-1.5">
                  <ReasonChip r="RS" /> Other reasons
                </span>
                <span className="flex items-center gap-1.5">
                  <ReasonChip r="AT" /> Anti-terrorism only (muted)
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </Page>
  );
}

// ---------------------------------------------------------------------------
// /regulations/ccl/:id

const QUICK_DESTS = ["CN", "RU", "IN", "VN", "TH", "AE", "KR", "US"];

interface QuickSummary {
  tone: Tone;
  label: string;
  reasons: string[];
  detail: string;
}

function summarize(rows: CheckRow[]): QuickSummary {
  if (!rows.length) return { tone: "neutral", label: "No license table", reasons: [], detail: "This entry has no EAR License Requirements table." };
  const live = rows.filter((r) => r.applies !== "no");
  const hard = live.filter((r) => r.applies === "yes" && r.licenseRequired === "yes");
  const soft = live.filter((r) => r.applies === "maybe" && r.licenseRequired === "yes");
  const unknown = live.filter((r) => r.licenseRequired === "unknown");
  const uniq = (xs: CheckRow[]) => [...new Set(xs.map((r) => r.reason))];
  if (hard.length) {
    const extra = uniq(soft).filter((r) => !uniq(hard).includes(r));
    return {
      tone: "orange",
      label: "License",
      reasons: [...uniq(hard), ...extra],
      detail: `License required for ${uniq(hard).join(", ")} (whole entry)${extra.length ? `; also ${extra.join(", ")} for some paragraphs or conditions` : ""}.`,
    };
  }
  if (soft.length)
    return {
      tone: "amber",
      label: "Depends on scope",
      reasons: uniq(soft),
      detail: `License required for ${uniq(soft).join(", ")} only for some paragraphs or under a stated condition — classify to the paragraph.`,
    };
  if (unknown.length && unknown.every((r) => /not found on the Commerce Country Chart/i.test(r.note ?? "")))
    return { tone: "neutral", label: "Not on chart", reasons: [], detail: "This destination has no row on the Commerce Country Chart." };
  if (unknown.length) return { tone: "gray", label: "Read text", reasons: uniq(unknown), detail: unknown.map((r) => r.note ?? r.chart).join(" · ") };
  return { tone: "green", label: "NLR", reasons: [], detail: "No Country Chart license requirement for any reason on this entry." };
}

function QuickCheck({ id }: { id: string }) {
  const results = useQueries({
    queries: QUICK_DESTS.map((dest) => ({
      queryKey: ["eccn-check", id, dest, ""],
      queryFn: () => api.get<CheckResult>(`/ccl/${id}/check?dest=${dest}&para=`),
      staleTime: 5 * 60_000,
    })),
  });
  return (
    <Card>
      <CardHeader title="Destination quick check" subtitle="Country Chart result for the entry as a whole" />
      <div className="divide-y divide-line">
        {QUICK_DESTS.map((dest, i) => {
          const r = results[i];
          const s = r.data ? summarize(r.data.rows) : null;
          return (
            <div key={dest} className="flex items-center gap-2 px-4 py-2">
              <Link to={`/regulations/countries/${dest}`} className="min-w-0 flex-1 truncate text-[13px] text-fg hover:underline">
                <CountryName iso2={dest} />
              </Link>
              {r.isError ? (
                <span className="text-[12px] text-fg-3">Unavailable</span>
              ) : !s ? (
                <Skeleton className="h-5 w-20" />
              ) : (
                <>
                  {s.reasons.length > 0 && <span className="truncate font-mono text-[11px] text-fg-3">{s.reasons.join(" ")}</span>}
                  <Tooltip content={s.detail} side="left">
                    <span className="shrink-0">
                      <Badge tone={s.tone} dot={s.tone !== "neutral"}>
                        {s.label}
                      </Badge>
                    </span>
                  </Tooltip>
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className="border-t border-line px-4 py-2.5 text-[11.5px] leading-relaxed text-fg-3">
        Country Chart reasons only. End-use and end-user controls (Part 744) and embargoes (Part 746 — e.g. §746.8 for Russia) apply separately. Pick any destination under License
        requirements for a row-by-row result.
      </div>
    </Card>
  );
}

function linkifyEccns(text: string, known: Set<string>, self: string): ReactNode[] {
  return text.split(/(\b\d[A-E]\d{3}\b)/g).map((part, i) =>
    i % 2 === 1 && known.has(part) && part !== self ? (
      <Link key={i} to={`/regulations/ccl/${part}`} className="font-mono text-[12px] text-accent-text hover:underline">
        {part}
      </Link>
    ) : (
      part
    ),
  );
}

function RelatedControls({ eccn, known }: { eccn: EccnDetail; known: Set<string> }) {
  const [more, setMore] = useState(false);
  const text = eccn.relatedControls?.trim();
  const refs = useMemo(() => [...new Set(text?.match(/\b\d[A-E]\d{3}\b/g) ?? [])].filter((r) => known.has(r) && r !== eccn.id), [text, known, eccn.id]);
  const long = (text?.length ?? 0) > 420;
  return (
    <Card>
      <CardHeader title="Related controls" subtitle={refs.length ? `${refs.length} referenced ECCN${refs.length === 1 ? "" : "s"}` : undefined} />
      <div className="px-4 py-3">
        {!text ? (
          <div className="text-[12.5px] text-fg-3">This entry states no related controls.</div>
        ) : (
          <>
            {refs.length > 0 && (
              <div className="mb-2.5 flex flex-wrap gap-1">
                {refs.map((r) => (
                  <Link key={r} to={`/regulations/ccl/${r}`} className="rounded bg-panel-2 px-1.5 py-0.5 font-mono text-[11.5px] text-fg-2 ring-1 ring-line transition-colors hover:text-fg hover:ring-line-strong">
                    {r}
                  </Link>
                ))}
              </div>
            )}
            <div className={cx("text-[12.5px] leading-relaxed text-fg-2", long && !more && "line-clamp-6")}>{linkifyEccns(text, known, eccn.id)}</div>
            {long && (
              <button type="button" onClick={() => setMore((m) => !m)} className="mt-1.5 text-[12px] font-medium text-accent-text hover:underline">
                {more ? "Show less" : "Show all"}
              </button>
            )}
          </>
        )}
        {eccn.relatedDefinitions && eccn.relatedDefinitions.trim() && !/^N\/?A\.?$/i.test(eccn.relatedDefinitions.trim()) && (
          <div className="mt-3 border-t border-line pt-2.5 text-[12px] leading-relaxed text-fg-3">
            <span className="font-medium text-fg-2">Related definitions: </span>
            {eccn.relatedDefinitions}
          </div>
        )}
      </div>
    </Card>
  );
}

export function EccnPage() {
  const { id: rawId = "" } = useParams();
  const id = rawId.toUpperCase();
  const [params] = useSearchParams();
  const para = params.get("p") ?? undefined;
  const nav = useNavigate();
  const index = useCclIndex();
  const eccn = useQuery({
    queryKey: ["eccn", id],
    queryFn: () => api.get<EccnDetail>(`/ccl/${id}`),
    retry: (n, err) => !(err instanceof ApiError && err.status === 404) && n < 1,
  });

  const list = index.data?.eccns ?? [];
  const pos = list.findIndex((e) => e.id === id);
  const prev = pos > 0 ? list[pos - 1] : undefined;
  const next = pos >= 0 && pos < list.length - 1 ? list[pos + 1] : undefined;
  const known = useMemo(() => new Set(list.map((e) => e.id)), [list]);
  const category = index.data?.categories.find((c) => c.id === (eccn.data?.category ?? id[0]));

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "[" && prev) nav(`/regulations/ccl/${prev.id}`);
      if (e.key === "]" && next) nav(`/regulations/ccl/${next.id}`);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next, nav]);

  const notFound = eccn.error instanceof ApiError && eccn.error.status === 404;
  const catId = eccn.data?.category ?? (/^\d/.test(id) ? id[0] : "");

  return (
    <Page wide>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-fg-3">
          <Link to="/regulations/ccl" className="hover:text-fg">
            Commerce Control List
          </Link>
          {catId && (
            <>
              <ChevronRight className="size-3.5 shrink-0" />
              <Link to={`/regulations/ccl?c=${catId}`} className="truncate hover:text-fg">
                Category {catId}
                {category ? ` · ${categoryLabel(catId, category.title)}` : ""}
              </Link>
            </>
          )}
          <ChevronRight className="size-3.5 shrink-0" />
          <span className="font-mono font-medium text-fg">{id}</span>
        </nav>
        <div className="flex items-center gap-1">
          <Tooltip content={prev ? <span className="flex items-center gap-1.5">Previous entry <Kbd>[</Kbd></span> : null}>
            <Button size="sm" variant="ghost" disabled={!prev} onClick={() => prev && nav(`/regulations/ccl/${prev.id}`)} icon={<ChevronLeft className="size-3.5" />}>
              <span className="font-mono">{prev?.id ?? "—"}</span>
            </Button>
          </Tooltip>
          <span className="text-[11.5px] tabular text-fg-3">{pos >= 0 ? `${pos + 1} / ${list.length}` : ""}</span>
          <Tooltip content={next ? <span className="flex items-center gap-1.5">Next entry <Kbd>]</Kbd></span> : null}>
            <Button size="sm" variant="ghost" disabled={!next} onClick={() => next && nav(`/regulations/ccl/${next.id}`)}>
              <span className="font-mono">{next?.id ?? "—"}</span>
              <ChevronRight className="size-3.5" />
            </Button>
          </Tooltip>
        </div>
      </div>

      {notFound ? (
        <Card>
          <Empty
            icon={<ListTree className="size-5" />}
            title={`${id} is not on the Commerce Control List`}
            action={
              <Link to="/regulations/ccl">
                <Button>Browse the CCL</Button>
              </Link>
            }
          >
            It may have been removed or renumbered in a later amendment — check Regulatory updates. Items not described by any ECCN are EAR99.
          </Empty>
        </Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_312px]">
          <Card className="min-w-0 p-6">
            {eccn.data ? (
              <EccnBody eccn={eccn.data} highlight={para} />
            ) : eccn.isError ? (
              <Empty icon={<ListTree className="size-5" />} title="This entry could not be loaded">
                {(eccn.error as Error).message}
              </Empty>
            ) : (
              <div className="space-y-3">
                <div className="flex gap-3">
                  <Skeleton className="h-8 w-20" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-3.5 w-1/3" />
                  </div>
                </div>
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="mt-6 h-32" />
                <Skeleton className="h-4" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            )}
          </Card>

          <aside className="space-y-4 self-start xl:sticky xl:top-6">
            <Card className="px-4 py-3.5">
              <div className="text-[13.5px] font-semibold tracking-tight">Classify an item here</div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-fg-3">
                Test a product’s specifications against the paragraphs of <span className="font-mono text-fg-2">{id}</span> and record the basis for the classification.
              </p>
              <Link to={`/classify?eccn=${id}`} className="mt-3 inline-block">
                <Button size="sm" icon={<FileSearch className="size-3.5" />}>
                  Open Classify
                </Button>
              </Link>
            </Card>
            {eccn.data && <QuickCheck id={eccn.data.id} />}
            {eccn.data && <RelatedControls eccn={eccn.data} known={known} />}
          </aside>
        </div>
      )}
    </Page>
  );
}
