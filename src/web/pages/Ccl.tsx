// Commerce Control List (15 CFR 774 Supp. No. 1): search first, then browse by category; and the single-ECCN page.
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ExternalLink, ListTree, Search, X } from "lucide-react";
import { forwardRef, useEffect, useMemo, useRef, useState, type InputHTMLAttributes } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Page, useMeta } from "../components/AppShell.tsx";
import { CATEGORY_SHORT, EccnBody, GROUPS, REASONS } from "../components/EccnView.tsx";
import { useRegSheet } from "../components/RegSheet.tsx";
import { Button, Card, Dialog, Empty, Kbd, PageHeader, Select, Skeleton, Tooltip } from "../components/ui/index.tsx";
import { api, ApiError, type EccnDetail, type SourceStamp } from "../lib/api.ts";
import { cx, fmtDate } from "../lib/format.ts";

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

function StampLine({ stamp }: { stamp?: SourceStamp }) {
  return (
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
  );
}

/** The large search field used at the top of reference pages. */
const SearchField = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { value: string; onClear: () => void; shortcut?: string }>(function SearchField(
  { value, onClear, shortcut, className, ...rest },
  ref,
) {
  return (
    <div className={cx("flex items-center gap-2.5 rounded-2xl bg-fill-2 px-4 transition-shadow focus-within:ring-4 focus-within:ring-accent/15", className)}>
      <Search className="size-5 shrink-0 text-fg-3" />
      <input ref={ref} value={value} className="h-12 min-w-0 flex-1 bg-transparent text-[17px] tracking-tight outline-none placeholder:text-fg-3" {...rest} />
      {value ? (
        <button type="button" onClick={onClear} className="rounded-full p-1 text-fg-3 hover:bg-fill hover:text-fg" aria-label="Clear search">
          <X className="size-4" />
        </button>
      ) : (
        shortcut && <Kbd>{shortcut}</Kbd>
      )}
    </div>
  );
});

function EccnRow({ e, showCategory }: { e: CclEntry; showCategory?: boolean }) {
  const reasons = e.reasons.filter((r) => r !== "?");
  const atOnly = reasons.length > 0 && reasons.every((r) => r === "AT");
  const muted = atOnly || e.reserved;
  const markers = [is600(e.id) && "600 series", is515(e.id) && "9x515", e.itar && "ITAR"].filter(Boolean) as string[];
  const tail = [...markers, ...reasons];
  return (
    <Link to={`/regulations/ccl/${e.id}`} className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-fill-2 focus-visible:bg-fill-2 focus-visible:outline-none">
      <span className={cx("w-14 shrink-0 font-mono text-[13px] font-medium", muted && "text-fg-3")}>{e.id}</span>
      <div className="min-w-0 flex-1">
        <div className={cx("line-clamp-2 text-[14px] leading-snug", e.reserved ? "text-fg-3" : muted ? "text-fg-2" : "text-fg")}>{e.reserved ? "[Reserved]" : cleanHeading(e.heading)}</div>
        {showCategory && (
          <div className="mt-0.5 text-[12.5px] text-fg-3">
            Category {e.category} · {categoryLabel(e.category)}
          </div>
        )}
      </div>
      {tail.length > 0 && (
        <span className="hidden max-w-[34%] shrink-0 text-right text-[12px] text-fg-3 sm:block" title={reasons.map((r) => `${r} — ${REASONS[r] ?? r}`).join("\n")}>
          {tail.join(" · ")}
        </span>
      )}
      <ChevronRight className="size-4 shrink-0 text-fg-3" />
    </Link>
  );
}

function RowsSkeleton({ n = 8 }: { n?: number }) {
  return (
    <div className="k-list">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3.5">
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 flex-1" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// How an ECCN is built (§738.2(d)) — shown on request

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

function Anatomy({ onCite }: { onCite: () => void }) {
  return (
    <div className="pb-2 text-[14px] leading-relaxed text-fg-2">
      <div className="flex justify-center gap-2 py-3" aria-label="ECCN 3A001: category 3, group A, number 001">
        {[
          { t: "3", l: "Category" },
          { t: "A", l: "Group" },
          { t: "001", l: "Number" },
        ].map((s) => (
          <div key={s.l} className="flex flex-col items-center gap-1.5">
            <span className="rounded-lg bg-fill-2 px-3 py-2 font-mono text-[24px] font-semibold leading-none text-fg">{s.t}</span>
            <span className="text-[12px] text-fg-3">{s.l}</span>
          </div>
        ))}
      </div>
      <p className="mt-3">
        The first digit is the <span className="text-fg">category</span> (0–9). The letter is the <span className="text-fg">product group</span>: A systems and components, B test and production
        equipment, C materials, D software, E technology. The number tells you the regime behind the entry:
      </p>
      <div className="k-list mt-3 border-y border-line [--inset:0px]">
        {RANGES.map(([r, l]) => (
          <div key={r} className="flex items-baseline gap-4 py-1.5 text-[13.5px]">
            <span className="w-16 shrink-0 font-mono text-[12.5px] text-fg">{r}</span>
            <span>{l}</span>
          </div>
        ))}
      </div>
      <p className="mt-3">
        <span className="text-fg">EAR99</span> covers items subject to the EAR that are not on the list. They rarely need a license, except for embargoed destinations, listed parties or prohibited end
        uses (Parts 744 and 746).
      </p>
      <button type="button" onClick={onCite} className="mt-3 text-[13.5px] text-accent-text hover:underline">
        Read 15 CFR 738.2(d)
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// /regulations/ccl

export function CclPage() {
  const meta = useMeta();
  const index = useCclIndex();
  const nav = useNavigate();
  const openReg = useRegSheet();
  const [params, setParams] = useSearchParams();
  const cat = params.get("c") ?? "0";
  const [q, setQ] = useState(params.get("q") ?? "");
  const [anatomy, setAnatomy] = useState(false);
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
  const fullTitle = current?.title.replace(/[“”"]/g, "").trim();

  return (
    <Page>
      <PageHeader
        title="Commerce Control List"
        description={
          <>
            Find the ECCN that describes your item.
            <StampLine stamp={meta.data?.stamps.ccl} />
          </>
        }
      />

      <SearchField
        ref={inputRef}
        value={q}
        onClear={() => setQ("")}
        shortcut="/"
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setQ("");
          if (e.key === "Enter") {
            const exact = byId.get(q.trim().toUpperCase().slice(0, 5));
            const first = exact ?? hits[0];
            if (first) nav(`/regulations/ccl/${first.id}`);
          }
        }}
        placeholder="ECCN, product or technical term — e.g. 3A090, lathes, infrared cameras"
        aria-label="Search the Commerce Control List"
      />
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1 text-[13px] text-fg-3">
        <span className="tabular">
          {searching
            ? search.isFetching && !search.data
              ? "Searching…"
              : `${hits.length} result${hits.length === 1 ? "" : "s"} — press Return to open the first`
            : "Searches ECCN numbers, headings and the full item text."}
        </span>
        <button type="button" onClick={() => setAnatomy(true)} className="text-accent-text hover:underline">
          How ECCNs are numbered
        </button>
      </div>

      <div className="mt-10">
        {searching ? (
          <Card className={cx("overflow-hidden transition-opacity", search.isFetching && "opacity-70")}>
            {!search.data ? (
              <RowsSkeleton n={6} />
            ) : hits.length === 0 ? (
              <Empty icon={<Search />} title={`No entries match “${dq}”`}>
                Try a broader term or an ECCN prefix such as 3A0.
              </Empty>
            ) : (
              <div className="k-list [--inset:88px]">
                {hits.map((e) => (
                  <EccnRow key={e.id} e={e} showCategory />
                ))}
              </div>
            )}
          </Card>
        ) : index.isError ? (
          <Card>
            <Empty icon={<ListTree />} title="The Commerce Control List could not be loaded">
              Check that the server is running and the regulatory data has been synced in Settings.
            </Empty>
          </Card>
        ) : (
          <div className="grid gap-8 xl:grid-cols-[236px_minmax(0,1fr)]">
            <nav aria-label="Categories" className="min-w-0 self-start xl:sticky xl:top-[76px]">
              <div className="mb-2 hidden px-2.5 text-[13px] font-semibold text-fg-2 xl:block">Browse by category</div>
              <div className="xl:hidden">
                <Select value={cat} onChange={(e) => selectCategory(e.target.value)} aria-label="Category">
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.id} — {categoryLabel(c.id, c.title)} ({counts[c.id] ?? 0})
                    </option>
                  ))}
                </Select>
              </div>
              <div className="hidden flex-col gap-0.5 xl:flex">
                {index.isLoading
                  ? Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="h-8" />)
                  : categories.map((c) => {
                      const active = c.id === cat;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => selectCategory(c.id)}
                          title={c.title}
                          aria-current={active ? "page" : undefined}
                          className={cx("flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-left text-[13.5px] transition-colors", active ? "bg-fill font-semibold text-fg" : "text-fg hover:bg-fill-2")}
                        >
                          <span className="w-3 text-[12.5px] tabular text-fg-3">{c.id}</span>
                          <span className="min-w-0 flex-1 truncate">{categoryLabel(c.id, c.title)}</span>
                          <span className="shrink-0 text-[12px] font-normal tabular text-fg-3">{counts[c.id] ?? 0}</span>
                        </button>
                      );
                    })}
              </div>
            </nav>

            <div className="min-w-0">
              {index.isLoading ? (
                <Card className="overflow-hidden">
                  <RowsSkeleton />
                </Card>
              ) : (
                <>
                  {current && (
                    <div className="mb-6 px-1">
                      <h2 className="text-[22px] font-semibold tracking-tight">{categoryLabel(cat, current.title)}</h2>
                      <p className="mt-0.5 text-[13px] text-fg-3">
                        Category {cat} · {counts[cat] ?? 0} entries
                        {fullTitle && fullTitle !== categoryLabel(cat, current.title) && <span className="hidden sm:inline"> · {fullTitle}</span>}
                      </p>
                    </div>
                  )}
                  <div className="space-y-7">
                    {groups.map(({ g, rows }) => (
                      <section key={g} aria-label={`${cat}${g} ${GROUPS[g]}`}>
                        <h3 className="mb-2 flex items-baseline gap-2 px-1 text-[13px] font-semibold text-fg-2">
                          <span className="font-mono text-fg">
                            {cat}
                            {g}
                          </span>
                          {GROUPS[g]}
                          <span className="font-normal tabular text-fg-3">{rows.length}</span>
                        </h3>
                        <Card className="k-list overflow-hidden [--inset:88px]">
                          {rows.map((e) => (
                            <EccnRow key={e.id} e={e} />
                          ))}
                        </Card>
                      </section>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <Dialog open={anatomy} onOpenChange={setAnatomy} title="How ECCNs are numbered" description="Every Export Control Classification Number has three parts.">
        <Anatomy
          onCite={() => {
            setAnatomy(false);
            openReg({ kind: "section", id: "738.2", highlight: "(d)", label: "15 CFR 738.2(d)" });
          }}
        />
      </Dialog>
    </Page>
  );
}

// ---------------------------------------------------------------------------
// /regulations/ccl/:id

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
    <Page>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-[13px] text-fg-3">
          <Link to="/regulations/ccl" className="hover:text-fg">
            Control List
          </Link>
          {catId && (
            <>
              <ChevronRight className="size-3.5 shrink-0" />
              <Link to={`/regulations/ccl?c=${catId}`} className="truncate hover:text-fg">
                {category ? categoryLabel(catId, category.title) : `Category ${catId}`}
              </Link>
            </>
          )}
        </nav>
        <div className="flex items-center gap-0.5">
          <Tooltip content={prev ? <span className="flex items-center gap-1.5">Previous entry <Kbd>[</Kbd></span> : null}>
            <Button size="sm" variant="ghost" disabled={!prev} onClick={() => prev && nav(`/regulations/ccl/${prev.id}`)} icon={<ChevronLeft className="size-3.5" />}>
              <span className="font-mono">{prev?.id ?? "—"}</span>
            </Button>
          </Tooltip>
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
          <Empty icon={<ListTree />} title={`${id} is not on the Commerce Control List`} action={<Button onClick={() => nav("/regulations/ccl")}>Search the list</Button>}>
            It may have been removed or renumbered by a later amendment. Items not described by any ECCN are EAR99.
          </Empty>
        </Card>
      ) : eccn.data ? (
        <EccnBody
          eccn={eccn.data}
          highlight={para}
          known={known}
        />
      ) : eccn.isError ? (
        <Card>
          <Empty icon={<ListTree />} title="This entry could not be loaded">
            {(eccn.error as Error).message}
          </Empty>
        </Card>
      ) : (
        <div className="space-y-3">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="mt-8 h-36 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      )}
    </Page>
  );
}
