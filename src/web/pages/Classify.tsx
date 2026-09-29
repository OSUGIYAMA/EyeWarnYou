import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, BookOpen, Check, CircleHelp, Loader2, Minus, Package, Search, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Page, useMeta } from "../components/AppShell.tsx";
import { useRegSheet } from "../components/RegSheet.tsx";
import { Badge, Button, Card, CardHeader, Empty, Field, Input, Mono, SectionLabel, Textarea, toast } from "../components/ui/index.tsx";
import { api, ApiError, streamPost, type CaseView, type Item } from "../lib/api.ts";
import { cx } from "../lib/format.ts";

interface Param {
  parameter: string;
  threshold: string;
  reference: string;
  productValue: string;
  status: "meets" | "does_not_meet" | "unknown";
}
interface Result {
  us: { eccn: string; paragraph: string; confidence: "high" | "medium" | "low"; rationale: string; parameters: Param[]; alternatives: { eccn: string; paragraph: string; why: string }[]; missingInformation: string[] };
  jp: { listStatus: "listed" | "not_listed" | "uncertain"; kou: string; ministerialReference: string; confidence: "high" | "medium" | "low"; rationale: string; parameters: Param[]; missingInformation: string[] };
  hsCodeSuggestion: string;
  caveats: string[];
}

export function ClassifyPage() {
  const [params] = useSearchParams();
  const caseId = params.get("case");
  const itemId = params.get("item");
  const nav = useNavigate();
  const meta = useMeta();
  const ai = meta.data?.settings.aiConfigured;
  const caseQ = useQuery({ queryKey: ["case", caseId], queryFn: () => api.get<CaseView>(`/cases/${caseId}`), enabled: !!caseId });
  const [form, setForm] = useState({ name: "", manufacturer: "", model: "", hsCode: "", description: "", specs: "" });
  const [steps, setSteps] = useState<{ step: string; message: string }[]>([]);
  const [candidates, setCandidates] = useState<{ id: string; heading: string }[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [checks, setChecks] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const item = caseQ.data?.case.items.find((i) => i.id === itemId);
  useEffect(() => {
    if (item) setForm({ name: item.name, manufacturer: item.manufacturer ?? "", model: item.model ?? "", hsCode: item.hsCode ?? "", description: item.description ?? "", specs: "" });
  }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const manual = useQuery({
    queryKey: ["ccl-search", `${form.name} ${form.description}`.trim()],
    queryFn: () => api.get<{ results: { id: string; heading: string }[] }>(`/ccl?q=${encodeURIComponent(`${form.name} ${form.description}`.trim())}`),
    enabled: !ai && `${form.name}${form.description}`.trim().length > 3,
  });

  const run = async () => {
    setRunning(true);
    setSteps([]);
    setCandidates([]);
    setResult(null);
    setChecks([]);
    setError(null);
    try {
      await streamPost("/ai/classify", form, (ev, data) => {
        const d = data as Record<string, unknown>;
        if (ev === "progress") setSteps((s) => [...s, d as { step: string; message: string }]);
        if (ev === "candidates") setCandidates((d.eccns as { id: string; heading: string }[]) ?? []);
        if (ev === "result") {
          setResult(d.result as Result);
          setChecks((d.checks as string[]) ?? []);
        }
        if (ev === "error") setError(String(d.message));
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  const apply = async () => {
    if (!result || !caseQ.data || !item) return;
    const c = structuredClone(caseQ.data.case);
    const it = c.items.find((i) => i.id === item.id)!;
    it.us.eccn = result.us.eccn.toUpperCase();
    it.us.paragraph = result.us.eccn.toUpperCase() === "EAR99" ? "" : result.us.paragraph;
    it.us.classification = "provisional";
    it.us.classificationBasis = `AI-assisted draft (${result.us.confidence} confidence) — verify. ${result.us.rationale}`;
    if (result.jp.listStatus !== "uncertain") {
      it.jp.listStatus = result.jp.listStatus;
      it.jp.kou = result.jp.kou;
      it.jp.classificationBasis = `AI-assisted draft (${result.jp.confidence}) — verify. ${result.jp.ministerialReference} ${result.jp.rationale}`;
    }
    if (!it.hsCode && result.hsCodeSuggestion) it.hsCode = result.hsCodeSuggestion;
    const { screenings: _s, review: _r, ...payload } = c;
    await api.put(`/cases/${c.id}`, payload);
    toast("Applied to the case as a provisional classification", { tone: "success" });
    nav(`/cases/${c.id}`);
  };

  const save = async () => {
    if (!result) return;
    const body: Partial<Item> = {
      name: form.name,
      manufacturer: form.manufacturer,
      model: form.model,
      hsCode: form.hsCode || result.hsCodeSuggestion,
      description: form.description,
      kind: "commodity",
      quantity: 1,
      currency: "USD",
      countryOfOrigin: "",
      us: { origin: "unknown", usContentEccns: [], fdp: {}, eccn: result.us.eccn.toUpperCase(), paragraph: result.us.paragraph, classification: "provisional", classificationBasis: result.us.rationale, controlOverrides: {} },
      jp: { listStatus: result.jp.listStatus === "uncertain" ? "unclassified" : result.jp.listStatus, kou: result.jp.kou, catchAllScope: "unknown", appendix2_3: "unknown", classificationBasis: result.jp.rationale },
      cn: { listStatus: "unclassified", cnCode: "", materials: [] },
    };
    await api.post("/products", body);
    toast("Saved to the product master", { tone: "success" });
  };

  const f = (k: keyof typeof form) => ({ value: form[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((s) => ({ ...s, [k]: e.target.value })) });

  return (
    <Page wide>
      <div className="mb-5">
        <h1 className="text-[22px] font-semibold tracking-tight">Classification assistant</h1>
        <p className="mt-1 max-w-3xl text-[13.5px] text-fg-2">
          Classifies an item against the Commerce Control List and Japan’s 輸出令別表第一 / 貨物等省令 at the same time. Candidate entries are retrieved from the current regulation text, and the model compares each control parameter with your specifications — citing the paragraph for every threshold. The result is a draft for a qualified reviewer.
        </p>
        {item && caseQ.data && (
          <div className="mt-3 inline-flex items-center gap-2 rounded-lg bg-accent-soft px-3 py-1.5 text-[12.5px] text-accent-text">
            Classifying item “{item.name}” from case <span className="font-mono">{caseQ.data.case.ref}</span>
          </div>
        )}
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-[420px_1fr]">
        <Card className="p-4 xl:sticky xl:top-6">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Product name" className="col-span-2">
              <Input {...f("name")} placeholder="e.g. 8-channel data acquisition module" />
            </Field>
            <Field label="Manufacturer">
              <Input {...f("manufacturer")} />
            </Field>
            <Field label="Model">
              <Input {...f("model")} />
            </Field>
            <Field label="HS code (if known)" className="col-span-2">
              <Input {...f("hsCode")} className="font-mono" />
            </Field>
            <Field label="Description" className="col-span-2">
              <Textarea rows={3} {...f("description")} placeholder="What it is and what it does" />
            </Field>
            <Field label="Technical specifications" className="col-span-2" hint="Datasheet values matter most: frequencies, speeds, resolution, temperature range, encryption, materials, tolerances.">
              <Textarea rows={8} {...f("specs")} className="font-mono text-[12.5px]" placeholder={"Sampling rate: 250 MS/s\nResolution: 14 bit\nOperating temperature: -40 to +85 °C\nEncryption: none"} />
            </Field>
          </div>
          <div className="mt-4 flex justify-end">
            {ai ? (
              <Button variant="primary" icon={<Sparkles className="size-3.5" />} loading={running} disabled={!form.name.trim()} onClick={run}>
                {running ? "Classifying…" : "Classify"}
              </Button>
            ) : (
              <span className="text-[12.5px] text-fg-3">
                AI classification needs an API key —{" "}
                <Link to="/settings" className="text-accent-text hover:underline">
                  Settings
                </Link>
                . Matching CCL entries are listed on the right.
              </span>
            )}
          </div>
        </Card>

        <div className="min-w-0 space-y-4">
          {!ai && <ManualResults results={manual.data?.results ?? []} loading={manual.isFetching} />}
          {ai && !running && !result && !error && (
            <Card>
              <Empty icon={<Sparkles className="size-5" />} title="Describe the item and run the assistant">
                The assistant follows the CCL Order of Review (600 series and 9x515 first), checks every threshold, and tells you exactly which facts it still needs.
              </Empty>
            </Card>
          )}
          {(running || steps.length > 0) && !result && (
            <Card className="p-4">
              <div className="space-y-2">
                {steps.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-[13px]">
                    {i === steps.length - 1 && running ? <Loader2 className="size-3.5 animate-spin text-accent" /> : <Check className="size-3.5 text-green" />}
                    <span className={cx(i === steps.length - 1 && running ? "text-fg" : "text-fg-3")}>{s.message}</span>
                  </div>
                ))}
              </div>
              {candidates.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3">
                  <span className="text-[12px] text-fg-3">Candidates:</span>
                  {candidates.map((c) => (
                    <span key={c.id} title={c.heading} className="rounded bg-panel-2 px-1.5 py-0.5 font-mono text-[11.5px] ring-1 ring-line">
                      {c.id}
                    </span>
                  ))}
                </div>
              )}
            </Card>
          )}
          {error && (
            <Card className="border-red/30 p-4 text-[13px] text-red-text">
              <AlertTriangle className="mr-1.5 inline size-4" />
              {error}
            </Card>
          )}
          {result && (
            <>
              {checks.length > 0 && (
                <div className="rounded-xl border border-amber/30 bg-amber-soft px-4 py-3 text-[13px]">
                  <div className="font-medium text-amber-text">Verification warnings</div>
                  <ul className="mt-1 list-disc pl-5 text-fg-2">
                    {checks.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
              <UsResult r={result} />
              <JpResult r={result} />
              {result.caveats.length > 0 && (
                <Card className="p-4">
                  <SectionLabel className="mb-1.5">Caveats</SectionLabel>
                  <ul className="list-disc space-y-0.5 pl-5 text-[13px] text-fg-2">
                    {result.caveats.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </Card>
              )}
              <div className="flex justify-end gap-2">
                <Button icon={<Package className="size-3.5" />} onClick={save}>
                  Save to product master
                </Button>
                {item && (
                  <Button variant="primary" icon={<ArrowRight className="size-3.5" />} onClick={apply}>
                    Apply to case item (provisional)
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </Page>
  );
}

function Confidence({ c }: { c: "high" | "medium" | "low" }) {
  return <Badge tone={c === "high" ? "green" : c === "medium" ? "amber" : "red"}>{c} confidence</Badge>;
}

function ParamTable({ params }: { params: Param[] }) {
  if (!params.length) return null;
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <table className="w-full text-[12.5px]">
        <thead className="bg-panel-2 text-left text-[11px] text-fg-3">
          <tr>
            <th className="px-3 py-1.5 font-medium">Parameter</th>
            <th className="px-3 py-1.5 font-medium">Control threshold</th>
            <th className="px-3 py-1.5 font-medium">This item</th>
            <th className="w-10 px-3 py-1.5" />
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {params.map((p, i) => (
            <tr key={i} className="align-top">
              <td className="px-3 py-1.5">
                <div className="font-medium">{p.parameter}</div>
                <div className="font-mono text-[11px] text-fg-3">{p.reference}</div>
              </td>
              <td className="px-3 py-1.5 text-fg-2">{p.threshold}</td>
              <td className="px-3 py-1.5 text-fg-2">{p.productValue || <span className="text-fg-3">not provided</span>}</td>
              <td className="px-3 py-1.5">
                {p.status === "meets" ? <Check className="size-4 text-orange" /> : p.status === "does_not_meet" ? <Minus className="size-4 text-green" /> : <CircleHelp className="size-4 text-fg-3" />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UsResult({ r }: { r: Result }) {
  const open = useRegSheet();
  const eccn = r.us.eccn.toUpperCase();
  return (
    <Card>
      <CardHeader title="United States — Commerce Control List" actions={<Confidence c={r.us.confidence} />} />
      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Mono className="rounded-lg bg-panel-2 px-2.5 py-1 text-[18px] font-semibold ring-1 ring-line">
            {eccn}
            {r.us.paragraph ? `.${r.us.paragraph}` : ""}
          </Mono>
          {eccn !== "EAR99" && (
            <Button size="sm" variant="ghost" icon={<BookOpen className="size-3.5" />} onClick={() => open({ kind: "eccn", id: eccn.slice(0, 5), paragraph: r.us.paragraph || undefined })}>
              Read the entry
            </Button>
          )}
        </div>
        <p className="text-[13.5px] leading-relaxed text-fg-2">{r.us.rationale}</p>
        <ParamTable params={r.us.parameters} />
        {r.us.alternatives.length > 0 && (
          <div>
            <SectionLabel className="mb-1">Rule out</SectionLabel>
            <ul className="space-y-1 text-[13px]">
              {r.us.alternatives.map((a, i) => (
                <li key={i} className="flex gap-2">
                  <button onClick={() => open({ kind: "eccn", id: a.eccn.slice(0, 5), paragraph: a.paragraph || undefined })} className="shrink-0 font-mono text-[12.5px] font-medium hover:underline">
                    {a.eccn}
                    {a.paragraph ? `.${a.paragraph}` : ""}
                  </button>
                  <span className="text-fg-2">{a.why}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <Missing items={r.us.missingInformation} />
      </div>
    </Card>
  );
}

function JpResult({ r }: { r: Result }) {
  return (
    <Card>
      <CardHeader title="Japan — 輸出令別表第一 / 貨物等省令" actions={<Confidence c={r.jp.confidence} />} />
      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-lg bg-panel-2 px-2.5 py-1 text-[16px] font-semibold ring-1 ring-line">{r.jp.listStatus === "listed" ? `該当 — ${r.jp.kou}` : r.jp.listStatus === "not_listed" ? "非該当 (not listed)" : "Uncertain"}</span>
          {r.jp.ministerialReference && <span className="text-[13px] text-fg-2">貨物等省令 {r.jp.ministerialReference.replace(/^貨物等省令\s*/, "")}</span>}
        </div>
        <p className="text-[13.5px] leading-relaxed text-fg-2">{r.jp.rationale}</p>
        <ParamTable params={r.jp.parameters} />
        <Missing items={r.jp.missingInformation} />
        {r.hsCodeSuggestion && <div className="text-[12.5px] text-fg-3">Suggested HS code: <span className="font-mono text-fg-2">{r.hsCodeSuggestion}</span> — confirm with your customs broker.</div>}
      </div>
    </Card>
  );
}

function Missing({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="rounded-lg bg-panel-2/60 px-3 py-2 ring-1 ring-line">
      <SectionLabel className="mb-1">To confirm</SectionLabel>
      <ul className="space-y-0.5 text-[13px]">
        {items.map((m, i) => (
          <li key={i} className="flex gap-2">
            <X className="mt-1 size-3 shrink-0 text-fg-3" />
            {m}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ManualResults({ results, loading }: { results: { id: string; heading: string }[]; loading: boolean }) {
  const open = useRegSheet();
  return (
    <Card>
      <CardHeader title="Matching CCL entries" subtitle="Full-text search over the current Commerce Control List" icon={<Search className="size-4" />} actions={loading ? <Loader2 className="size-4 animate-spin text-fg-3" /> : null} />
      {results.length === 0 ? (
        <div className="px-4 py-8 text-center text-[13px] text-fg-3">Type a product name or description to search.</div>
      ) : (
        <div className="divide-y divide-line">
          {results.slice(0, 15).map((r) => (
            <button key={r.id} onClick={() => open({ kind: "eccn", id: r.id })} className="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-panel-2/50">
              <span className="w-14 shrink-0 font-mono text-[12.5px] font-medium">{r.id}</span>
              <span className="text-[13px] text-fg-2">{r.heading}</span>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}
