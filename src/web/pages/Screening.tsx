import { useQuery } from "@tanstack/react-query";
import { Download, Languages, ScanSearch, ShieldCheck, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Page, useMeta } from "../components/AppShell.tsx";
import { CountryName, CountryPicker } from "../components/CountryPicker.tsx";
import { EntrySheet } from "../components/EntrySheet.tsx";
import { ScoreBar } from "../components/case/PartiesCard.tsx";
import { Badge, Button, Card, CardHeader, Empty, Field, Input, Segmented, Skeleton, TabPanel, Tabs, Textarea, toast } from "../components/ui/index.tsx";
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
      <div className="mb-5">
        <h1 className="text-[22px] font-semibold tracking-tight">Restricted-party screening</h1>
        <p className="mt-1 max-w-3xl text-[13.5px] text-fg-2">
          Screens against the US Consolidated Screening List (BIS Entity List, MEU, UVL, Denied Persons; OFAC SDN and non-SDN lists; State Department lists), METI’s End User List, and China’s MOFCOM designations (Export Control Control List, Watch List, Unreliable Entity List, countermeasures). Matching normalizes legal forms and transliteration, weights distinctive words over generic ones, and tolerates small spelling differences.
        </p>
      </div>
      <Tabs
        value={tab}
        onValueChange={setTab}
        tabs={[
          { value: "search", label: "Search" },
          { value: "batch", label: "Batch" },
          { value: "history", label: "History" },
        ]}
      >
        <TabPanel value="search" className="pt-5">
          <SearchTab initial={params.get("q") ?? ""} initialCountry={params.get("country") ?? ""} onQuery={(q) => setParams(q ? { q } : {})} />
        </TabPanel>
        <TabPanel value="batch" className="pt-5">
          <BatchTab />
        </TabPanel>
        <TabPanel value="history" className="pt-5">
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
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="min-w-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void screen();
          }}
          className="rounded-xl border border-line bg-panel p-4 shadow-card"
        >
          <div className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
            <div className="relative">
              <ScanSearch className="absolute left-3 top-2.5 size-4 text-fg-3" />
              <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Company, organization or person" className="h-9 pl-9 text-[14px]" />
            </div>
            <CountryPicker value={country} onChange={setCountry} placeholder="Country (optional)" />
            <Button variant="primary" size="lg" type="submit" loading={loading} className="h-9">
              Screen
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
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
            <label className="flex items-center gap-2 text-[12.5px] text-fg-3">
              Minimum score
              <input type="range" min={70} max={100} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="accent-[var(--accent)]" />
              <span className="w-6 font-mono tabular text-fg-2">{threshold}</span>
            </label>
            {cjk && meta.data?.settings.aiConfigured && (
              <Button size="sm" variant="ghost" type="button" icon={<Languages className="size-3.5" />} onClick={romanize}>
                Suggest English names
              </Button>
            )}
          </div>
          {romanized && (
            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3">
              <span className="text-[12px] text-fg-3">Candidates (verify):</span>
              {romanized.map((r) => (
                <button key={r.name} type="button" onClick={() => (setName(r.name), void screen(r.name))} className="rounded-md bg-panel-2 px-2 py-0.5 text-[12.5px] ring-1 ring-line hover:ring-line-strong" title={r.basis}>
                  {r.name}
                </button>
              ))}
            </div>
          )}
        </form>

        <div className="mt-5">
          {loading && !result ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}</div>
          ) : !result ? (
            <Empty icon={<ScanSearch className="size-5" />} title="Screen a name">
              Results show the matched name (primary or alias), the list and agency, countries, and a match score from 0–100.
            </Empty>
          ) : result.matches.length === 0 ? (
            <Card className="flex items-center gap-3 px-5 py-4">
              <ShieldCheck className="size-5 text-green" />
              <div className="text-[13.5px]">
                <div className="font-medium">No potential matches for “{result.query}” at score ≥ {result.threshold}</div>
                <div className="text-[12.5px] text-fg-3">Checked {result.stamps.map((s) => `${s.source} (as of ${s.asOf})`).join("; ")}. The search is recorded in the screening history.</div>
              </div>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="border-b border-line px-4 py-2.5 text-[12.5px] text-fg-3">
                {result.matches.length} potential match{result.matches.length > 1 ? "es" : ""} for <span className="font-medium text-fg">“{result.query}”</span>
              </div>
              <div className="divide-y divide-line">
                {result.matches.map((m) => {
                  const list = LIST_NAMES[m.entry.list];
                  return (
                    <button key={m.entry.id} onClick={() => setEntry(m.entry.id)} className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-panel-2/50">
                      <ScoreBar score={m.score} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13.5px] font-medium">{m.matchedName}</div>
                        {m.matchedName !== m.entry.name && <div className="truncate text-[12px] text-fg-3">alias of {m.entry.name}</div>}
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <Badge tone={list?.tone ?? "gray"}>
                            {list?.agency} · {list?.name ?? m.entry.list}
                          </Badge>
                          {m.entry.countries.slice(0, 3).map((c) => (
                            <span key={c} className="text-[12px] text-fg-3">
                              <CountryName iso2={c} withCode={false} />
                            </span>
                          ))}
                          {m.countryMatch === "mismatch" && <span className="text-[11.5px] text-fg-3">· different country</span>}
                        </div>
                      </div>
                      {m.entry.licenseRequirement && <div className="hidden max-w-[240px] text-right text-[11.5px] leading-snug text-fg-3 xl:block">{m.entry.licenseRequirement}</div>}
                    </button>
                  );
                })}
              </div>
            </Card>
          )}
        </div>
      </div>
      <aside className="space-y-4">
        <Card>
          <CardHeader title="Lists covered" />
          <div className="divide-y divide-line text-[12.5px]">
            {meta.data?.stamps.screening.map((s) => (
              <div key={s.source} className="px-4 py-2.5">
                <div className="font-medium">{s.source}</div>
                <div className="text-fg-3">
                  As of {fmtDate(s.asOf)} · downloaded {relTime(s.fetchedAt)}
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-4 text-[12.5px] leading-relaxed text-fg-2">
          <div className="mb-1 font-medium text-fg">Reading scores</div>
          95+ is a near-exact name match. 85–95 usually differs by legal form, word order or a transliteration. Below 85, generic words are doing most of the work — confirm with addresses and identifiers before treating it as a match. Ownership (the 50% rules) is not visible in these lists.
        </Card>
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
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <Card className="h-fit p-4">
        <Field label="One party per line — optionally followed by a comma and a two-letter country code" hint={`${parsed.length} rows`}>
          <Textarea rows={14} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Huawei Technologies Co., Ltd., CN\nAcme Precision GmbH, DE\nShenzhen Example Trading"} className="font-mono text-[12.5px]" />
        </Field>
        <div className="mt-3 flex justify-between gap-2">
          <Button variant="ghost" icon={<Upload className="size-3.5" />} onClick={() => file.current?.click()}>
            Load CSV
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
          subtitle={rows ? `${rows.filter((r) => r.hits.length).length} of ${rows.length} with potential matches` : "Run a batch to see results"}
          actions={rows && <Button size="sm" icon={<Download className="size-3.5" />} onClick={download}>CSV</Button>}
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
                      <span className="text-[12px] text-green-text">Clear</span>
                    ) : (
                      <div className="space-y-1">
                        {r.hits.slice(0, 3).map((h) => (
                          <button key={h.id} onClick={() => setEntry(h.id)} className="flex items-center gap-2 text-left text-[12.5px] hover:underline">
                            <span className="w-8 font-mono tabular">{Math.round(h.score)}</span>
                            <Badge tone={LIST_NAMES[h.list]?.tone ?? "gray"}>{h.list}</Badge>
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
  if (!q.data.length) return <Empty title="No screenings yet">Every search is recorded here with its time, user and result count.</Empty>;
  return (
    <Card className="overflow-hidden">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-line bg-panel-2/60 text-left text-[11.5px] text-fg-3">
            <th className="px-4 py-2 font-medium">When</th>
            <th className="px-4 py-2 font-medium">Query</th>
            <th className="px-4 py-2 font-medium">Country</th>
            <th className="px-4 py-2 font-medium">By</th>
            <th className="px-4 py-2 text-right font-medium">Potential matches</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {q.data.map((h) => (
            <tr key={h.id}>
              <td className="px-4 py-2 text-fg-3">{new Date(h.at).toLocaleString("en-GB")}</td>
              <td className="px-4 py-2 font-medium">{h.query}</td>
              <td className="px-4 py-2 font-mono text-[12px]">{h.country ?? ""}</td>
              <td className="px-4 py-2 text-fg-2">{h.actor ?? "—"}</td>
              <td className="px-4 py-2 text-right tabular">{h.hit_count ? <span className="text-amber-text">{h.hit_count} (top {Math.round(h.top_score ?? 0)})</span> : <span className="text-green-text">0</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
