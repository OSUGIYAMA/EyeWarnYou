import { FileUp, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Page, useMeta } from "../components/AppShell.tsx";
import { CountryName, CountryPicker, useCountries } from "../components/CountryPicker.tsx";
import { Badge, Button, Card, CardHeader, Field, Input, PageHeader, Section, Segmented, Textarea, toast } from "../components/ui/index.tsx";
import { api, ApiError, type Case, type Item } from "../lib/api.ts";

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
  const [itemName, setItemName] = useState("");
  const [hsCode, setHsCode] = useState("");
  const [endUser, setEndUser] = useState("");
  const [endUserCountry, setEndUserCountry] = useState("");
  const countries = useCountries();
  const countryName = (iso: string) => countries.data?.find((c) => c.iso2 === iso)?.en ?? iso;
  const suggestedTitle = itemName.trim() ? `${itemName.trim()}${destination || endUser.trim() ? ` to ${endUser.trim() || countryName(destination)}` : ""}` : destination ? `Shipment to ${countryName(destination)}` : "";
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
      if (r.case.parties.some((p) => p.name.trim())) await api.post(`/cases/${r.case.id}/screen`).catch(() => undefined);
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

  const quick = () =>
    create({
      title: title.trim() || suggestedTitle || "Untitled case",
      shipFrom,
      destination,
      items: itemName.trim()
        ? [
            {
              id: rid(),
              name: itemName.trim(),
              hsCode: hsCode.trim() || undefined,
              kind: "commodity",
              quantity: 1,
              currency: "USD",
              countryOfOrigin: "",
              us: { origin: "unknown", usContentEccns: [], fdp: {}, eccn: "", paragraph: "", classification: "unclassified", controlOverrides: {} },
              jp: { listStatus: "unclassified", kou: "", catchAllScope: "unknown", appendix2_3: "unknown" },
              cn: { listStatus: "unclassified", cnCode: "", materials: [] },
            } as Item,
          ]
        : [],
      parties: endUser.trim() ? [{ id: rid(), role: "end_user", name: endUser.trim(), country: endUserCountry || destination, address: "" }] : [],
    });

  return (
    <Page>
      <PageHeader title="Check a shipment" description="Three answers are enough to start. EyeWarnYou works out which laws apply and asks for anything else it needs." />
      <Segmented
        className="mb-6"
        value={mode}
        onChange={setMode}
        options={[
          { value: "blank", label: "Answer three questions" },
          { value: "doc", label: "Start from a document" },
        ]}
      />

      {mode === "blank" && (
        <form
          className="space-y-8"
          onSubmit={(e) => {
            e.preventDefault();
            void quick();
          }}
        >
          <Section title="What are you shipping?" lead={<Num n={1} />}>
            <Card className="grid gap-4 p-5 sm:grid-cols-[1fr_200px]">
              <Field label="Product" hint="Add more items, specifications and classifications on the next screen.">
                <Input autoFocus value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="e.g. Spectrum analyzer, 26.5 GHz" />
              </Field>
              <Field label="HS code (optional)" hint="Drives Japan’s catch-all scope.">
                <Input value={hsCode} onChange={(e) => setHsCode(e.target.value)} placeholder="9030.84" className="font-mono" />
              </Field>
            </Card>
          </Section>
          <Section title="Where is it going?" lead={<Num n={2} />}>
            <Card className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Ships from" hint="Decides which export law governs the shipment.">
                <CountryPicker value={shipFrom} onChange={setShipFrom} />
              </Field>
              <Field label="Final destination" hint="Where the goods will be used, not where they transit.">
                <CountryPicker value={destination} onChange={setDestination} placeholder="Choose a country" />
              </Field>
            </Card>
          </Section>
          <Section title="Who will use it?" lead={<Num n={3} />} description="Optional now, but every party must be screened before you ship.">
            <Card className="grid gap-4 p-5 sm:grid-cols-[1fr_240px]">
              <Field label="End user">
                <Input value={endUser} onChange={(e) => setEndUser(e.target.value)} placeholder="Legal name, as in the contract" />
              </Field>
              <Field label="Country">
                <CountryPicker value={endUserCountry || destination} onChange={setEndUserCountry} placeholder="Same as destination" />
              </Field>
            </Card>
          </Section>
          <div className="flex flex-wrap items-end gap-4 border-t border-line pt-6">
            <Field label="Case name" className="min-w-64 flex-1">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={suggestedTitle || "Named automatically from the product and destination"} />
            </Field>
            <Button variant="primary" size="lg" type="submit" loading={creating} disabled={!destination && !itemName.trim()}>
              Check this shipment
            </Button>
          </div>
        </form>
      )}

      {mode === "doc" && !ai && (
        <Card className="flex flex-col items-center px-6 py-12 text-center">
          <FileUp className="size-8 stroke-[1.5] text-fg-3" />
          <div className="mt-3 text-[17px] font-semibold tracking-tight">Drop in a purchase order, and EyeWarnYou drafts the case</div>
          <p className="mt-1 max-w-md text-[14px] leading-relaxed text-fg-2">
            Claude reads the contract and fills in the goods, parties and route, quoting the source for every value. You check the draft before anything is saved. This needs an Anthropic API key; documents go only to the Anthropic API from this machine.
          </p>
          <Link to="/settings#ai" className="mt-5">
            <Button variant="primary">Add an API key</Button>
          </Link>
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
              className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-line-strong px-6 py-12 text-center transition-colors hover:border-accent hover:bg-accent-soft/40"
            >
              <Upload className="size-7 stroke-[1.5] text-fg-3" />
              <div className="mt-3 text-[15px] font-semibold">{file ? file.name : "Drop a contract or purchase order"}</div>
              <div className="mt-1 text-[13px] text-fg-3">PDF (including scans), DOCX or TXT, up to 32 MB · or click to choose</div>
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
              <Button variant="primary" loading={extracting} disabled={!file && !text.trim()} onClick={extract}>
                {extracting ? "Reading the document…" : "Draft the case"}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {ex && (
        <div className="space-y-4">
          <Card>
            <CardHeader title={ex.title || "Draft from the document"} subtitle="Check the draft. Nothing is saved until you create the case." />
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
              <div className="k-list">
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
              <div className="k-list">
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
                  <div className="mb-2 text-[15px] font-semibold">Points to question</div>
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
                  <div className="mb-2 text-[15px] font-semibold">Not stated in the document</div>
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
            <Button onClick={() => setEx(null)}>Start over</Button>
            <Button variant="primary" loading={creating} onClick={() => fromExtraction(ex)}>
              Create case from extraction
            </Button>
          </div>
        </div>
      )}
    </Page>
  );
}

function Num({ n }: { n: number }) {
  return <span className="flex size-6 items-center justify-center rounded-full bg-fg text-[12.5px] font-semibold tabular text-bg">{n}</span>;
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
  return <div className="mt-1.5 border-l-2 border-line-strong pl-2.5 text-[12.5px] text-fg-3">“{children}”</div>;
}
