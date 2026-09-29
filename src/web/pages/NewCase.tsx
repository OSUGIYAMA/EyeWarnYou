import { FilePlus2, FileText, Sparkles, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Page, useMeta } from "../components/AppShell.tsx";
import { CountryName, CountryPicker } from "../components/CountryPicker.tsx";
import { Badge, Button, Card, CardHeader, Field, Input, SectionLabel, Textarea, toast } from "../components/ui/index.tsx";
import { api, ApiError, type Case, type Item } from "../lib/api.ts";
import { cx } from "../lib/format.ts";

interface Extraction {
  title: string;
  contractRef: string;
  shipFrom: string;
  destination: string;
  incoterms: string;
  shipDate: string;
  endUseDescription: string;
  parties: { role: string; name: string; country: string; address: string; evidence: string }[];
  items: { name: string; model: string; manufacturer: string; description: string; quantity: number | null; unitValue: number | null; currency: string; hsCode: string; countryOfOrigin: string; statedClassification: string; evidence: string }[];
  concerns: { concern: string; evidence: string; severity: "high" | "medium" | "low" }[];
  missing: string[];
}

const rid = () => Math.random().toString(36).slice(2, 10);

export function NewCasePage() {
  const nav = useNavigate();
  const meta = useMeta();
  const ai = meta.data?.settings.aiConfigured;
  const [mode, setMode] = useState<"blank" | "doc">("blank");
  const [title, setTitle] = useState("");
  const [shipFrom, setShipFrom] = useState("JP");
  const [destination, setDestination] = useState("");
  const [creating, setCreating] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [ex, setEx] = useState<Extraction | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const create = async (body: Partial<Case> & { title: string }) => {
    setCreating(true);
    try {
      const r = await api.post<{ case: Case }>("/cases", body);
      nav(`/cases/${r.case.id}`);
    } catch (e) {
      toast("Could not create the case", { detail: (e as Error).message, tone: "error" });
    } finally {
      setCreating(false);
    }
  };

  const extract = async () => {
    const fd = new FormData();
    if (file) fd.append("file", file);
    else fd.append("text", text);
    setExtracting(true);
    try {
      const r = await api.post<{ result: Extraction }>("/ai/extract", fd);
      setEx(r.result);
    } catch (e) {
      toast("Extraction failed", { detail: e instanceof ApiError ? e.message : String(e), tone: "error" });
    } finally {
      setExtracting(false);
    }
  };

  const fromExtraction = (x: Extraction) => {
    const cur = (v: string) => (["USD", "JPY", "EUR", "CNY", "GBP", "KRW", "TWD"].includes(v) ? v : "USD");
    const items = x.items.map(
      (i) =>
        ({
          id: rid(),
          name: i.name || i.model || "Item",
          model: i.model,
          manufacturer: i.manufacturer,
          description: i.description,
          quantity: i.quantity ?? 1,
          unitValue: i.unitValue ?? undefined,
          currency: cur(i.currency),
          hsCode: i.hsCode,
          countryOfOrigin: /^[A-Z]{2}$/.test(i.countryOfOrigin) ? i.countryOfOrigin : "",
          kind: "commodity",
          us: { origin: i.countryOfOrigin === "US" ? "us_origin" : "unknown", usContentEccns: [], fdp: {}, eccn: /^\d[A-E]\d{3}$|^EAR99$/.test(i.statedClassification) ? i.statedClassification : "", paragraph: "", classification: i.statedClassification ? "provisional" : "unclassified", classificationBasis: i.statedClassification ? `Stated in document: ${i.statedClassification}` : undefined, controlOverrides: {} },
          jp: { listStatus: "unclassified", kou: "", catchAllScope: "unknown", appendix2_3: "unknown" },
          cn: { listStatus: "unclassified", cnCode: "", materials: [] },
        }) as Item,
    );
    const notes = [
      x.concerns.length ? `Concerns noted during intake:\n${x.concerns.map((c) => `- [${c.severity}] ${c.concern}${c.evidence ? ` — “${c.evidence}”` : ""}`).join("\n")}` : "",
      x.missing.length ? `Not stated in the document:\n${x.missing.map((m) => `- ${m}`).join("\n")}` : "",
      file ? `Source document: ${file.name}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    return create({
      title: x.title || title || "New case",
      contractRef: x.contractRef,
      shipFrom: /^[A-Z]{2}$/.test(x.shipFrom) ? x.shipFrom : shipFrom,
      destination: /^[A-Z]{2}$/.test(x.destination) ? x.destination : "",
      incoterms: x.incoterms,
      shipDate: /^\d{4}-\d{2}-\d{2}$/.test(x.shipDate) ? x.shipDate : "",
      endUseDescription: x.endUseDescription,
      items,
      parties: x.parties.filter((p) => p.name).map((p) => ({ id: rid(), role: p.role as never, name: p.name, country: /^[A-Z]{2}$/.test(p.country) ? p.country : "", address: p.address })),
      notes,
    });
  };

  return (
    <Page>
      <div className="mb-6">
        <h1 className="text-[22px] font-semibold tracking-tight">New case</h1>
        <p className="mt-1 text-[13.5px] text-fg-2">Start from scratch, or let Kanmon read a contract or purchase order and draft the case for you to verify.</p>
      </div>
      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <ModeCard active={mode === "blank"} onClick={() => setMode("blank")} icon={<FilePlus2 className="size-4" />} title="Start from scratch" text="Enter the transaction, items and parties yourself." />
        <ModeCard active={mode === "doc"} onClick={() => setMode("doc")} icon={<Sparkles className="size-4" />} title="Draft from a document" text="Upload a contract, PO or proforma (PDF, DOCX, TXT). Every extracted value carries a quote from the source." badge={ai ? undefined : "Needs an API key"} />
      </div>

      {mode === "blank" && (
        <Card>
          <form
            className="grid gap-4 p-5 sm:grid-cols-3"
            onSubmit={(e) => {
              e.preventDefault();
              void create({ title: title || "Untitled case", shipFrom, destination });
            }}
          >
            <Field label="Title" className="sm:col-span-3">
              <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Spectrum analyzers to Hanoi University of Science" />
            </Field>
            <Field label="Ships from">
              <CountryPicker value={shipFrom} onChange={setShipFrom} />
            </Field>
            <Field label="Ultimate destination">
              <CountryPicker value={destination} onChange={setDestination} />
            </Field>
            <div className="flex items-end justify-end">
              <Button variant="primary" type="submit" loading={creating}>
                Create case
              </Button>
            </div>
          </form>
        </Card>
      )}

      {mode === "doc" && !ai && (
        <Card className="p-5 text-[13.5px] text-fg-2">
          Document intake uses Claude. Add an Anthropic API key in{" "}
          <Link to="/settings" className="font-medium text-accent-text hover:underline">
            Settings
          </Link>{" "}
          — the key and your documents go only to the Anthropic API from this machine.
        </Card>
      )}

      {mode === "doc" && ai && !ex && (
        <Card>
          <div className="space-y-4 p-5">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f) setFile(f);
              }}
              onClick={() => inputRef.current?.click()}
              className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-line-strong bg-panel-2/40 px-6 py-10 text-center transition-colors hover:bg-panel-2"
            >
              <Upload className="size-5 text-fg-3" />
              <div className="mt-2 text-[13.5px] font-medium">{file ? file.name : "Drop a file or click to choose"}</div>
              <div className="mt-0.5 text-[12px] text-fg-3">PDF (incl. scanned), DOCX or TXT · up to 32 MB</div>
              <input ref={inputRef} type="file" accept=".pdf,.docx,.txt,.md,.csv" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
            <div className="flex items-center gap-3 text-[12px] text-fg-3">
              <div className="h-px flex-1 bg-line" /> or paste text <div className="h-px flex-1 bg-line" />
            </div>
            <Textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the contract or order text…" disabled={!!file} />
            <div className="flex justify-end gap-2">
              {file && (
                <Button variant="ghost" onClick={() => setFile(null)}>
                  Remove file
                </Button>
              )}
              <Button variant="primary" icon={<Sparkles className="size-3.5" />} loading={extracting} disabled={!file && !text.trim()} onClick={extract}>
                {extracting ? "Reading document…" : "Extract transaction"}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {ex && (
        <div className="space-y-4">
          <Card>
            <CardHeader title={ex.title || "Extracted transaction"} subtitle="Review before creating the case. Nothing is saved until you click Create." icon={<FileText className="size-4" />} />
            <div className="grid gap-4 p-5 sm:grid-cols-4">
              <KV k="Ships from" v={<CountryName iso2={ex.shipFrom} />} />
              <KV k="Destination" v={<CountryName iso2={ex.destination} />} />
              <KV k="Contract / PO" v={ex.contractRef || "—"} />
              <KV k="Incoterms / date" v={[ex.incoterms, ex.shipDate].filter(Boolean).join(" · ") || "—"} />
              <KV k="Stated end use" v={ex.endUseDescription || "—"} className="sm:col-span-4" />
            </div>
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title={`Items (${ex.items.length})`} />
              <div className="divide-y divide-line">
                {ex.items.map((i, n) => (
                  <div key={n} className="px-4 py-3 text-[13px]">
                    <div className="font-medium">{i.name}</div>
                    <div className="text-[12px] text-fg-3">{[i.manufacturer, i.model, i.hsCode && `HS ${i.hsCode}`, i.quantity && `× ${i.quantity}`, i.unitValue && `${i.currency} ${i.unitValue.toLocaleString()}`].filter(Boolean).join(" · ")}</div>
                    {i.statedClassification && <Badge tone="blue" className="mt-1">Stated: {i.statedClassification}</Badge>}
                    {i.evidence && <Quote>{i.evidence}</Quote>}
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <CardHeader title={`Parties (${ex.parties.length})`} />
              <div className="divide-y divide-line">
                {ex.parties.map((p, n) => (
                  <div key={n} className="px-4 py-3 text-[13px]">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{p.name}</span>
                      <Badge tone="gray">{p.role.replace("_", " ")}</Badge>
                    </div>
                    <div className="text-[12px] text-fg-3">{[p.country, p.address].filter(Boolean).join(" · ")}</div>
                    {p.evidence && <Quote>{p.evidence}</Quote>}
                  </div>
                ))}
              </div>
            </Card>
          </div>
          {(ex.concerns.length > 0 || ex.missing.length > 0) && (
            <Card className="p-5">
              {ex.concerns.length > 0 && (
                <>
                  <SectionLabel className="mb-2">Points to question</SectionLabel>
                  <ul className="mb-4 space-y-2">
                    {ex.concerns.map((cc, n) => (
                      <li key={n} className="text-[13px]">
                        <Badge tone={cc.severity === "high" ? "red" : cc.severity === "medium" ? "amber" : "gray"}>{cc.severity}</Badge> <span className="ml-1">{cc.concern}</span>
                        {cc.evidence && <Quote>{cc.evidence}</Quote>}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {ex.missing.length > 0 && (
                <>
                  <SectionLabel className="mb-2">Not stated in the document</SectionLabel>
                  <ul className="list-disc space-y-0.5 pl-5 text-[13px] text-fg-2">
                    {ex.missing.map((m, n) => (
                      <li key={n}>{m}</li>
                    ))}
                  </ul>
                </>
              )}
            </Card>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEx(null)}>
              Start over
            </Button>
            <Button variant="primary" loading={creating} onClick={() => fromExtraction(ex)}>
              Create case from extraction
            </Button>
          </div>
        </div>
      )}
    </Page>
  );
}

function ModeCard({ active, onClick, icon, title, text, badge }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; text: string; badge?: string }) {
  return (
    <button onClick={onClick} className={cx("rounded-xl border bg-panel p-4 text-left shadow-card transition-all", active ? "border-accent ring-3 ring-accent/15" : "border-line hover:border-line-strong")}>
      <div className="flex items-center gap-2">
        <span className={cx("flex size-7 items-center justify-center rounded-lg", active ? "bg-accent-soft text-accent-text" : "bg-panel-2 text-fg-3")}>{icon}</span>
        <span className="text-[14px] font-medium">{title}</span>
        {badge && <Badge tone="gray" className="ml-auto">{badge}</Badge>}
      </div>
      <div className="mt-2 text-[12.5px] text-fg-3">{text}</div>
    </button>
  );
}

function KV({ k, v, className }: { k: string; v: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="text-[11.5px] text-fg-3">{k}</div>
      <div className="mt-0.5 text-[13.5px]">{v}</div>
    </div>
  );
}

function Quote({ children }: { children: React.ReactNode }) {
  return <div className="mt-1 border-l-2 border-line-strong pl-2 text-[12px] italic text-fg-3">“{children}”</div>;
}
