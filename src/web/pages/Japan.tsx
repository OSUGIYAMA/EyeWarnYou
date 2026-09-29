// Japan (FEFTA / 外為法) reference: 輸出令別表第一 list control, the 16の項 catch-all and the destination lists.
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Check, ChevronRight, ExternalLink, Landmark, Search, X } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { JpCountryLists, JpDerived } from "@/shared/regs.ts";
import { Page, useMeta } from "../components/AppShell.tsx";
import { CountryName } from "../components/CountryPicker.tsx";
import { ToneDot } from "../components/EccnView.tsx";
import { useRegSheet } from "../components/RegSheet.tsx";
import { Button, Card, Empty, Input, PageHeader, Section, Select, Skeleton, TabPanel, Tabs } from "../components/ui/index.tsx";
import { api, type JpAppendix1Row, type SourceStamp } from "../lib/api.ts";
import { cx, fmtDate, type Tone } from "../lib/format.ts";

// ---------------------------------------------------------------------------
// Data & constants

interface JpListResponse {
  appendix1: JpAppendix1Row[];
  stamp: SourceStamp;
  lists: JpCountryLists;
  derived: JpDerived;
}
interface JpHit {
  id: string;
  label: string;
  text: string;
  kind: "appendix1" | "ministerial" | string;
  score: number;
}
interface SectionMeta {
  id: string;
  source: "ear" | "jp";
  part: string;
  title: string;
  cite: string;
}
interface HsResult {
  code: string;
  jpCatchAll: "16-1" | "16-2" | "out_of_scope" | "unknown";
  russia: { supp2: boolean; supp4: boolean; supp5: boolean; supp7: boolean };
}

const ORDER = "jp:324CO0000000378"; // 輸出貿易管理令
const GOODS = "jp:403M50000400049"; // 貨物等省令
const WMD_ORD = "jp:413M60000400249:main"; // 核兵器等おそれ省令
const CONV_ORD = "jp:420M60000400057:main"; // 通常兵器おそれ省令

/** 項 of 輸出令別表第一 with the 貨物等省令 article that specifies goods (and, for 外為令別表, technology). */
const KOU: { kou: string; en: string; goods?: string; tech?: string }[] = [
  { kou: "1", en: "Arms" },
  { kou: "2", en: "Nuclear", goods: "1", tech: "15" },
  { kou: "3", en: "Chemical weapons", goods: "2", tech: "15_2" },
  { kou: "3の2", en: "Biological weapons", goods: "2_2", tech: "15_3" },
  { kou: "4", en: "Missiles", goods: "3", tech: "16" },
  { kou: "5", en: "Advanced materials", goods: "4", tech: "17" },
  { kou: "6", en: "Materials processing", goods: "5", tech: "18" },
  { kou: "7", en: "Electronics", goods: "6", tech: "19" },
  { kou: "8", en: "Computers", goods: "7", tech: "20" },
  { kou: "9", en: "Telecommunications & information security", goods: "8", tech: "21" },
  { kou: "10", en: "Sensors & lasers", goods: "9", tech: "22" },
  { kou: "11", en: "Navigation & avionics", goods: "10", tech: "23" },
  { kou: "12", en: "Marine", goods: "11", tech: "24" },
  { kou: "13", en: "Propulsion", goods: "12", tech: "25" },
  { kou: "14", en: "Other (misc.)", goods: "13", tech: "26" },
  { kou: "15", en: "Sensitive items", goods: "14", tech: "27" },
  { kou: "16", en: "Catch-all", goods: "14_2", tech: "28" },
];

const KANJI: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
function kanjiToInt(s: string): number {
  let total = 0;
  let cur = 0;
  for (const ch of s) {
    if (ch === "百") {
      total += (cur || 1) * 100;
      cur = 0;
    } else if (ch === "十") {
      total += (cur || 1) * 10;
      cur = 0;
    } else cur = KANJI[ch] ?? 0;
  }
  return total + cur;
}
/** "第十四条の二" → "14_2" (the article key used in library section ids). */
function articleKey(title: string): string | null {
  const m = title.match(/第([一二三四五六七八九十百]+)条(?:の([一二三四五六七八九十]+))?/);
  if (!m) return null;
  return m[2] ? `${kanjiToInt(m[1])}_${kanjiToInt(m[2])}` : String(kanjiToInt(m[1]));
}

function useDebounced<T>(value: T, ms = 200): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function Bolded({ text, query }: { text: string; query: string }) {
  const terms = query
    .split(/[\s、。・]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 || /[぀-ヿ㐀-䶿一-鿿]/.test(t));
  if (!terms.length) return <>{text}</>;
  const re = new RegExp(`(${terms.map(escapeRe).join("|")})`, "gi");
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

const fmtHs = (h: string) => (h.length > 4 ? `${h.slice(0, 4)}.${h.slice(4)}` : h);
function chapterRuns(ch: string[]): string {
  const n = ch.map(Number).sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < n.length; ) {
    let j = i;
    while (j + 1 < n.length && n[j + 1] === n[j] + 1) j++;
    out.push(j > i ? `${n[i]}–${n[j]}` : String(n[i]));
    i = j + 1;
  }
  return out.join(", ");
}

function CiteButton({ children, onClick, className }: { children: ReactNode; onClick: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick} className={cx("whitespace-nowrap text-[13px] text-accent-text hover:underline", className)}>
      {children}
    </button>
  );
}

/** A disclosure for supporting text: closed by default, one line when closed. */
function Disclosure({ summary, children }: { summary: ReactNode; children: ReactNode }) {
  return (
    <details className="group px-4 py-2.5">
      <summary className="flex cursor-pointer list-none items-center gap-1 text-[13px] text-fg-2 hover:text-fg [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
        {summary}
      </summary>
      <div className="mt-2 pl-[18px] text-[13px] leading-relaxed text-fg-2">{children}</div>
    </details>
  );
}

// ---------------------------------------------------------------------------

export function JapanPage() {
  const meta = useMeta();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "list";
  const jp = useQuery({ queryKey: ["jp-list"], queryFn: () => api.get<JpListResponse>("/jp/list"), staleTime: Infinity });
  const orderStamp = meta.data?.stamps.jp ?? jp.data?.lists.stamp;
  const goodsStamp = meta.data?.stamps.jpList ?? jp.data?.stamp;

  return (
    <Page>
      <PageHeader
        title="Japan (FEFTA)"
        description={
          <>
            List control under 輸出令 別表第一, the catch-all under 16の項, and the destination lists that change what each requires.
            <span className="mt-1 block text-[12.5px] text-fg-3">
              輸出令 as revised to {orderStamp ? fmtDate(orderStamp.asOf) : "…"} · 貨物等省令 as revised to {goodsStamp ? fmtDate(goodsStamp.asOf) : "…"} ·{" "}
              <a href={orderStamp?.url ?? "https://laws.e-gov.go.jp/"} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 hover:text-fg">
                e-Gov法令 <ExternalLink className="size-3" />
              </a>
            </span>
          </>
        }
      />
      <Tabs
        value={tab}
        onValueChange={(v) => setParams(v === "list" ? {} : { tab: v }, { replace: true })}
        tabs={[
          { value: "list", label: "List control (別表第一)", count: jp.data?.appendix1.length },
          { value: "catchall", label: "Catch-all (16の項)" },
          { value: "countries", label: "Destination lists" },
        ]}
      >
        <TabPanel value="list" className="pt-8 focus:outline-none">
          <ListControl data={jp.data} loading={jp.isLoading} />
        </TabPanel>
        <TabPanel value="catchall" className="pt-8 focus:outline-none">
          <CatchAll derived={jp.data?.derived} />
        </TabPanel>
        <TabPanel value="countries" className="pt-8 focus:outline-none">
          <CountryLists lists={jp.data?.lists} loading={jp.isLoading} />
        </TabPanel>
      </Tabs>
    </Page>
  );
}

// ---------------------------------------------------------------------------
// (a) 別表第一

function ListControl({ data, loading }: { data?: JpListResponse; loading: boolean }) {
  const open = useRegSheet();
  const sections = useQuery({ queryKey: ["lib-sections", "jp"], queryFn: () => api.get<SectionMeta[]>("/library/sections?source=jp"), staleTime: Infinity });
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim());
  const [flash, setFlash] = useState<number | null>(null);
  const search = useQuery({
    queryKey: ["jp-search", dq],
    queryFn: () => api.get<{ results: JpHit[] }>(`/jp/list?q=${encodeURIComponent(dq)}`),
    enabled: dq.length >= 2,
    placeholderData: keepPreviousData,
  });

  const sectionById = useMemo(() => new Map((sections.data ?? []).map((s) => [s.id, s])), [sections.data]);
  const grouped = useMemo(() => {
    const m = new Map<string, { row: JpAppendix1Row; index: number }[]>();
    (data?.appendix1 ?? []).forEach((row, index) => {
      const list = m.get(row.kou) ?? [];
      list.push({ row, index });
      m.set(row.kou, list);
    });
    return m;
  }, [data]);

  useEffect(() => {
    if (flash === null) return;
    document.getElementById(`a1-${flash}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    const t = setTimeout(() => setFlash(null), 1800);
    return () => clearTimeout(t);
  }, [flash]);

  const openArticle = (key: string) => {
    const s = sectionById.get(`${GOODS}:${key}`);
    open({ kind: "section", id: `${GOODS}:${key}`, label: `貨物等省令 ${s?.title.replace(/（.*$/, "") ?? ""}`.trim() });
  };
  const articleLabel = (key: string) => sectionById.get(`${GOODS}:${key}`)?.title.replace(/（.*$/, "");

  const onHit = (h: JpHit) => {
    if (h.kind === "appendix1") {
      const i = Number(h.id.split(":")[1]);
      setQ("");
      setFlash(i);
      return;
    }
    const key = articleKey(h.label);
    if (key) openArticle(key);
  };
  const jump = (kou: string) => {
    setQ("");
    requestAnimationFrame(() => document.getElementById(`kou-${kou}`)?.scrollIntoView({ block: "start", behavior: "smooth" }));
  };

  const searching = dq.length >= 2;
  const hits = search.data?.results ?? [];

  return (
    <div>
      <div className="flex items-center gap-2.5 rounded-2xl bg-fill-2 px-4 transition-shadow focus-within:ring-4 focus-within:ring-accent/15">
        <Search className="size-5 shrink-0 text-fg-3" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setQ("")}
          placeholder="Search 別表第一 and 貨物等省令 — e.g. 集積回路, 工作機械, レーザー"
          aria-label="Search the Japanese control list"
          className="h-12 min-w-0 flex-1 bg-transparent text-[17px] tracking-tight outline-none placeholder:text-fg-3"
        />
        {q && (
          <button type="button" onClick={() => setQ("")} className="rounded-full p-1 text-fg-3 hover:bg-fill hover:text-fg" aria-label="Clear search">
            <X className="size-4" />
          </button>
        )}
      </div>
      <div className="mt-2.5 px-1 text-[13px] tabular text-fg-3">
        {searching ? (search.data ? `${hits.length} result${hits.length === 1 ? "" : "s"}` : "Searching…") : data ? `${data.appendix1.length} rows in 17 項. Search covers the order and every line of the ministerial ordinance.` : ""}
      </div>

      <div className="mt-10">
        {searching ? (
          <Card className={cx("overflow-hidden transition-opacity", search.isFetching && "opacity-70")}>
            {!search.data ? (
              <div className="space-y-3 p-4">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-10" />
                ))}
              </div>
            ) : hits.length === 0 ? (
              <Empty icon={<Search />} title={`No matches for “${dq}”`}>
                Try a shorter term.
              </Empty>
            ) : (
              <div className="k-list">
                {hits.map((h) => (
                  <button key={h.id} type="button" onClick={() => onHit(h)} className="flex w-full items-start gap-4 px-4 py-3 text-left transition-colors hover:bg-fill-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-medium">
                        {h.label.replace(/^貨物等省令\s*/, "")} <span className="font-normal text-fg-3">{h.kind === "appendix1" ? "輸出令 別表第一" : "貨物等省令"}</span>
                      </div>
                      <div className="mt-0.5 line-clamp-2 text-[13px] leading-relaxed text-fg-2">
                        <Bolded text={h.text} query={dq} />
                      </div>
                    </div>
                    <ChevronRight className="mt-0.5 size-4 shrink-0 text-fg-3" />
                  </button>
                ))}
              </div>
            )}
          </Card>
        ) : loading ? (
          <div className="space-y-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : !data ? (
          <Card>
            <Empty icon={<Landmark />} title="The Japanese control list could not be loaded">
              Check that the server is running and the regulatory data has been synced in Settings.
            </Empty>
          </Card>
        ) : (
          <div className="grid gap-8 xl:grid-cols-[236px_minmax(0,1fr)]">
            <nav aria-label="項" className="min-w-0 self-start xl:sticky xl:top-[76px]">
              <div className="mb-2 hidden px-2.5 text-[13px] font-semibold text-fg-2 xl:block">Jump to 項</div>
              <div className="xl:hidden">
                <Select defaultValue="" onChange={(e) => e.target.value && jump(e.target.value)} aria-label="Jump to 項">
                  <option value="">Jump to 項…</option>
                  {KOU.map((k) => (
                    <option key={k.kou} value={k.kou}>
                      {k.kou}の項 — {k.en}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="hidden flex-col gap-0.5 xl:flex">
                {KOU.map((k) => (
                  <a
                    key={k.kou}
                    href={`#kou-${k.kou}`}
                    onClick={(e) => {
                      e.preventDefault();
                      jump(k.kou);
                    }}
                    title={`${k.kou}の項 — ${k.en}`}
                    className="flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] transition-colors hover:bg-fill-2"
                  >
                    <span className="w-8 shrink-0 text-[12.5px] tabular text-fg-3">{k.kou}</span>
                    <span className="min-w-0 flex-1 truncate">{k.en}</span>
                    <span className="shrink-0 text-[12px] tabular text-fg-3">{grouped.get(k.kou)?.length ?? ""}</span>
                  </a>
                ))}
              </div>
            </nav>

            <div className="min-w-0 space-y-10">
              {KOU.map((k) => {
                const rows = grouped.get(k.kou) ?? [];
                if (!rows.length) return null;
                const goodsLabel = k.goods ? articleLabel(k.goods) : undefined;
                const techLabel = k.tech ? articleLabel(k.tech) : undefined;
                return (
                  <section key={k.kou} id={`kou-${k.kou}`} className="scroll-mt-[76px]">
                    <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1">
                      <h3 className="flex items-baseline gap-2">
                        <span className="text-[17px] font-semibold tracking-tight">{k.kou}の項</span>
                        <span className="text-[14px] text-fg-2">{k.en}</span>
                      </h3>
                      <span className="flex flex-wrap items-baseline gap-x-3 text-[13px] text-fg-3">
                        {k.kou === "1" ? (
                          <CiteButton onClick={() => open({ kind: "section", id: `${ORDER}:別表第一`, label: "輸出令 別表第一" })}>輸出令 別表第一</CiteButton>
                        ) : (
                          <>
                            {goodsLabel && (
                              <span>
                                Goods <CiteButton onClick={() => openArticle(k.goods!)}>貨物等省令 {goodsLabel}</CiteButton>
                              </span>
                            )}
                            {techLabel && (
                              <span>
                                Technology <CiteButton onClick={() => openArticle(k.tech!)}>{techLabel}</CiteButton>
                              </span>
                            )}
                          </>
                        )}
                      </span>
                    </div>
                    <Card className="k-list overflow-hidden [--inset:92px]">
                      {rows.map(({ row, index }) => {
                        const sub = row.label.replace(new RegExp(`^${escapeRe(row.kou)}の項`), "");
                        const [text, region] = row.text.split(/(?=〔地域)/);
                        const nested = row.sub.includes("-");
                        return (
                          <div key={index} id={`a1-${index}`} className={cx("flex gap-4 px-4 py-2.5 transition-colors duration-500", flash === index && "bg-amber-soft")}>
                            <span className={cx("w-[60px] shrink-0 pt-px text-[13px] tabular", nested ? "pl-3 text-fg-3" : "text-fg-2")}>{sub || "—"}</span>
                            <div className={cx("min-w-0 flex-1 text-[14px] leading-relaxed", nested ? "pl-3 text-fg-2" : "text-fg")}>
                              {text}
                              {region && <div className="mt-0.5 text-[12.5px] text-fg-3">{region.replace(/[〔〕]/g, "")}</div>}
                            </div>
                          </div>
                        );
                      })}
                    </Card>
                  </section>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// (b) Catch-all

const SCOPE: Record<HsResult["jpCatchAll"], { tone: Tone; title: string; sub: string; text: string }> = {
  "16-1": {
    tone: "orange",
    title: "16の項（1）",
    sub: "HS-designated sensitive goods — 貨物等省令 第十四条の二",
    text: "WMD and conventional-weapons catch-all: use / end-user checks and METI notification for every destination outside Group A.",
  },
  "16-2": {
    tone: "amber",
    title: "16の項（2）",
    sub: "HS Chapters 25–40, 54–59, 63, 68–93 or 95",
    text: "WMD catch-all (use / end-user checks and notification) outside Group A. Conventional-weapons use / end-user checks apply only to UN arms-embargo destinations (別表第三の二); conventional notification applies everywhere outside Group A.",
  },
  out_of_scope: {
    tone: "green",
    title: "Outside 16の項",
    sub: "HS chapter not covered by the catch-all",
    text: "The Japanese catch-all does not apply to these goods. List control under 1–15の項 still applies if they meet a listed specification.",
  },
  unknown: { tone: "gray", title: "Not enough digits", sub: "Enter at least four digits of the HS code", text: "" },
};

const RU_SUPPS: { key: keyof HsResult["russia"]; id: string; label: string; text: string }[] = [
  { key: "supp2", id: "746 Supp. 2", label: "Supp. No. 2", text: "Oil & gas industry sector (§746.8(a)(4))" },
  { key: "supp4", id: "746 Supp. 4", label: "Supp. No. 4", text: "Industrial goods (§746.8(a)(5))" },
  { key: "supp5", id: "746 Supp. 5", label: "Supp. No. 5", text: "Luxury goods (§746.8(a)(7))" },
  { key: "supp7", id: "746 Supp. 7", label: "Supp. No. 7", text: "Crimea (§746.6), Iran (§746.7), Russia & Belarus (§746.8)" },
];

const EXAMPLES = [
  { code: "8542.31", label: "processors" },
  { code: "8471.30", label: "laptops" },
  { code: "8504.40", label: "power converters" },
  { code: "0901.21", label: "roasted coffee" },
];

function Applies({ on }: { on: boolean }) {
  return on ? <Check className="size-4 text-fg" strokeWidth={2.25} aria-label="Applies" /> : <span className="text-fg-3" aria-label="Does not apply">—</span>;
}

function CatchAll({ derived }: { derived?: JpDerived }) {
  const open = useRegSheet();
  const [params] = useSearchParams();
  const [input, setInput] = useState(params.get("hs") ?? "");
  const [code, setCode] = useState(params.get("hs") ?? "");
  const digits = code.replace(/\D/g, "");
  const hs = useQuery({ queryKey: ["hs", digits], queryFn: () => api.get<HsResult>(`/hs/${digits}`), enabled: digits.length > 0, staleTime: Infinity });
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    setCode(input.trim());
  };
  const res = hs.data;
  const scope = res ? SCOPE[res.jpCatchAll] : null;
  const cite = (id: string, label: string) => () => open({ kind: "section", id, label });

  const matrix: { dest: ReactNode; goods: ReactNode; wmd: boolean; conv: boolean; inform: boolean; basis: ReactNode }[] = [
    {
      dest: (
        <>
          Group A <span className="text-fg-3">別表第三</span>
        </>
      ),
      goods: "All 16の項 goods",
      wmd: false,
      conv: false,
      inform: true,
      basis: (
        <>
          <CiteButton onClick={cite(`${ORDER}:1`, "輸出令 第1条")}>第1条第3項</CiteButton>
          <span className="text-fg-3"> · </span>
          <CiteButton onClick={cite(`${ORDER}:4`, "輸出令 第4条")}>第4条第2項第3号</CiteButton>
        </>
      ),
    },
    {
      dest: (
        <>
          UN arms embargo <span className="text-fg-3">別表第三の二</span>
        </>
      ),
      goods: "All 16の項 goods",
      wmd: true,
      conv: true,
      inform: true,
      basis: <CiteButton onClick={cite(`${ORDER}:4`, "輸出令 第4条")}>第4条第1項第3号・第4号</CiteButton>,
    },
    {
      dest: (
        <>
          All other destinations <span className="text-fg-3">一般国</span>
        </>
      ),
      goods: (
        <>
          16の項（1）<span className="block text-[12.5px] text-fg-3">HS-designated sensitive goods</span>
        </>
      ),
      wmd: true,
      conv: true,
      inform: true,
      basis: <CiteButton onClick={cite(`${ORDER}:4`, "輸出令 第4条")}>第4条第1項第3号</CiteButton>,
    },
    {
      dest: <span className="text-fg-3">All other destinations</span>,
      goods: (
        <>
          16の項（2）<span className="block text-[12.5px] text-fg-3">Other goods in the listed HS chapters</span>
        </>
      ),
      wmd: true,
      conv: false,
      inform: true,
      basis: <CiteButton onClick={cite(`${ORDER}:4`, "輸出令 第4条")}>第4条第1項第4号</CiteButton>,
    },
  ];

  return (
    <div className="space-y-12">
      <Section title="Check an HS code" description="Which part of 16の項 the code falls under, and whether it is on the US Russia and Belarus HTS lists.">
        <Card>
          <div className="px-4 py-4">
            <form onSubmit={submit} className="flex gap-2">
              <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="e.g. 8542.31" inputMode="numeric" className="w-56 font-mono" aria-label="HS code" />
              <Button type="submit" variant="primary" disabled={!input.trim()} loading={hs.isFetching}>
                Check
              </Button>
            </form>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-fg-3">
              Try
              {EXAMPLES.map((x) => (
                <button
                  key={x.code}
                  type="button"
                  onClick={() => {
                    setInput(x.code);
                    setCode(x.code);
                  }}
                  className="text-accent-text hover:underline"
                >
                  <span className="font-mono text-[12.5px]">{x.code}</span> {x.label}
                </button>
              ))}
            </div>
          </div>

          {digits && (
            <div className="grid border-t border-line lg:grid-cols-2">
              <div className="px-4 py-4">
                <div className="text-[13px] font-semibold text-fg-2">Japan — 16の項</div>
                {hs.isError ? (
                  <p className="mt-2 text-[13.5px] text-red-text">{(hs.error as Error).message}</p>
                ) : !res || !scope ? (
                  <div className="mt-3 space-y-2">
                    <Skeleton className="h-6 w-48" />
                    <Skeleton className="h-4" />
                  </div>
                ) : (
                  <div className="mt-2 animate-in">
                    <div className="flex items-center gap-2">
                      <ToneDot tone={scope.tone} className="size-2.5" />
                      <span className="text-[17px] font-semibold tracking-tight">{scope.title}</span>
                      <span className="font-mono text-[13px] text-fg-3">{fmtHs(res.code)}</span>
                    </div>
                    <div className="mt-0.5 text-[13px] text-fg-3">{scope.sub}</div>
                    {scope.text && <p className="mt-2 text-[13.5px] leading-relaxed text-fg-2">{scope.text}</p>}
                    {(res.jpCatchAll === "16-1" || res.jpCatchAll === "16-2") && (
                      <div className="k-list mt-3 border-y border-line text-[13px] [--inset:0px]">
                        {[
                          { d: "Group A 別表第三", r: "METI notification only" },
                          { d: "UN arms embargo 別表第三の二", r: "WMD + conventional use / end user · notification" },
                          { d: "Other destinations", r: res.jpCatchAll === "16-1" ? "WMD + conventional use / end user · notification" : "WMD use / end user · notification" },
                        ].map((x) => (
                          <div key={x.d} className="flex gap-3 py-2">
                            <span className="w-[210px] shrink-0 text-fg-2">{x.d}</span>
                            <span>{x.r}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="border-line px-4 py-4 max-lg:border-t lg:border-l">
                <div className="text-[13px] font-semibold text-fg-2">United States — HTS lists in Part 746</div>
                <div className="k-list mt-2 [--inset:20px]">
                  {RU_SUPPS.map((s) => {
                    const on = res?.russia[s.key];
                    return (
                      <div key={s.key} className="flex items-center gap-3 py-2">
                        <ToneDot tone={!res ? "neutral" : on ? "orange" : "neutral"} className={cx(!on && "opacity-50")} />
                        <div className="min-w-0 flex-1">
                          <CiteButton onClick={cite(s.id, `15 CFR ${s.id.replace("Supp.", "Supp. No.")}`)}>{s.label} to Part 746</CiteButton>
                          <div className="truncate text-[12.5px] text-fg-3">{s.text}</div>
                        </div>
                        <span className={cx("text-[13px]", on ? "font-medium" : "text-fg-3")}>{!res ? "" : on ? "Listed" : "Not listed"}</span>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-2 text-[12.5px] leading-relaxed text-fg-3">Matched on six-digit HTS prefixes. A listed code needs an EAR license to Russia and Belarus, whatever its ECCN.</p>
              </div>
            </div>
          )}
        </Card>
      </Section>

      <Section title="What the catch-all requires" description="Who must check use and end user, and when METI notification applies — 輸出令 第1条第3項 and 第4条.">
        <Card className="overflow-hidden">
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[820px] text-[13.5px]">
              <thead>
                <tr className="border-b border-line text-left text-[12.5px] text-fg-3">
                  <th className="px-4 py-2.5 font-medium">Destination</th>
                  <th className="px-4 py-2.5 font-medium">Goods</th>
                  <th className="px-4 py-2.5 font-medium">WMD use / end user</th>
                  <th className="px-4 py-2.5 font-medium">Conventional use / end user</th>
                  <th className="px-4 py-2.5 font-medium">METI notification</th>
                  <th className="px-4 py-2.5 font-medium">Basis</th>
                </tr>
              </thead>
              <tbody>
                {matrix.map((m, i) => (
                  <tr key={i} className={cx(i > 0 && "border-t border-line")}>
                    <td className="px-4 py-3 align-top">{m.dest}</td>
                    <td className="px-4 py-3 align-top text-fg-2">{m.goods}</td>
                    <td className="px-4 py-3 align-top">
                      <Applies on={m.wmd} />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <Applies on={m.conv} />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <Applies on={m.inform} />
                    </td>
                    <td className="px-4 py-3 align-top">{m.basis}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-line">
            <Disclosure summary="What “use / end-user checks” and “notification” mean">
              Use / end-user requirements (客観要件): the exporter learns from the contract, documents or the importer that the goods will be used for, or the end user develops or developed, such
              weapons — unless use and terms make it clear they will not be (<CiteButton onClick={cite(WMD_ORD, "核兵器等おそれ省令")}>核兵器等おそれ省令</CiteButton>,{" "}
              <CiteButton onClick={cite(CONV_ORD, "通常兵器おそれ省令")}>通常兵器おそれ省令</CiteButton>). Notification (インフォーム要件) means METI has told the exporter to apply for a license.
            </Disclosure>
          </div>
        </Card>
      </Section>

      <Section title="Scope of 16の項" description="Derived from 輸出令 別表第一 16の項 and 貨物等省令 第十四条の二 at the last sync. Goods listed in 1–15の項 are excluded.">
        <Card className="k-list">
          {!derived ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-4" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:gap-4">
                <div className="w-44 shrink-0">
                  <div className="text-[14px] font-medium">16の項（1）</div>
                  <div className="text-[12.5px] text-fg-3">HS headings and subheadings</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[12.5px] leading-[1.9] text-fg">{derived.catchAll16_1.include.map(fmtHs).join("  ")}</div>
                  {derived.catchAll16_1.exclude.length > 0 && <div className="mt-1 text-[13px] text-fg-3">Excluding {derived.catchAll16_1.exclude.map(fmtHs).join(", ")}</div>}
                </div>
              </div>
              <div className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:gap-4">
                <div className="w-44 shrink-0">
                  <div className="text-[14px] font-medium">16の項（2）</div>
                  <div className="text-[12.5px] text-fg-3">HS chapters</div>
                </div>
                <div className="min-w-0 flex-1 font-mono text-[12.5px] leading-[1.9]">{chapterRuns(derived.catchAll16_2Chapters)}</div>
              </div>
            </>
          )}
        </Card>
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// (c) Destination lists

function CountryLists({ lists, loading }: { lists?: JpCountryLists; loading: boolean }) {
  const open = useRegSheet();
  if (loading || !lists)
    return (
      <div className="space-y-8">
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-24" />
          </div>
        ))}
      </div>
    );
  const cards: { key: keyof Pick<JpCountryLists, "groupA" | "unArmsEmbargo" | "concern" | "russiaDiversion">; ja: string; en: string; text: string }[] = [
    {
      key: "groupA",
      ja: "別表第三",
      en: "Group A",
      text: "The catch-all applies only when METI informs the exporter (輸出令 第1条第3項, 第4条第2項第3号).",
    },
    {
      key: "unArmsEmbargo",
      ja: "別表第三の二",
      en: "UN arms embargo destinations",
      text: "Conventional-weapons use / end-user checks extend to all 16の項 goods (輸出令 第4条第1項第4号).",
    },
    {
      key: "concern",
      ja: "別表第四",
      en: "Concern countries",
      text: "The small-value exception (少額特例) is not available (輸出令 第4条第1項第5号).",
    },
    {
      key: "russiaDiversion",
      ja: "別表第二の四",
      en: "Russia-diversion destinations",
      text: "Export approval for 別表第二の三 goods in transactions with persons designated by METI notice (輸出令 第2条第1項第1号の8).",
    },
  ];
  return (
    <div className="space-y-12">
      {cards.map((c) => (
        <Section
          key={c.key}
          title={
            <>
              {c.en} <span className="font-normal text-fg-2">{c.ja}</span> <span className="text-[14px] font-normal tabular text-fg-3">{lists[c.key].length}</span>
            </>
          }
          description={c.text}
          actions={<CiteButton onClick={() => open({ kind: "section", id: `${ORDER}:${c.ja}`, label: `輸出令 ${c.ja}` })}>輸出令 {c.ja}</CiteButton>}
        >
          <Card>
            <div className="grid grid-cols-2 gap-x-4 px-2 py-2 sm:grid-cols-3 lg:grid-cols-4">
              {lists[c.key].map((iso) => (
                <Link key={iso} to={`/regulations/countries/${iso}`} className="truncate rounded-lg px-2 py-1.5 text-[14px] transition-colors hover:bg-fill-2">
                  <CountryName iso2={iso} withCode={false} />
                </Link>
              ))}
            </div>
            {lists.raw[c.ja] && (
              <div className="border-t border-line">
                <Disclosure summary={`Text of ${c.ja}`}>
                  <span className="tracking-[0.02em]">{lists.raw[c.ja]}</span>
                </Disclosure>
              </div>
            )}
          </Card>
        </Section>
      ))}

      <Section
        title={
          <>
            Low small-value threshold <span className="font-normal text-fg-2">別表第三の三</span>
          </>
        }
        description="Goods whose small-value exception limit is ¥50,000 instead of ¥1,000,000 (輸出令 第4条第1項第5号)."
        actions={<CiteButton onClick={() => open({ kind: "section", id: `${ORDER}:別表第三の三`, label: "輸出令 別表第三の三" })}>輸出令 別表第三の三</CiteButton>}
      >
        <Card>
          <div className="px-4 py-3.5 text-[14px] leading-[1.8] tracking-[0.02em]">{lists.appendix3_3 || <span className="text-fg-3">Not available in the local data.</span>}</div>
        </Card>
      </Section>

      <p className="px-1 text-[12.5px] text-fg-3">
        Source: {lists.stamp.source}, as revised to {fmtDate(lists.stamp.asOf)}.{" "}
        <a href={lists.stamp.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 hover:text-fg">
          e-Gov <ExternalLink className="size-3" />
        </a>
      </p>
    </div>
  );
}
