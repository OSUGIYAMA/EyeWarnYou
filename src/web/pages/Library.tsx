// Regulation library: a reader for the EAR (15 CFR 730–774) and the Japanese export-control statutes, with a
// sticky table of contents on the left and full-text search above the text.
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { BookOpen, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Page, useMeta } from "../components/AppShell.tsx";
import { SectionBody } from "../components/RegSheet.tsx";
import { Button, Card, Empty, Input, Kbd, PageHeader, Section, Segmented, Skeleton, Tooltip } from "../components/ui/index.tsx";
import { api } from "../lib/api.ts";
import { cx, fmtDate } from "../lib/format.ts";

type Source = "ear" | "jp";

interface SectionMeta {
  id: string;
  source: Source;
  part: string;
  title: string;
  cite: string;
}
interface Hit {
  id: string;
  sectionId: string;
  source: Source;
  cite: string;
  title: string;
  snippet: string;
  score: number;
}

const EAR_PARTS: Record<string, string> = {
  "730": "General information",
  "732": "Steps for using the EAR",
  "734": "Scope of the EAR",
  "736": "General prohibitions",
  "738": "CCL overview and the Country Chart",
  "740": "License exceptions",
  "742": "Control policy — CCL-based controls",
  "743": "Special reporting and notification",
  "744": "Control policy — end-user and end-use based",
  "746": "Embargoes and other special controls",
  "748": "Applications and documentation",
  "750": "Application processing, issuance and denial",
  "758": "Export clearance requirements",
  "760": "Restrictive trade practices or boycotts",
  "762": "Recordkeeping",
  "764": "Enforcement and protective measures",
  "772": "Definitions of terms",
  "774": "The Commerce Control List",
};

const JP_LAWS: { part: string; en: string }[] = [
  { part: "外為法", en: "Foreign Exchange and Foreign Trade Act" },
  { part: "外為令", en: "Foreign Exchange Order" },
  { part: "輸出令", en: "Export Trade Control Order" },
  { part: "貨物等省令", en: "Goods and technology ordinance" },
  { part: "核兵器等おそれ省令", en: "WMD catch-all ordinance" },
  { part: "通常兵器おそれ省令", en: "Conventional-weapons catch-all ordinance" },
];

const START: Record<Source, { id: string; cite: string; title: string }[]> = {
  ear: [
    { id: "734.3", cite: "§734.3", title: "Items subject to the EAR" },
    { id: "736.2", cite: "§736.2", title: "General prohibitions" },
    { id: "738.4", cite: "§738.4", title: "Determining whether a license is required" },
    { id: "740.2", cite: "§740.2", title: "Restrictions on all license exceptions" },
    { id: "744.21", cite: "§744.21", title: "Military end use and end user" },
    { id: "746.8", cite: "§746.8", title: "Sanctions against Russia and Belarus" },
    { id: "772.1", cite: "§772.1", title: "Definitions of terms" },
  ],
  jp: [
    { id: "jp:324AC0000000228:48", cite: "外為法 第48条", title: "輸出の許可等" },
    { id: "jp:324CO0000000378:1", cite: "輸出令 第1条", title: "輸出の許可" },
    { id: "jp:324CO0000000378:4", cite: "輸出令 第4条", title: "特例（少額特例・キャッチオール）" },
    { id: "jp:324CO0000000378:別表第一", cite: "輸出令 別表第一", title: "List-controlled goods, 1–16の項" },
    { id: "jp:403M50000400049:1", cite: "貨物等省令 第1条", title: "2の項 goods specifications" },
    { id: "jp:413M60000400249:main", cite: "核兵器等おそれ省令", title: "WMD catch-all — use and end user" },
  ],
};

const STOP = new Set(["the", "of", "and", "or", "a", "an", "to", "in", "for", "by", "as", "with", "on", "that", "is", "are", "be", "any", "this", "not"]);

function useDebounced<T>(value: T, ms = 220): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
}

function Bolded({ text, query }: { text: string; query: string }) {
  const terms = [...query.normalize("NFKC").matchAll(/[぀-ヿ㐀-䶿一-鿿]+|[A-Za-z0-9][A-Za-z0-9.\-']*/g)]
    .map((m) => m[0].replace(/[.\-']+$/, ""))
    .filter((t) => (/[぀-ヿ㐀-䶿一-鿿]/.test(t) ? t.length >= 1 : t.length >= 2 && !STOP.has(t.toLowerCase())));
  if (!terms.length) return <>{text}</>;
  const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return (
    <>
      {text.split(re).map((p, i) =>
        i % 2 === 1 ? (
          <b key={i} className="font-semibold text-fg">
            {p}
          </b>
        ) : (
          p
        ),
      )}
    </>
  );
}

const partLabel = (src: Source, part: string) => (src === "ear" ? `Part ${part}` : part);
const partTitle = (src: Source, part: string) => (src === "ear" ? EAR_PARTS[part] ?? "" : JP_LAWS.find((l) => l.part === part)?.en ?? "");
const partRank = (src: Source, part: string) => {
  const order = src === "ear" ? Object.keys(EAR_PARTS) : JP_LAWS.map((l) => l.part);
  const i = order.indexOf(part);
  return i < 0 ? 999 : i;
};

function SectionRowLabel({ s }: { s: SectionMeta }) {
  if (s.source === "ear") {
    const num = s.id.startsWith(`${s.part} `) ? s.id.slice(s.part.length + 1) : s.id;
    return (
      <>
        <span className="w-[54px] shrink-0 text-[12.5px] tabular text-fg-3">{num}</span>
        <span className="truncate">{s.title}</span>
      </>
    );
  }
  const m = s.title.match(/^([^（]+)（(.+)）$/);
  return m ? (
    <>
      <span className="shrink-0 text-fg-3">{m[1]}</span>
      <span className="truncate">{m[2]}</span>
    </>
  ) : (
    <span className="truncate">{s.title}</span>
  );
}

export function LibraryPage() {
  const meta = useMeta();
  const [params, setParams] = useSearchParams();
  const sel = params.get("s") ?? "";
  const src: Source = params.get("src") === "jp" || (!params.get("src") && sel.startsWith("jp:")) ? "jp" : "ear";
  const sections = useQuery({ queryKey: ["lib-sections", src], queryFn: () => api.get<SectionMeta[]>(`/library/sections?source=${src}`), staleTime: Infinity });
  const [filter, setFilter] = useState("");
  const [q, setQ] = useState("");
  const [showResults, setShowResults] = useState(true);
  const dq = useDebounced(q.trim());
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const search = useQuery({
    queryKey: ["lib-search", src, dq],
    queryFn: () => api.get<{ results: Hit[] }>(`/library/search?q=${encodeURIComponent(dq)}&source=${src}`),
    enabled: dq.length >= 2,
    placeholderData: keepPreviousData,
  });

  const select = (id: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("s", id);
      next.set("src", id.startsWith("jp:") ? "jp" : "ear");
      return next;
    });
  const setSource = (s: Source) => {
    setQ("");
    setFilter("");
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("src", s);
      if (sel && sel.startsWith("jp:") !== (s === "jp")) next.delete("s");
      return next;
    });
  };

  // Ordered sections (by part) for grouping and prev/next.
  const ordered = useMemo(
    () => [...(sections.data ?? [])].map((s, i) => ({ s, i })).sort((a, b) => partRank(src, a.s.part) - partRank(src, b.s.part) || a.i - b.i).map((x) => x.s),
    [sections.data, src],
  );
  const groups = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const m = new Map<string, SectionMeta[]>();
    for (const s of ordered) {
      if (f && !`${s.id} ${s.title} ${s.cite}`.toLowerCase().includes(f) && !partTitle(src, s.part).toLowerCase().includes(f)) continue;
      const list = m.get(s.part) ?? [];
      list.push(s);
      m.set(s.part, list);
    }
    return [...m.entries()];
  }, [ordered, filter, src]);

  const pos = ordered.findIndex((s) => s.id === sel);
  const current = pos >= 0 ? ordered[pos] : undefined;
  const prev = pos > 0 ? ordered[pos - 1] : undefined;
  const next = pos >= 0 && pos < ordered.length - 1 ? ordered[pos + 1] : undefined;

  // Bring an externally chosen section (deep link, prev/next, search hit) into the contents pane. Only the pane
  // scrolls — scrollIntoView would also move the window. Clicks inside the list never move it.
  const clickedInList = useRef(false);
  useEffect(() => {
    const box = listRef.current;
    if (!sel || !box) return;
    if (clickedInList.current) {
      clickedInList.current = false;
      return;
    }
    const el = box.querySelector<HTMLElement>(`[data-sid="${CSS.escape(sel)}"]`);
    if (!el) return;
    const top = el.offsetTop;
    const header = 40; // sticky part header
    if (top < box.scrollTop + header || top + el.offsetHeight > box.scrollTop + box.clientHeight * 0.7) box.scrollTop = Math.max(0, top - box.clientHeight * 0.3);
  }, [sel, sections.data]);

  // A new section starts at the top of the reader.
  useEffect(() => {
    if (sel && window.scrollY > 260) window.scrollTo({ top: 0 });
  }, [sel]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "[" && prev) select(prev.id);
      if (e.key === "]" && next) select(next.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const hits = search.data?.results ?? [];
  const resultsOpen = dq.length >= 2 && showResults;
  const earStamp = meta.data?.stamps.ccl;
  const jpStamp = meta.data?.stamps.jp;

  return (
    <Page wide>
      <PageHeader
        title="Library"
        description={
          <>
            The full text of the EAR and Japan’s export-control law. Every citation in EyeWarnYou opens here.
            <span className="mt-1 block text-[12.5px] text-fg-3">
              eCFR as amended to {earStamp ? fmtDate(earStamp.asOf) : "…"} · 輸出令 as revised to {jpStamp ? fmtDate(jpStamp.asOf) : "…"}
              {meta.data && <span className="tabular"> · {meta.data.counts.sections} sections</span>}
            </span>
          </>
        }
        actions={
          <Segmented<Source>
            value={src}
            onChange={setSource}
            options={[
              { value: "ear", label: "US EAR" },
              { value: "jp", label: "Japan" },
            ]}
          />
        }
      />

      <div className="grid gap-10 lg:grid-cols-[264px_minmax(0,1fr)] xl:grid-cols-[288px_minmax(0,1fr)]">
        {/* Contents */}
        <nav aria-label="Contents" className="flex min-w-0 flex-col self-start lg:sticky lg:top-[68px] lg:h-[calc(100vh-84px)]">
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setFilter("")}
              placeholder={src === "ear" ? "Filter contents" : "Filter — 第四条, 別表"}
              className="pl-9"
              aria-label="Filter the contents"
            />
          </div>
          <div ref={listRef} className="scroll-thin relative max-h-[50vh] flex-1 overflow-y-auto pb-6 lg:max-h-none">
            {sections.isLoading ? (
              <div className="space-y-2 p-2">
                {Array.from({ length: 12 }, (_, i) => (
                  <Skeleton key={i} className="h-5" />
                ))}
              </div>
            ) : groups.length === 0 ? (
              <div className="px-2.5 py-8 text-[13px] text-fg-3">No sections match “{filter}”.</div>
            ) : (
              groups.map(([part, list]) => (
                <div key={part}>
                  <div className="sticky top-0 z-[1] bg-bg px-2.5 pb-1 pt-4">
                    <div className="flex items-baseline gap-2">
                      <span className="shrink-0 text-[13px] font-semibold">{partLabel(src, part)}</span>
                      <span className="truncate text-[12.5px] text-fg-3">{partTitle(src, part)}</span>
                    </div>
                  </div>
                  {list.map((s) => {
                    const active = s.id === sel;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        data-sid={s.id}
                        onClick={() => {
                          clickedInList.current = s.id !== sel;
                          select(s.id);
                          setShowResults(false);
                        }}
                        aria-current={active ? "true" : undefined}
                        title={`${s.cite} — ${s.title}`}
                        className={cx("flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[13.5px] transition-colors", active ? "bg-fill font-medium text-fg" : "text-fg hover:bg-fill-2")}
                      >
                        <SectionRowLabel s={s} />
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </nav>

        {/* Reader */}
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 rounded-2xl bg-fill-2 px-4 transition-shadow focus-within:ring-4 focus-within:ring-accent/15">
            <Search className="size-5 shrink-0 text-fg-3" />
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setShowResults(true);
              }}
              onFocus={() => setShowResults(true)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  if (q) setQ("");
                  else searchRef.current?.blur();
                }
                if (e.key === "Enter" && hits[0]) {
                  select(hits[0].sectionId);
                  setShowResults(false);
                }
              }}
              placeholder={src === "ear" ? "Search the EAR — e.g. deemed export, de minimis, foreign direct product" : "Search Japanese law — e.g. 少額特例, 需要者, 役務取引"}
              aria-label="Search the regulation text"
              className="h-12 min-w-0 flex-1 bg-transparent text-[17px] tracking-tight outline-none placeholder:text-fg-3"
            />
            {q ? (
              <button type="button" onClick={() => setQ("")} className="rounded-full p-1 text-fg-3 hover:bg-fill hover:text-fg" aria-label="Clear search">
                <X className="size-4" />
              </button>
            ) : (
              <Kbd>/</Kbd>
            )}
          </div>

          {dq.length >= 2 && !showResults && (
            <button type="button" onClick={() => setShowResults(true)} className="mt-2.5 px-1 text-[13px] text-accent-text hover:underline">
              Show {hits.length} result{hits.length === 1 ? "" : "s"} for “{dq}”
            </button>
          )}

          {resultsOpen && (
            <div className={cx("mt-6 transition-opacity", search.isFetching && "opacity-70")}>
              <div className="mb-2 flex items-center justify-between px-1 text-[13px] text-fg-3">
                <span>
                  {search.data ? `${hits.length} passage${hits.length === 1 ? "" : "s"}` : "Searching…"} in {src === "ear" ? "the EAR" : "Japanese law"}
                </span>
                {sel && (
                  <button type="button" onClick={() => setShowResults(false)} className="text-accent-text hover:underline">
                    Back to {current?.cite ?? "section"}
                  </button>
                )}
              </div>
              <Card className="overflow-hidden">
                {!search.data ? (
                  <div className="space-y-3 p-4">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-12" />
                    ))}
                  </div>
                ) : hits.length === 0 ? (
                  <Empty icon={<Search />} title={`Nothing found for “${dq}”`}>
                    {src === "ear" ? "Try fewer words, or switch to Japan to search the Japanese statutes." : "Try a shorter term, or switch to US EAR."}
                  </Empty>
                ) : (
                  <div className="k-list">
                    {hits.map((h) => (
                      <button
                        key={h.id}
                        type="button"
                        onClick={() => {
                          select(h.sectionId);
                          setShowResults(false);
                          window.scrollTo({ top: 0 });
                        }}
                        className={cx("block w-full px-4 py-3 text-left transition-colors hover:bg-fill-2", h.sectionId === sel && "bg-fill-2")}
                      >
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <span className="text-[14px] font-medium">{h.cite}</span>
                          <span className="truncate text-[13px] text-fg-3">{h.title}</span>
                        </div>
                        <div className={cx("mt-1 line-clamp-3 max-w-[80ch] text-[13.5px] leading-relaxed text-fg-2", h.source === "jp" && "tracking-[0.02em]")}>
                          <Bolded text={h.snippet} query={dq} />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          )}

          {sel ? (
            <div className="mt-8">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
                <span className="min-w-0 truncate px-1 text-[13px] text-fg-3">{current ? `${partLabel(current.source, current.part)} · ${partTitle(current.source, current.part)}` : ""}</span>
                <div className="flex items-center gap-0.5">
                  <Tooltip content={prev ? <span className="flex items-center gap-1.5">{prev.cite} <Kbd>[</Kbd></span> : null}>
                    <Button size="sm" variant="ghost" disabled={!prev} onClick={() => prev && select(prev.id)} icon={<ChevronLeft className="size-3.5" />}>
                      Previous
                    </Button>
                  </Tooltip>
                  <Tooltip content={next ? <span className="flex items-center gap-1.5">{next.cite} <Kbd>]</Kbd></span> : null}>
                    <Button size="sm" variant="ghost" disabled={!next} onClick={() => next && select(next.id)}>
                      Next
                      <ChevronRight className="size-3.5" />
                    </Button>
                  </Tooltip>
                </div>
              </div>
              <div className="min-h-[50vh]">
                <SectionBody key={sel} id={sel} className="px-1 pb-10 pt-6" />
              </div>
              {(prev || next) && (
                <div className="grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
                  {prev ? (
                    <button type="button" onClick={() => select(prev.id)} className="rounded-lg px-3 py-2 text-left transition-colors hover:bg-fill-2">
                      <div className="text-[12.5px] text-fg-3">Previous</div>
                      <div className="truncate text-[14px] text-accent-text">
                        {prev.cite} · {prev.title}
                      </div>
                    </button>
                  ) : (
                    <span />
                  )}
                  {next && (
                    <button type="button" onClick={() => select(next.id)} className="rounded-lg px-3 py-2 text-right transition-colors hover:bg-fill-2">
                      <div className="text-[12.5px] text-fg-3">Next</div>
                      <div className="truncate text-[14px] text-accent-text">
                        {next.cite} · {next.title}
                      </div>
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            !resultsOpen && (
              <div className="mt-10">
                <Empty icon={<BookOpen />} title="Choose a section to read">
                  Pick one from the contents, or search the full text above.
                </Empty>
                <Section title="Good places to start" className="mx-auto max-w-2xl">
                  <Card className="k-list">
                    {START[src].map((x) => (
                      <button key={x.id} type="button" onClick={() => select(x.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-fill-2">
                        <span className="w-40 shrink-0 text-[14px] font-medium">{x.cite}</span>
                        <span className="min-w-0 flex-1 truncate text-[14px] text-fg-2">{x.title}</span>
                        <ChevronRight className="size-4 shrink-0 text-fg-3" />
                      </button>
                    ))}
                  </Card>
                </Section>
              </div>
            )
          )}
        </div>
      </div>
    </Page>
  );
}
