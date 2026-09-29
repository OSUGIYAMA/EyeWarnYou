import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, CircleAlert, Copy, FileText, Loader2, MoreHorizontal, Package, Plus, Send, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Page } from "../components/AppShell.tsx";
import { CountryPicker } from "../components/CountryPicker.tsx";
import { Determination } from "../components/case/Determination.tsx";
import { ItemEditor } from "../components/case/ItemEditor.tsx";
import { PartiesCard } from "../components/case/PartiesCard.tsx";
import { QuestionsCard } from "../components/case/QuestionsCard.tsx";
import { useCaseEditor } from "../components/case/useCaseEditor.ts";
import { Badge, Button, Card, CardHeader, Dialog, Empty, Field, Input, Select, Skeleton, Textarea, toast } from "../components/ui/index.tsx";
import { api, ApiError, type Case, type Item } from "../lib/api.ts";
import { cx, fmtDate, relTime, STATUS_LABEL } from "../lib/format.ts";

const INCOTERMS = ["", "EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"];
const REGIONS: Record<string, string> = { "": "—", "UA-CRIMEA": "Crimea region", "UA-DNR": "“DNR” region (Donetsk)", "UA-LNR": "“LNR” region (Luhansk)" };

function blankItem(): Item {
  return {
    id: Math.random().toString(36).slice(2, 10),
    name: "",
    kind: "commodity",
    quantity: 1,
    currency: "USD",
    countryOfOrigin: "",
    us: { origin: "unknown", usContentEccns: [], fdp: {}, eccn: "", paragraph: "", classification: "unclassified", controlOverrides: {} },
    jp: { listStatus: "unclassified", kou: "", catchAllScope: "unknown", appendix2_3: "unknown" },
    cn: { listStatus: "unclassified", cnCode: "", materials: [] },
  } as Item;
}

export function CasePage() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const ed = useCaseEditor(id);
  const [busy, setBusy] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState<null | "approved" | "rejected" | "submitted" | "on_hold">(null);
  const [note, setNote] = useState("");

  if (ed.error) return <Page><Empty title="Case not found">{(ed.error as Error).message}</Empty></Page>;
  if (!ed.draft || !ed.view)
    return (
      <Page wide>
        <Skeleton className="mb-3 h-6 w-64" />
        <div className="grid gap-6 xl:grid-cols-[1fr_460px]">
          <div className="space-y-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-40" />)}</div>
          <Skeleton className="h-96" />
        </div>
      </Page>
    );
  const c = ed.draft;
  const view = ed.view;
  const set = (fn: (k: Case) => void, immediate = false) => ed.update((k) => (fn(k), k), immediate);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Something went wrong", { tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  const onQuestion = (qid: string, v: "yes" | "no" | "unknown") => {
    const [kind, itemId, idx] = qid.split(".");
    set((k) => {
      const item = k.items.find((i) => i.id === itemId);
      if (kind === "ctl" && item) {
        if (v === "unknown") delete item.us.controlOverrides[idx];
        else item.us.controlOverrides[idx] = v === "yes";
      } else if (kind === "fdp" && item) item.us.fdp[idx] = v;
      else if (kind === "jp23" && item) item.jp.appendix2_3 = v;
      else k.answers[qid] = v;
    }, true);
  };

  const juris = (itemId: string) => view.assessment.jurisdictions.map((j) => ({ jurisdiction: j.jurisdiction, a: j.items.find((x) => x.itemId === itemId) }));
  const canApprove = !["incomplete", "prohibited"].includes(view.assessment.overall);

  return (
    <Page wide>
      <div className="mb-4 flex items-center gap-2 text-[12.5px] text-fg-3">
        <Link to="/cases" className="inline-flex items-center gap-1 hover:text-fg">
          <ArrowLeft className="size-3.5" /> Cases
        </Link>
        <span>/</span>
        <span className="font-mono">{c.ref}</span>
        <span className="ml-auto flex items-center gap-1.5">
          {ed.save === "saving" ? (
            <>
              <Loader2 className="size-3 animate-spin" /> Saving
            </>
          ) : ed.save === "error" ? (
            <span className="text-red-text">Not saved</span>
          ) : (
            <>
              <Check className="size-3" /> Saved {relTime(c.updatedAt)}
            </>
          )}
        </span>
      </div>

      <div className="mb-6 flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <input
            value={c.title}
            onChange={(e) => set((k) => void (k.title = e.target.value))}
            className="w-full bg-transparent text-[22px] font-semibold tracking-tight outline-none"
            aria-label="Case title"
          />
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-fg-3">
            <Badge tone={c.status === "approved" ? "green" : c.status === "rejected" ? "red" : c.status === "in_review" ? "blue" : c.status === "on_hold" ? "amber" : "gray"} dot>
              {STATUS_LABEL[c.status]}
            </Badge>
            <span>Created {fmtDate(c.createdAt)}{c.createdBy ? ` by ${c.createdBy}` : ""}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/cases/${c.id}/report`} target="_blank">
            <Button icon={<FileText className="size-3.5" />}>Report</Button>
          </Link>
          {c.status === "draft" && (
            <Button variant="primary" icon={<Send className="size-3.5" />} onClick={() => setReviewOpen("submitted")}>
              Submit for review
            </Button>
          )}
          {c.status === "in_review" && (
            <>
              <Button variant="danger" icon={<X className="size-3.5" />} onClick={() => setReviewOpen("rejected")}>
                Reject
              </Button>
              <Button variant="primary" icon={<Check className="size-3.5" />} onClick={() => setReviewOpen("approved")} disabled={!canApprove} title={canApprove ? undefined : "Resolve open items first"}>
                Approve
              </Button>
            </>
          )}
          {(c.status === "approved" || c.status === "rejected" || c.status === "on_hold") && (
            <Button onClick={() => run("reopen", () => ed.action("/review", { action: "reopened" }))} loading={busy === "reopen"}>
              Reopen
            </Button>
          )}
          <Dropdown.Root>
            <Dropdown.Trigger asChild>
              <Button variant="ghost" aria-label="More actions" className="px-2">
                <MoreHorizontal className="size-4" />
              </Button>
            </Dropdown.Trigger>
            <Dropdown.Portal>
              <Dropdown.Content align="end" sideOffset={6} className="z-50 min-w-48 rounded-xl border border-line bg-panel p-1 shadow-float animate-in">
                <MenuItem icon={<Copy />} onSelect={() => run("dup", async () => nav(`/cases/${(await api.post<{ case: Case }>(`/cases/${c.id}/duplicate`)).case.id}`))}>
                  Duplicate case
                </MenuItem>
                <MenuItem icon={<CircleAlert />} onSelect={() => setReviewOpen("on_hold")}>
                  Put on hold
                </MenuItem>
                <Dropdown.Separator className="my-1 h-px bg-line" />
                <MenuItem
                  icon={<Trash2 />}
                  danger
                  onSelect={() => {
                    if (confirm(`Delete ${c.ref}? This cannot be undone.`)) void run("del", async () => (await api.del(`/cases/${c.id}`), nav("/cases")));
                  }}
                >
                  Delete case
                </MenuItem>
              </Dropdown.Content>
            </Dropdown.Portal>
          </Dropdown.Root>
        </div>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_470px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Transaction" subtitle="Where the goods ship from decides which export regime governs the shipment; the destination drives every country-based rule." />
            <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-3">
              <Field label="Ships from">
                <CountryPicker value={c.shipFrom} onChange={(v) => set((k) => void (k.shipFrom = v), true)} />
              </Field>
              <Field label="Ultimate destination">
                <CountryPicker value={c.destination} onChange={(v) => set((k) => void ((k.destination = v), v !== "UA" && (k.destinationRegion = "")), true)} />
              </Field>
              {c.destination === "UA" ? (
                <Field label="Region within Ukraine">
                  <Select value={c.destinationRegion} onChange={(e) => set((k) => void (k.destinationRegion = e.target.value), true)}>
                    {Object.entries(REGIONS).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : (
                <Field label="Planned ship date" hint="Rules with effective dates are evaluated on this date">
                  <Input type="date" value={c.shipDate} onChange={(e) => set((k) => void (k.shipDate = e.target.value), true)} />
                </Field>
              )}
              <Field label="Contract / PO reference">
                <Input value={c.contractRef} onChange={(e) => set((k) => void (k.contractRef = e.target.value))} />
              </Field>
              <Field label="Incoterms">
                <Select value={c.incoterms} onChange={(e) => set((k) => void (k.incoterms = e.target.value), true)}>
                  {INCOTERMS.map((x) => (
                    <option key={x} value={x}>
                      {x || "—"}
                    </option>
                  ))}
                </Select>
              </Field>
              {c.destination === "UA" && (
                <Field label="Planned ship date">
                  <Input type="date" value={c.shipDate} onChange={(e) => set((k) => void (k.shipDate = e.target.value), true)} />
                </Field>
              )}
              <Field label="Exporter of record">
                <Input value={c.exporter} onChange={(e) => set((k) => void (k.exporter = e.target.value))} placeholder="Legal entity shipping the goods" />
              </Field>
              <Field label="Stated end use" className="col-span-2 md:col-span-3">
                <Textarea rows={2} value={c.endUseDescription} onChange={(e) => set((k) => void (k.endUseDescription = e.target.value))} placeholder="As stated by the customer (end-use statement / contract)" />
              </Field>
            </div>
          </Card>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[13.5px] font-semibold tracking-tight">
                Items <span className="font-normal text-fg-3">({c.items.length})</span>
              </div>
              <div className="flex gap-1.5">
                <ProductImport onPick={(p) => set((k) => void k.items.push({ ...blankItem(), ...p, id: Math.random().toString(36).slice(2, 10) }), true)} />
                <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => set((k) => void k.items.push(blankItem()))}>
                  Add item
                </Button>
              </div>
            </div>
            {c.items.length === 0 ? (
              <Card>
                <Empty title="No items" action={<Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => set((k) => void k.items.push(blankItem()))}>Add item</Button>}>
                  Add each product, software or technology in the transaction.
                </Empty>
              </Card>
            ) : (
              <div className="space-y-3">
                {c.items.map((item, idx) => (
                  <ItemEditor
                    key={item.id}
                    c={c}
                    item={item}
                    index={idx}
                    fdp={view.fdp[item.id]}
                    assessments={juris(item.id)}
                    defaultOpen={c.items.length <= 2}
                    onChange={(fn, imm) => set((k) => fn(k.items[idx]), imm)}
                    onRemove={() => set((k) => void k.items.splice(idx, 1), true)}
                  />
                ))}
              </div>
            )}
          </div>

          <PartiesCard
            c={c}
            screening={busy === "screen"}
            onChange={(fn, imm) => set(fn, imm)}
            onScreen={() => run("screen", () => ed.action("/screen"))}
            onDisposition={(partyId, entryId, disposition, n) => run("disp", () => ed.action("/disposition", { partyId, entryId, disposition, note: n }))}
          />

          <QuestionsCard
            questions={view.questions}
            onAnswer={onQuestion}
            onAnswerMany={(ids, v) =>
              set((k) => {
                for (const qid of ids) k.answers[qid] = v;
              }, true)
            }
          />

          <Card>
            <CardHeader title="Notes & review trail" />
            <div className="p-4">
              <Textarea rows={3} value={c.notes} onChange={(e) => set((k) => void (k.notes = e.target.value))} placeholder="Internal notes: inquiries made, documents received, rationale…" />
              <ol className="mt-4 space-y-3 border-l border-line pl-4">
                {[...c.review].reverse().map((r, i) => (
                  <li key={i} className="relative text-[12.5px]">
                    <span className={cx("absolute -left-[21px] top-1 size-2.5 rounded-full ring-2 ring-panel", r.action === "approved" ? "bg-green" : r.action === "rejected" ? "bg-red" : r.action === "submitted" ? "bg-accent" : "bg-fg-3")} />
                    <div>
                      <span className="font-medium capitalize">{r.action.replace("_", " ")}</span>
                      {r.by && <span className="text-fg-3"> by {r.by}</span>}
                      <span className="text-fg-3"> · {fmtDate(r.at)}</span>
                      {r.outcome && <span className="text-fg-3"> · determination: {r.outcome.replace(/_/g, " ")}</span>}
                    </div>
                    {r.note && <div className="mt-0.5 text-fg-2">{r.note}</div>}
                  </li>
                ))}
              </ol>
            </div>
          </Card>
        </div>

        <aside className="xl:sticky xl:top-6">
          <div className="scroll-thin xl:max-h-[calc(100vh-48px)] xl:overflow-y-auto xl:rounded-xl">
            <Determination c={c} assessment={view.assessment} onQuestion={onQuestion} />
          </div>
        </aside>
      </div>

      <Dialog
        open={!!reviewOpen}
        onOpenChange={(o) => !o && setReviewOpen(null)}
        title={reviewOpen === "approved" ? "Approve this transaction" : reviewOpen === "rejected" ? "Reject this transaction" : reviewOpen === "on_hold" ? "Put on hold" : "Submit for review"}
        description={reviewOpen === "approved" ? "The current determination and the data versions it relied on are recorded with your decision." : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setReviewOpen(null)}>
              Cancel
            </Button>
            <Button
              variant={reviewOpen === "rejected" ? "danger" : "primary"}
              loading={busy === "review"}
              onClick={() =>
                run("review", async () => {
                  await ed.action("/review", { action: reviewOpen, note: note || undefined });
                  setReviewOpen(null);
                  setNote("");
                  toast(reviewOpen === "approved" ? "Approved" : "Recorded", { tone: "success" });
                })
              }
            >
              Confirm
            </Button>
          </>
        }
      >
        <Field label={reviewOpen === "approved" ? "Conditions / rationale (recorded in the trail)" : "Note"}>
          <Textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} autoFocus placeholder={reviewOpen === "approved" ? "e.g. Approved under License Exception LVS; UVL statement obtained…" : ""} />
        </Field>
      </Dialog>
    </Page>
  );
}

function MenuItem({ icon, children, onSelect, danger }: { icon: React.ReactNode; children: React.ReactNode; onSelect: () => void; danger?: boolean }) {
  return (
    <Dropdown.Item onSelect={onSelect} className={cx("flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] outline-none data-[highlighted]:bg-panel-2 [&>svg]:size-3.5", danger ? "text-red-text" : "text-fg")}>
      {icon}
      {children}
    </Dropdown.Item>
  );
}

function ProductImport({ onPick }: { onPick: (p: Partial<Item>) => void }) {
  const [open, setOpen] = useState(false);
  const products = useQuery({ queryKey: ["products"], queryFn: () => api.get<(Item & { updatedAt: string })[]>("/products"), enabled: open });
  return (
    <>
      <Button size="sm" variant="ghost" icon={<Package className="size-3.5" />} onClick={() => setOpen(true)}>
        From product master
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title="Add from product master" description="Reuse a product with its recorded classifications.">
        {products.data?.length === 0 && <div className="py-6 text-center text-[13px] text-fg-3">No products saved yet. Save one from the Classify page.</div>}
        <div className="divide-y divide-line">
          {products.data?.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                const { id: _id, updatedAt: _u, ...rest } = p;
                onPick(rest);
                setOpen(false);
              }}
              className="flex w-full items-center gap-3 px-1 py-2.5 text-left hover:bg-panel-2/60"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-medium">{p.name}</div>
                <div className="text-[12px] text-fg-3">{[p.manufacturer, p.model].filter(Boolean).join(" · ")}</div>
              </div>
              {p.us?.eccn && <span className="font-mono text-[12px]">{p.us.eccn}{p.us.paragraph ? `.${p.us.paragraph}` : ""}</span>}
              {p.jp?.kou && <span className="text-[12px] text-fg-2">{p.jp.kou}</span>}
            </button>
          ))}
        </div>
      </Dialog>
    </>
  );
}
