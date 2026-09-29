import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Download, Languages, Search, ShieldCheck, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Page, useMeta } from "../components/AppShell.tsx";
import { CountryPicker, useCountries } from "../components/CountryPicker.tsx";
import { EntrySheet } from "../components/EntrySheet.tsx";
import { ScoreBar } from "../components/case/PartiesCard.tsx";
import { Badge, Button, Card, CardHeader, Empty, Field, PageHeader, Section, Segmented, Skeleton, TabPanel, Tabs, Textarea, toast } from "../components/ui/index.tsx";
import { api, ApiError, type ScreeningMatch, type SourceStamp } from "../lib/api.ts";
import { cx, fmtDate, LIST_NAMES, relTime } from "../lib/format.ts";

const LIST_FILTERS: Record<string, string[] | undefined> = {
  all: undefined,
  bis: ["EL", "MEU", "UVL", "DPL"],
  ofac: ["SDN", "SSI", "CMIC", "NS-MBS", "PLC", "CAP"],
  state: ["ISN", "DTC"],
  meti: ["METI-EUL"],
  china: ["CN-ECL", "CN-WL", "CN-UEL", "CN-AFSL"],
};

export function ScreeningPage() {
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState("search");
  return (
    <Page wide>
      <PageHeader title="Screening" description="Is this company or person on a restricted list? One search covers the US, Japanese and Chinese lists." />
      <Tabs
        value={tab}
        onValueChange={setTab}
        tabs={[
          { value: "search", label: "One name" },
          { value: "batch", label: "A list of names" },
          { value: "history", label: "History" },
        ]}
      >
        <TabPanel value="search" className="pt-6">
          <SearchTab initial={params.get("q") ?? ""} initialCountry={params.get("country") ?? ""} onQuery={(q) => setParams(q ? { q } : {})} />
        </TabPanel>
        <TabPanel value="batch" className="pt-6">
          <BatchTab />
        </TabPanel>
        <TabPanel value="history" className="pt-6">
          <HistoryTab />
        </TabPanel>
      </Tabs>
    </Page>
  );
}

function SearchTab({ initial, initialCountry, onQuery }: { initial: string; initialCountry: string; onQuery: (q: string) => void }) {
  const meta = useMeta();
  const [name, setName] = useState(initial);
  const [country, setCountry] = useState(initialCountry);
  const [lists, setLists] = useState("all");
  const [threshold, setThreshold] = useState(80);
  const [result, setResult] = useState<{ query: string; threshold: number; matches: ScreeningMatch[]; stamps: SourceStamp[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [entry, setEntry] = useState<string | null>(null);
  const [romanized, setRomanized] = useState<{ name: string; basis: string }[] | null>(null);
  const cjk = /[぀-ヿ㐀-鿿가-힯]/.test(name);
  const countries = useCountries();
  const countryLabel = (iso: string) => countries.data?.find((c) => c.iso2 === iso)?.en ?? iso;

  const screen = async (q = name) => {
    if (!q.trim()) return;
    setLoading(true);
    try {
      const r = await api.post<{ threshold: number; matches: ScreeningMatch[]; stamps: SourceStamp[] }>("/screen", { name: q, country: country || undefined, lists: LIST_FILTERS[lists], threshold });
      setResult({ query: q, ...r });
      onQuery(q);
    } catch (e) {
      toast("Screening failed", { detail: (e as Error).message, tone: "error" });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (initial) void screen(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const romanize = async () => {
    try {
      const r = await api.post<{ candidates: { name: string; basis: string }[] }>("/ai/romanize", { name, country: country || undefined });
      setRomanized(r.candidates);
    } catch (e) {
      toast("Could not romanize", { detail: e instanceof ApiError ? e.message : String(e), tone: "error" });
    }
  };

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void screen();
          }}
        >
          <div className="flex items-center gap-2 rounded-2xl bg-fill-2 p-2 transition-shadow focus-within:ring-4 focus-within:ring-accent/15">
            <Search className="ml-2 size-5 shrink-0 text-fg-3" />
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Company, organisation or person"
              className="h-11 min-w-0 flex-1 bg-transparent text-[17px] tracking-tight outline-none placeholder:text-fg-3"
            />
            <div className="w-[210px] shrink-0">
              <CountryPicker value={country} onChange={setCountry} placeholder="Any country" />
            </div>
            <Button variant="primary" type="submit" loading={loading} className="h-10 px-5">
              Screen
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 px-1">
            <Segmented
              value={lists}
              onChange={setLists}
              options={[
                { value: "all", label: "All lists" },
                { value: "bis", label: "BIS" },
                { value: "ofac", label: "OFAC" },
                { value: "state", label: "State" },
                { value: "meti", label: "METI" },
                { value: "china", label: "China" },
              ]}
            />
            <label className="flex items-center gap-2.5 text-[13px] text-fg-2">
              Show matches scoring at least
              <input type="range" min={70} max={100} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="w-28 accent-[var(--accent)]" />
              <span className="w-6 font-medium tabular text-fg">{threshold}</span>
            </label>
            {cjk && meta.data?.settings.aiConfigured && (
              <Button size="sm" variant="ghost" type="button" icon={<Languages className="size-3.5" />} onClick={romanize}>
                Suggest English names
              </Button>
            )}
          </div>
          {romanized && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5 px-1">
              <span className="text-[12.5px] text-fg-3">Try (verify each):</span>
              {romanized.map((r) => (
                <button key={r.name} type="button" onClick={() => (setName(r.name), void screen(r.name))} className="h-7 rounded-full bg-fill px-3 text-[13px] hover:bg-panel-3" title={r.basis}>
                  {r.name}
                </button>
              ))}
            </div>
          )}
        </form>

        <div className="mt-8">
          {loading && !result ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
          ) : !result ? (
            <div className="px-1">
              <div className="text-[15px] font-semibold">Legal forms, word order, transliteration and small typos are handled for you.</div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-[13px] text-fg-3">Try</span>
                {["Hikvision", "Semiconductor Manufacturing International", "Beihang University"].map((x) => (
                  <button key={x} type="button" onClick={() => (setName(x), void screen(x))} className="h-8 rounded-full bg-fill-2 px-3.5 text-[13.5px] hover:bg-fill">
                    {x}
                  </button>
                ))}
              </div>
            </div>
          ) : result.matches.length === 0 ? (
            <Card className="flex flex-col items-center px-6 py-12 text-center">
              <ShieldCheck className="size-10 stroke-[1.5] text-green" />
              <div className="mt-3 text-[19px] font-semibold tracking-tight">No matches for “{result.query}”</div>
              <p className="mt-1 max-w-lg text-[13.5px] leading-relaxed text-fg-2">
                Nothing scored {result.threshold} or higher on {result.stamps.map((s) => `${s.source} (${fmtDate(s.asOf)})`).join(", ")}. This search is recorded in the history.
              </p>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="border-b border-line px-5 py-3 text-[13.5px] text-fg-2">
                <span className="font-semibold text-fg">
                  {result.matches.length} possible match{result.matches.length > 1 ? "es" : ""}
                </span>{" "}
                for “{result.query}” — open one to compare addresses and identifiers.
              </div>
              <div className="k-list" style={{ ["--inset" as string]: "72px" }}>
                {result.matches.map((m) => {
                  const list = LIST_NAMES[m.entry.list];
                  return (
                    <button key={m.entry.id} onClick={() => setEntry(m.entry.id)} className="flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-fill-2">
                      <ScoreBar score={m.score} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] font-medium">{m.matchedName}</div>
                        <div className="mt-0.5 truncate text-[13px] text-fg-2">
                          <span className={cx(list?.tone === "red" && "text-red-text")}>
                            {list?.agency} {list?.name ?? m.entry.list}
                          </span>
                          {m.entry.countries.length > 0 && <span className="text-fg-3"> · {m.entry.countries.slice(0, 3).map((c) => countryLabel(c)).join(", ")}</span>}
                          {m.countryMatch === "mismatch" && <span className="text-fg-3"> · different country</span>}
                          {m.matchedName !== m.entry.name && <span className="text-fg-3"> · alias of {m.entry.name}</span>}
                        </div>
                      </div>
                      {m.entry.licenseRequirement && <div className="hidden max-w-[260px] text-right text-[12px] leading-snug text-fg-3 xl:block">{m.entry.licenseRequirement}</div>}
                      <ChevronRight className="size-4 shrink-0 text-fg-3" />
                    </button>
                  );
                })}
              </div>
            </Card>
          )}
        </div>
      </div>
      <aside className="space-y-8">
        <Section title="Lists searched">
          <Card className="k-list">
            {meta.data?.stamps.screening.map((s) => (
              <div key={s.source} className="px-4 py-3">
                <div className="text-[13.5px] font-medium leading-snug">{s.source}</div>
                <div className="mt-0.5 text-[12.5px] text-fg-3">
                  As of {fmtDate(s.asOf)} · updated {relTime(s.fetchedAt)}
                </div>
              </div>
            ))}
          </Card>
        </Section>
        <Section title="Reading scores">
          <Card className="k-list text-[13px]">
            {[
              ["95+", "Near-exact name match."],
              ["85–95", "Differs by legal form, word order or transliteration."],
              ["Below 85", "Generic words are doing the work. Check addresses and identifiers first."],
            ].map(([k, v]) => (
              <div key={k} className="flex gap-3 px-4 py-2.5">
                <span className="w-16 shrink-0 font-semibold tabular">{k}</span>
                <span className="text-fg-2">{v}</span>
              </div>
            ))}
            <div className="px-4 py-2.5 text-[12.5px] text-fg-3">Ownership (the 50% rules) is not visible in these lists.</div>
          </Card>
        </Section>
      </aside>
      <EntrySheet id={entry} onClose={() => setEntry(null)} />
    </div>
  );
}

interface BatchRow {
  name: string;
  country?: string;
  hits: { id: string; list: string; name: string; score: number; countries: string[] }[];
}

function BatchTab() {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<BatchRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [entry, setEntry] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const parsed = useMemo(
    () =>
      text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
          const parts = l.split(/\t|,(?=[^,]*$)/);
          const last = parts.at(-1)?.trim() ?? "";
          return parts.length > 1 && /^[A-Za-z]{2}$/.test(last) ? { name: parts.slice(0, -1).join(",").trim(), country: last.toUpperCase() } : { name: l };
        }),
    [text],
  );
  const run = async () => {
    setLoading(true);
    try {
      const r = await api.post<{ results: BatchRow[] }>("/screen/batch", { rows: parsed });
      setRows(r.results);
    } catch (e) {
      toast("Batch screening failed", { detail: (e as Error).message, tone: "error" });
    } finally {
      setLoading(false);
    }
  };
  const download = () => {
    if (!rows) return;
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const csv = ["name,country,top_score,list,matched_name,entry_id", ...rows.map((r) => [r.name, r.country ?? "", r.hits[0]?.score ?? "", r.hits[0]?.list ?? "", r.hits[0]?.name ?? "", r.hits[0]?.id ?? ""].map((x) => esc(String(x))).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `screening-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="grid gap-8 lg:grid-cols-[380px_1fr]">
      <Card className="h-fit p-5">
        <Field label="One name per line, optionally followed by a comma and a country code" hint={`${parsed.length} name${parsed.length === 1 ? "" : "s"}`}>
          <Textarea rows={14} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Huawei Technologies Co., Ltd., CN\nAcme Precision GmbH, DE\nShenzhen Example Trading"} className="font-mono text-[12.5px]" />
        </Field>
        <div className="mt-3 flex justify-between gap-2">
          <Button icon={<Upload className="size-3.5" />} onClick={() => file.current?.click()}>
            Open CSV
          </Button>
          <input
            ref={file}
            type="file"
            accept=".csv,.txt,.tsv"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setText(await f.text());
            }}
          />
          <Button variant="primary" loading={loading} disabled={!parsed.length} onClick={run}>
            Screen {parsed.length || ""} parties
          </Button>
        </div>
      </Card>
      <Card className="overflow-hidden">
        <CardHeader
          title="Results"
          subtitle={rows ? `${rows.filter((r) => r.hits.length).length} of ${rows.length} have possible matches` : "Paste names on the left and screen them together."}
          actions={rows && <Button size="sm" icon={<Download className="size-3.5" />} onClick={download}>Export CSV</Button>}
        />
        {rows && (
          <table className="w-full text-[13px]">
            <tbody className="divide-y divide-line">
              {[...rows].sort((a, b) => (b.hits[0]?.score ?? 0) - (a.hits[0]?.score ?? 0)).map((r, i) => (
                <tr key={i} className={cx(!r.hits.length && "text-fg-3")}>
                  <td className="px-4 py-2 font-medium">{r.name}</td>
                  <td className="px-2 py-2 font-mono text-[12px]">{r.country}</td>
                  <td className="px-4 py-2">
                    {r.hits.length === 0 ? (
                      <span className="inline-flex items-center gap-1.5 text-[13px] text-fg-2"><ShieldCheck className="size-4 text-green" /> No matches</span>
                    ) : (
                      <div className="space-y-1">
                        {r.hits.slice(0, 3).map((h) => (
                          <button key={h.id} onClick={() => setEntry(h.id)} className="flex items-center gap-2 text-left text-[12.5px] hover:underline">
                            <span className="w-7 font-semibold tabular">{Math.round(h.score)}</span>
                            <Badge tone={LIST_NAMES[h.list]?.tone === "red" ? "red" : "gray"}>{h.list}</Badge>
                            <span className="truncate">{h.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <EntrySheet id={entry} onClose={() => setEntry(null)} />
    </div>
  );
}

function HistoryTab() {
  const q = useQuery({ queryKey: ["screen-history"], queryFn: () => api.get<{ id: number; at: string; actor: string | null; query: string; country: string | null; hit_count: number; top_score: number | null }[]>("/screen/history") });
  if (!q.data) return <Skeleton className="h-40" />;
  if (!q.data.length) return <Card><Empty title="No screenings yet">Every search is recorded here with its time, who ran it and what it found.</Empty></Card>;
  return (
    <Card className="overflow-hidden">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-line text-left text-[12px] text-fg-3">
            <th className="px-4 py-2 font-medium">When</th>
            <th className="px-4 py-2 font-medium">Query</th>
            <th className="px-4 py-2 font-medium">Country</th>
            <th className="px-4 py-2 font-medium">By</th>
            <th className="px-4 py-2 text-right font-medium">Possible matches</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {q.data.map((h) => (
            <tr key={h.id}>
              <td className="px-4 py-2.5 text-fg-3">{new Date(h.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
              <td className="px-4 py-2 font-medium">{h.query}</td>
              <td className="px-4 py-2 font-mono text-[12px]">{h.country ?? ""}</td>
              <td className="px-4 py-2 text-fg-2">{h.actor ?? "—"}</td>
              <td className="px-4 py-2.5 text-right tabular">{h.hit_count ? <span className="font-medium text-orange-text">{h.hit_count} · top {Math.round(h.top_score ?? 0)}</span> : <span className="text-fg-3">None</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
