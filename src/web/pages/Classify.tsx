import { useQuery } from "@tanstack/react-query";
import { Check, ChevronRight, Loader2, Tag } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Page, useMeta } from "../components/AppShell.tsx";
import { useRegSheet } from "../components/RegSheet.tsx";
import { Button, Card, Field, Input, PageHeader, Section, Segmented, Spinner, StatusDot, Textarea, toast } from "../components/ui/index.tsx";
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
  const [saving, setSaving] = useState<"product" | "case" | null>(null);
  const [saved, setSaved] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  const item = caseQ.data?.case.items.find((i) => i.id === itemId);
  useEffect(() => {
    if (item) setForm({ name: item.name, manufacturer: item.manufacturer ?? "", model: item.model ?? "", hsCode: item.hsCode ?? "", description: item.description ?? "", specs: "" });
  }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (result) resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [result]);

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
    setSaved(false);
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
    setSaving("case");
    try {
      await api.put(`/cases/${c.id}`, payload);
      toast("Applied to the case as a provisional classification", { tone: "success" });
      nav(`/cases/${c.id}`);
    } catch (e) {
      toast("Could not update the case", { detail: (e as Error).message, tone: "error" });
    } finally {
      setSaving(null);
    }
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
    setSaving("product");
    try {
      await api.post("/products", body);
      setSaved(true);
      toast("Saved to the product master", { tone: "success" });
    } catch (e) {
      toast("Could not save the product", { detail: (e as Error).message, tone: "error" });
    } finally {
      setSaving(null);
    }
  };

  const f = (k: keyof typeof form) => ({ value: form[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((s) => ({ ...s, [k]: e.target.value })) });
  const canRun = !!ai && !running && !!form.name.trim();
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canRun) {
      e.preventDefault();
      void run();
    }
  };
  const fromCase = item && caseQ.data;
  const noKey = !!meta.data && !ai;

  return (
    <Page>
      <div className="mx-auto max-w-[760px]">
        <PageHeader
          eyebrow={
            fromCase ? (
              <Link to={`/cases/${caseQ.data!.case.id}`} className="hover:text-fg-2">
                {caseQ.data!.case.ref} · {item.name}
              </Link>
            ) : undefined
          }
          title="Classify a product"
          description="Describe it as the datasheet does. EyeWarnYou drafts the ECCN and 項番 from the current regulation text, and you confirm them."
        />

        <Card onKeyDown={onKeyDown}>
          {noKey && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-line px-5 py-4">
              <Tag className="size-7 shrink-0 stroke-[1.5] text-fg-3" />
              <div className="min-w-0 flex-1 basis-[300px]">
                <div className="text-[15px] font-semibold tracking-tight">Let EyeWarnYou draft the classification</div>
                <p className="mt-0.5 text-[13.5px] leading-relaxed text-fg-2">
                  With an Anthropic API key, Claude compares the datasheet with each candidate CCL entry and 項番 and cites the paragraph for every threshold. Without one, search the Control List below.
                </p>
              </div>
              <Link to="/settings#ai">
                <Button variant="primary">Add an API key</Button>
              </Link>
            </div>
          )}
          <div className="grid gap-4 p-5 sm:grid-cols-3">
            <Field label="Product name" htmlFor="cl-name" className="sm:col-span-3">
              <Input id="cl-name" {...f("name")} placeholder="e.g. 8-channel data acquisition module" className="h-10 text-[15px]" />
            </Field>
            {!noKey && (
              <>
                <Field label="Manufacturer" htmlFor="cl-mfr">
                  <Input id="cl-mfr" {...f("manufacturer")} />
                </Field>
                <Field label="Model" htmlFor="cl-model">
                  <Input id="cl-model" {...f("model")} />
                </Field>
                <Field label="HS code (optional)" htmlFor="cl-hs">
                  <Input id="cl-hs" {...f("hsCode")} className="font-mono" />
                </Field>
              </>
            )}
            <Field label="Description" htmlFor="cl-desc" className="sm:col-span-3">
              <Textarea id="cl-desc" rows={2} {...f("description")} placeholder="What it is and what it does" />
            </Field>
            {!noKey && (
              <Field label="Specifications" htmlFor="cl-specs" className="sm:col-span-3" hint="Datasheet values matter most: frequencies, speeds, resolution, temperature range, encryption, materials, tolerances.">
                <Textarea id="cl-specs" rows={7} {...f("specs")} className="font-mono text-[12.5px]" placeholder={"Sampling rate: 250 MS/s\nResolution: 14 bit\nOperating temperature: -40 to +85 °C\nEncryption: none"} />
              </Field>
            )}
          </div>
        </Card>

        {ai && (
          <div className="mt-4 flex items-center justify-between gap-4 px-1">
            <p className="text-[12.5px] text-fg-3">Takes about a minute. The result is a draft for a qualified reviewer.</p>
            <Button variant={result ? "secondary" : "primary"} size="lg" loading={running} disabled={!form.name.trim()} onClick={run}>
              {running ? "Classifying…" : result ? "Classify again" : "Classify"}
            </Button>
          </div>
        )}

        {noKey && <ManualResults className="mt-10" results={manual.data?.results ?? []} loading={manual.isFetching} typed={`${form.name}${form.description}`.trim().length > 3} />}

        {(running || steps.length > 0) && !result && !error && <Progress steps={steps} running={running} candidates={candidates} />}

        {error && (
          <Card className="mt-10 flex gap-3 px-5 py-4">
            <StatusDot status="block" />
            <div className="min-w-0 text-[14px]">
              <div className="font-medium">The classification did not finish</div>
              <div className="mt-0.5 text-[13px] text-fg-2">{error}</div>
            </div>
          </Card>
        )}

        {result && (
          <div ref={resultRef} className="mt-14 scroll-mt-8 space-y-10">
            <Section title="Proposed classification" description="A draft. Check the reasoning and verification below before you rely on it.">
              <Headline r={result} />
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                {fromCase ? (
                  <>
                    <Button onClick={save} loading={saving === "product"} disabled={saved} icon={saved ? <Check className="size-3.5" /> : undefined}>
                      {saved ? "Saved to product master" : "Save to product master"}
                    </Button>
                    <Button variant="primary" onClick={apply} loading={saving === "case"}>
                      Use in {caseQ.data!.case.ref}
                    </Button>
                  </>
                ) : (
                  <Button variant="primary" onClick={save} loading={saving === "product"} disabled={saved} icon={saved ? <Check className="size-3.5" /> : undefined}>
                    {saved ? "Saved to product master" : "Save to product master"}
                  </Button>
                )}
              </div>
            </Section>

            <Section title="Verification" description="The references in the draft, checked against EyeWarnYou’s copy of the regulations.">
              <Card className="k-list" style={{ ["--inset" as string]: "44px" }}>
                {checks.length === 0 ? (
                  <div className="flex gap-3 px-5 py-3 text-[14px]">
                    <StatusDot status="pass" />
                    <span>Every ECCN, paragraph and 項番 cited exists in the current text.</span>
                  </div>
                ) : (
                  checks.map((c) => (
                    <div key={c} className="flex gap-3 px-5 py-3 text-[14px]">
                      <StatusDot status="flag" />
                      <span>{c}</span>
                    </div>
                  ))
                )}
              </Card>
            </Section>

            <Reasoning r={result} candidates={candidates} />

            {result.caveats.length > 0 && (
              <Section title="Caveats">
                <Card className="k-list">
                  {result.caveats.map((c, i) => (
                    <div key={i} className="px-5 py-3 text-[14px] leading-relaxed text-fg-2">
                      {c}
                    </div>
                  ))}
                </Card>
              </Section>
            )}
          </div>
        )}
      </div>
    </Page>
  );
}

// ---------------------------------------------------------------------------

function Progress({ steps, running, candidates }: { steps: { step: string; message: string }[]; running: boolean; candidates: { id: string; heading: string }[] }) {
  return (
    <Card className="mt-10 k-list" style={{ ["--inset" as string]: "46px" }}>
      {steps.length === 0 && (
        <div className="flex items-center gap-3 px-5 py-3 text-[14px]">
          <Loader2 className="size-4 animate-spin text-fg-3" />
          Starting…
        </div>
      )}
      {steps.map((s, i) => {
        const current = i === steps.length - 1 && running;
        return (
          <div key={i} className="flex items-center gap-3 px-5 py-3 text-[14px]">
            {current ? <Loader2 className="size-4 shrink-0 animate-spin text-fg-3" /> : <Check className="size-4 shrink-0 text-green" strokeWidth={2.25} />}
            <span className={current ? "text-fg" : "text-fg-2"}>{s.message}</span>
          </div>
        );
      })}
      {candidates.length > 0 && (
        <div className="px-5 py-3 pl-[46px] text-[12.5px] leading-relaxed text-fg-3">
          Candidates: <span className="font-mono">{candidates.map((c) => c.id).join(" · ")}</span>
        </div>
      )}
    </Card>
  );
}

const CONFIDENCE = { high: "High confidence", medium: "Medium confidence", low: "Low confidence" } as const;

function Headline({ r }: { r: Result }) {
  const open = useRegSheet();
  const eccn = r.us.eccn.toUpperCase();
  const ear99 = eccn === "EAR99";
  const jpValue = r.jp.listStatus === "listed" ? r.jp.kou || "該当" : r.jp.listStatus === "not_listed" ? "非該当" : "Uncertain";
  const jpNote = r.jp.listStatus === "listed" ? "Listed (該当)" : r.jp.listStatus === "not_listed" ? "Not listed in 1–15の項" : "Needs a closer look";
  return (
    <Card>
      <div className="grid sm:grid-cols-2">
        <div className="px-6 py-5">
          <div className="text-[13px] text-fg-2">United States · ECCN</div>
          <div className="mt-1 text-[34px] font-semibold leading-tight tracking-[-0.02em]">
            {eccn}
            {!ear99 && r.us.paragraph ? <span className="text-fg-2">.{r.us.paragraph}</span> : null}
          </div>
          <div className="mt-1.5 text-[13px] text-fg-2">{ear99 ? "Not on the Commerce Control List" : "Commerce Control List"}</div>
          <div className="mt-3 flex items-center gap-3 text-[13px]">
            <span className="text-fg-3">{CONFIDENCE[r.us.confidence]}</span>
            {!ear99 && (
              <button onClick={() => open({ kind: "eccn", id: eccn.slice(0, 5), paragraph: r.us.paragraph || undefined })} className="font-medium text-accent-text hover:underline">
                Read {eccn.slice(0, 5)}
              </button>
            )}
          </div>
        </div>
        <div className="border-t border-line px-6 py-5 sm:border-l sm:border-t-0">
          <div className="text-[13px] text-fg-2">Japan · 項番</div>
          <div className={cx("mt-1 text-[34px] font-semibold leading-tight tracking-[-0.02em]", r.jp.listStatus === "uncertain" && "text-fg-2")}>{jpValue}</div>
          <div className="mt-1.5 text-[13px] text-fg-2">{r.jp.ministerialReference ? `貨物等省令 ${r.jp.ministerialReference.replace(/^貨物等省令\s*/, "")}` : jpNote}</div>
          <div className="mt-3 text-[13px] text-fg-3">{CONFIDENCE[r.jp.confidence]}</div>
        </div>
      </div>
      {r.hsCodeSuggestion && (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-t border-line px-6 py-3 text-[13px]">
          <span className="text-fg-2">Suggested HS code</span>
          <span className="font-mono text-[13px] text-fg">{r.hsCodeSuggestion}</span>
          <span className="text-fg-3">Confirm with your customs broker.</span>
        </div>
      )}
    </Card>
  );
}

function Reasoning({ r, candidates }: { r: Result; candidates: { id: string; heading: string }[] }) {
  const open = useRegSheet();
  const [view, setView] = useState<"us" | "jp">("us");
  const d = view === "us" ? r.us : r.jp;
  return (
    <Section
      title="How it was reached"
      actions={
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: "us", label: "United States" },
            { value: "jp", label: "Japan" },
          ]}
        />
      }
    >
      <Card>
        <p className="max-w-[68ch] px-5 py-4 text-[14px] leading-[1.65]">{d.rationale}</p>
        {d.parameters.length > 0 && (
          <Block title="Control parameters">
            <ParamTable params={d.parameters} />
          </Block>
        )}
        {view === "us" && r.us.alternatives.length > 0 && (
          <Block title="Ruled out">
            <div className="k-list" style={{ ["--inset" as string]: "20px" }}>
              {r.us.alternatives.map((a, i) => (
                <div key={i} className="flex gap-4 px-5 py-2.5 text-[13.5px]">
                  <button onClick={() => open({ kind: "eccn", id: a.eccn.slice(0, 5), paragraph: a.paragraph || undefined })} className="w-24 shrink-0 text-left font-mono text-[12.5px] font-medium text-accent-text hover:underline">
                    {a.eccn}
                    {a.paragraph ? `.${a.paragraph}` : ""}
                  </button>
                  <span className="text-fg-2">{a.why}</span>
                </div>
              ))}
            </div>
          </Block>
        )}
        {d.missingInformation.length > 0 && (
          <Block title="Still to confirm">
            <div className="k-list" style={{ ["--inset" as string]: "44px" }}>
              {d.missingInformation.map((m, i) => (
                <div key={i} className="flex gap-3 px-5 py-2.5 text-[13.5px]">
                  <StatusDot status="incomplete" />
                  <span>{m}</span>
                </div>
              ))}
            </div>
          </Block>
        )}
      </Card>
      {view === "us" && candidates.length > 0 && (
        <p className="mt-2.5 px-1 text-[12px] leading-relaxed text-fg-3">
          Compared against {candidates.length} Control List entr{candidates.length === 1 ? "y" : "ies"}:{" "}
          {candidates.map((c, i) => (
            <span key={c.id}>
              {i > 0 && ", "}
              <button onClick={() => open({ kind: "eccn", id: c.id })} title={c.heading} className="font-mono hover:text-fg-2 hover:underline">
                {c.id}
              </button>
            </span>
          ))}
        </p>
      )}
    </Section>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-line">
      <div className="px-5 pb-1 pt-3.5 text-[13px] font-semibold text-fg-2">{title}</div>
      {children}
    </div>
  );
}

const PARAM_STATUS = {
  meets: { label: "Meets", dot: "bg-orange" },
  does_not_meet: { label: "Below", dot: "bg-green" },
  unknown: { label: "Unknown", dot: "ring-[1.5px] ring-inset ring-fg-3" },
} as const;

function ParamTable({ params }: { params: Param[] }) {
  return (
    <div className="scroll-thin overflow-x-auto pb-1">
      <table className="w-full min-w-[560px] text-[13px]">
        <thead>
          <tr className="text-left text-[12px] text-fg-3">
            <th className="py-1.5 pl-5 pr-3 font-normal">Parameter</th>
            <th className="px-3 py-1.5 font-normal">Control threshold</th>
            <th className="px-3 py-1.5 font-normal">This product</th>
            <th className="py-1.5 pl-3 pr-5 font-normal">Result</th>
          </tr>
        </thead>
        <tbody>
          {params.map((p, i) => {
            const s = PARAM_STATUS[p.status] ?? PARAM_STATUS.unknown;
            return (
              <tr key={i} className="border-t border-line align-top">
                <td className="py-2.5 pl-5 pr-3">
                  <div className="font-medium">{p.parameter}</div>
                  {p.reference && <div className="mt-0.5 font-mono text-[11.5px] text-fg-3">{p.reference}</div>}
                </td>
                <td className="px-3 py-2.5 text-fg-2">{p.threshold}</td>
                <td className="px-3 py-2.5">{p.productValue || <span className="text-fg-3">Not provided</span>}</td>
                <td className="whitespace-nowrap py-2.5 pl-3 pr-5">
                  <span className="inline-flex items-center gap-1.5 text-fg-2" title={p.status === "meets" ? "The product meets this control threshold" : p.status === "does_not_meet" ? "The product falls below this control threshold" : "Not enough information to compare"}>
                    <span className={cx("size-2 shrink-0 rounded-full", s.dot)} />
                    {s.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ManualResults({ results, loading, typed, className }: { results: { id: string; heading: string }[]; loading: boolean; typed: boolean; className?: string }) {
  const open = useRegSheet();
  return (
    <Section className={className} title="Matching Control List entries" actions={loading ? <Spinner /> : null}>
      <Card className="k-list overflow-hidden" style={{ ["--inset" as string]: "20px" }}>
        {results.length === 0 ? (
          <div className="px-5 py-8 text-center text-[13.5px] text-fg-3">{typed && !loading ? "No entries match. Try the technical term a datasheet would use." : "Type a product name or description to search the Control List."}</div>
        ) : (
          results.slice(0, 15).map((r) => (
            <button key={r.id} onClick={() => open({ kind: "eccn", id: r.id })} className="flex w-full items-center gap-4 px-5 py-2.5 text-left transition-colors hover:bg-fill-2">
              <span className="w-14 shrink-0 font-mono text-[12.5px] font-medium">{r.id}</span>
              <span className="min-w-0 flex-1 text-[13.5px] text-fg-2">{r.heading}</span>
              <ChevronRight className="size-4 shrink-0 text-fg-3" />
            </button>
          ))
        )}
      </Card>
    </Section>
  );
}
