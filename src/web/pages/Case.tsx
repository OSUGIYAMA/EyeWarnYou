import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronLeft, CircleAlert, CircleCheck, Copy, FileText, Loader2, MoreHorizontal, Package, Plus, Trash2 } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { Page } from "../components/AppShell.tsx";
import { CountryPicker } from "../components/CountryPicker.tsx";
import { Determination, Verdict } from "../components/case/Determination.tsx";
import { ItemEditor } from "../components/case/ItemEditor.tsx";
import { PartiesCard } from "../components/case/PartiesCard.tsx";
import { QuestionsCard } from "../components/case/QuestionsCard.tsx";
import { useCaseEditor } from "../components/case/useCaseEditor.ts";
import { Button, Card, Dialog, Empty, Field, Input, Section, Select, Skeleton, Textarea, toast } from "../components/ui/index.tsx";
import { caseProgress, type Progress, type Step } from "@/shared/progress.ts";
import { api, ApiError, type Case, type Item } from "../lib/api.ts";
import { cx, fmtDate, relTime, STATUS_LABEL } from "../lib/format.ts";

/** Scroll a case section — or, for questions, the first unanswered one — into view and briefly highlight it. */
function reveal(anchor: string) {
  const first = anchor === "questions" ? document.querySelector<HTMLElement>('#questions [data-open="true"]') : null;
  if (first) {
    first.scrollIntoView({ behavior: "smooth", block: "center" });
    first.animate([{ backgroundColor: "transparent" }, { backgroundColor: "color-mix(in srgb, var(--accent) 14%, transparent)" }, { backgroundColor: "transparent" }], { duration: 1600, easing: "ease-out", delay: 300 });
    return;
  }
  const el = document.getElementById(anchor);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  el.animate([{ boxShadow: "0 0 0 0 transparent" }, { boxShadow: "0 0 0 4px color-mix(in srgb, var(--accent) 30%, transparent)" }, { boxShadow: "0 0 0 0 transparent" }], { duration: 1400, easing: "ease-out", delay: 250 });
}

const SECTION_STEPS: Record<string, Step["id"][]> = {
  transaction: ["route"],
  items: ["goods", "details"],
  parties: ["parties", "screen", "matches"],
  questions: ["questions"],
  review: ["submit", "decide"],
};

function StepMark({ progress, section, n }: { progress: Progress; section: string; n: number }) {
  const steps = progress.steps.filter((s) => SECTION_STEPS[section].includes(s.id));
  const done = steps.every((s) => s.done);
  return done ? (
    <CircleCheck className="size-5 text-green" fill="currentColor" stroke="var(--bg)" strokeWidth={2} aria-label="Done" />
  ) : (
    <span className={cx("flex size-5 items-center justify-center rounded-full text-[11px] font-semibold tabular", progress.next && SECTION_STEPS[section].includes(progress.next.id) ? "bg-accent text-white" : "ring-[1.5px] ring-inset ring-fg-3/60 text-fg-3")}>{n}</span>
  );
}

const INCOTERMS = ["", "EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"];
const REGIONS: Record<string, string> = { "": "Not a listed region", "UA-CRIMEA": "Crimea region", "UA-DNR": "“DNR” region (Donetsk)", "UA-LNR": "“LNR” region (Luhansk)" };

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
  const { hash } = useLocation();
  const ed = useCaseEditor(id);
  const [busy, setBusy] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState<null | "approved" | "rejected" | "submitted" | "on_hold">(null);
  const [note, setNote] = useState("");
  const loaded = !!ed.view;

  // Arriving from "Continue" on the home page lands on the section that needs work.
  useEffect(() => {
    if (loaded && hash) setTimeout(() => reveal(hash.slice(1)), 150);
  }, [loaded, hash]);

  if (ed.error) return <Page><Empty title="Case not found">{(ed.error as Error).message}</Empty></Page>;
  if (!ed.draft || !ed.view)
    return (
      <Page wide>
        <Skeleton className="mb-3 h-8 w-96" />
        <Skeleton className="mb-8 h-40 rounded-xl" />
        <div className="grid gap-8 xl:grid-cols-[1fr_460px]">
          <div className="space-y-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-40 rounded-xl" />)}</div>
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </Page>
    );
  const c = ed.draft;
  const view = ed.view;
  const set = (fn: (k: Case) => void, immediate = false) => ed.update((k) => (fn(k), k), immediate);
  const progress = caseProgress(c, view.assessment);

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
  const screen = () => run("screen", () => ed.action("/screen"));
  const addItem = () => set((k) => void k.items.push(blankItem()));

  /** The one primary action on the page: whatever the case needs next. */
  const next = progress.next;
  let action: ReactNode = null;
  if (c.status === "in_review")
    action = (
      <>
        <Button onClick={() => setReviewOpen("rejected")}>Reject</Button>
        <Button variant="primary" onClick={() => setReviewOpen("approved")} disabled={!canApprove} title={canApprove ? undefined : "Resolve the open items first"}>
          Approve
        </Button>
      </>
    );
  else if (c.status === "approved" || c.status === "rejected" || c.status === "on_hold")
    action = (
      <Button onClick={() => run("reopen", () => ed.action("/review", { action: "reopened" }))} loading={busy === "reopen"}>
        Reopen
      </Button>
    );
  else if (next)
    action = (
      <Button
        variant="primary"
        size="lg"
        loading={next.id === "screen" && busy === "screen"}
        onClick={() => {
          if (next.id === "screen") void screen();
          else if (next.id === "submit") setReviewOpen("submitted");
          else {
            if (next.id === "goods" && !c.items.length) addItem();
            reveal(next.anchor);
          }
        }}
      >
        {next.label}
      </Button>
    );

  return (
    <Page wide>
      <div className="mb-3 flex items-center justify-between text-[13.5px]">
        <Link to="/cases" className="-ml-1 inline-flex items-center text-accent-text hover:underline">
          <ChevronLeft className="size-4" /> Cases
        </Link>
        <span className="flex items-center gap-1.5 text-[12.5px] text-fg-3">
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
        <div className="min-w-[min(100%,26rem)] flex-1">
          <TitleInput value={c.title} onChange={(v) => set((k) => void (k.title = v))} />
          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[13px] text-fg-3">
            <span className="tabular">{c.ref}</span>
            <span>·</span>
            <span className={cx(c.status === "approved" && "text-green-text", c.status === "rejected" && "text-red-text", c.status === "in_review" && "text-accent-text")}>{STATUS_LABEL[c.status]}</span>
            <span>·</span>
            <span>
              Created {fmtDate(c.createdAt)}
              {c.createdBy ? ` by ${c.createdBy}` : ""}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link to={`/cases/${c.id}/report`} target="_blank">
            <Button icon={<FileText className="size-3.5" />}>Review record</Button>
          </Link>
          <Dropdown.Root>
            <Dropdown.Trigger asChild>
              <button aria-label="More actions" className="inline-flex size-[34px] items-center justify-center rounded-full bg-fill text-fg hover:bg-panel-3">
                <MoreHorizontal className="size-4" />
              </button>
            </Dropdown.Trigger>
            <Dropdown.Portal>
              <Dropdown.Content align="end" sideOffset={6} className="material z-50 min-w-52 rounded-xl p-1 shadow-float animate-in">
                <MenuItem icon={<Copy />} onSelect={() => run("dup", async () => nav(`/cases/${(await api.post<{ case: Case }>(`/cases/${c.id}/duplicate`)).case.id}`))}>
                  Duplicate
                </MenuItem>
                <MenuItem icon={<CircleAlert />} onSelect={() => setReviewOpen("on_hold")}>
                  Put on hold
                </MenuItem>
                <Dropdown.Separator className="mx-2 my-1 h-px bg-line" />
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

      <Verdict c={c} assessment={view.assessment} progress={progress} action={action} />

      <div className="mt-10 grid items-start gap-10 xl:grid-cols-[minmax(0,1fr)_480px]">
        <div className="min-w-0 space-y-10">
          <Section id="transaction" title="Shipment" lead={<StepMark progress={progress} section="transaction" n={1} />} description="Origin decides the governing export law; the destination drives every country rule.">
            <Card className="grid grid-cols-2 gap-x-4 gap-y-4 p-5 md:grid-cols-3">
              <Field label="Ships from">
                <CountryPicker value={c.shipFrom} onChange={(v) => set((k) => void (k.shipFrom = v), true)} />
              </Field>
              <Field label="Ultimate destination">
                <CountryPicker value={c.destination} onChange={(v) => set((k) => void ((k.destination = v), v !== "UA" && (k.destinationRegion = "")), true)} placeholder="Choose a country" />
              </Field>
              <Field label="Planned ship date">
                <Input type="date" value={c.shipDate} onChange={(e) => set((k) => void (k.shipDate = e.target.value), true)} />
              </Field>
              {c.destination === "UA" && (
                <Field label="Region within Ukraine">
                  <Select value={c.destinationRegion} onChange={(e) => set((k) => void (k.destinationRegion = e.target.value), true)}>
                    {Object.entries(REGIONS).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <Field label="Contract or PO">
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
              <Field label="Exporter of record">
                <Input value={c.exporter} onChange={(e) => set((k) => void (k.exporter = e.target.value))} placeholder="Legal entity shipping the goods" />
              </Field>
              <Field label="Stated end use" className="col-span-2 md:col-span-3">
                <Textarea rows={2} value={c.endUseDescription} onChange={(e) => set((k) => void (k.endUseDescription = e.target.value))} placeholder="As stated by the customer in the end-use statement or contract" />
              </Field>
            </Card>
          </Section>

          <Section
            id="items"
            title="Goods"
            lead={<StepMark progress={progress} section="items" n={2} />}
            description="Every product, software or technology in the deal."
            actions={
              <>
                <ProductImport onPick={(p) => set((k) => void k.items.push({ ...blankItem(), ...p, id: Math.random().toString(36).slice(2, 10) }), true)} />
                <Button size="sm" icon={<Plus className="size-3.5" />} onClick={addItem}>
                  Add item
                </Button>
              </>
            }
          >
            {c.items.length === 0 ? (
              <Card>
                <Empty title="No goods yet" action={<Button variant="primary" icon={<Plus className="size-3.5" />} onClick={addItem}>Add an item</Button>}>
                  Add each product, software or technology being exported.
                </Empty>
              </Card>
            ) : (
              <div className="space-y-4">
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
          </Section>

          <PartiesCard
            c={c}
            lead={<StepMark progress={progress} section="parties" n={3} />}
            screening={busy === "screen"}
            onChange={(fn, imm) => set(fn, imm)}
            onScreen={screen}
            onDisposition={(partyId, entryId, disposition, n) => run("disp", () => ed.action("/disposition", { partyId, entryId, disposition, note: n }))}
          />

          <QuestionsCard
            c={c}
            assessment={view.assessment}
            lead={<StepMark progress={progress} section="questions" n={4} />}
            questions={view.questions}
            onAnswer={onQuestion}
            onAnswerMany={(ids, v) =>
              set((k) => {
                for (const qid of ids) k.answers[qid] = v;
              }, true)
            }
          />

          <Section id="review" title="Decision" lead={<StepMark progress={progress} section="review" n={5} />} description="Notes and the review trail are printed on the review record.">
            <Card className="p-5">
              <Textarea rows={3} value={c.notes} onChange={(e) => set((k) => void (k.notes = e.target.value))} placeholder="Notes: inquiries made, documents received, reasons for the decision…" />
              <ol className="mt-5 space-y-3">
                {[...c.review].reverse().map((r, i) => (
                  <li key={i} className="flex gap-3 text-[13px]">
                    <span className={cx("mt-1.5 size-2 shrink-0 rounded-full", r.action === "approved" ? "bg-green" : r.action === "rejected" ? "bg-red" : r.action === "submitted" ? "bg-accent" : "bg-fg-3/50")} />
                    <div>
                      <span className="font-medium capitalize">{r.action.replace("_", " ")}</span>
                      <span className="text-fg-3">
                        {r.by && ` by ${r.by}`} · {fmtDate(r.at)}
                        {r.outcome && ` · determination: ${r.outcome.replace(/_/g, " ")}`}
                      </span>
                      {r.note && <div className="mt-0.5 text-fg-2">{r.note}</div>}
                    </div>
                  </li>
                ))}
              </ol>
              {c.status === "draft" && (
                <div className="mt-5 flex items-center justify-between gap-4 border-t border-line pt-4">
                  <span className="text-[13px] text-fg-2">{next && next.id !== "submit" ? `Still to do: ${progress.steps.filter((s) => !s.done && s.id !== "submit" && s.id !== "decide").map((s) => s.label.toLowerCase()).join(", ")}.` : "Everything is in place for a reviewer."}</span>
                  <Button variant={next?.id === "submit" ? "primary" : "secondary"} onClick={() => setReviewOpen("submitted")}>
                    Submit for review
                  </Button>
                </div>
              )}
            </Card>
          </Section>
        </div>

        <aside className="xl:sticky xl:top-8">
          <Section title="How each law applies">
            <div className="scroll-thin xl:max-h-[calc(100vh-110px)] xl:overflow-y-auto">
              <Determination c={c} assessment={view.assessment} onQuestion={onQuestion} />
            </div>
          </Section>
        </aside>
      </div>

      <Dialog
        open={!!reviewOpen}
        onOpenChange={(o) => !o && setReviewOpen(null)}
        title={reviewOpen === "approved" ? "Approve this transaction" : reviewOpen === "rejected" ? "Reject this transaction" : reviewOpen === "on_hold" ? "Put on hold" : "Submit for review"}
        description={
          reviewOpen === "approved"
            ? "The determination and the data versions it relied on are recorded with your decision."
            : reviewOpen === "submitted"
              ? "A reviewer will see the determination, your answers and your notes."
              : undefined
        }
        footer={
          <>
            <Button onClick={() => setReviewOpen(null)}>Cancel</Button>
            <Button
              variant={reviewOpen === "rejected" ? "danger" : "primary"}
              loading={busy === "review"}
              onClick={() =>
                run("review", async () => {
                  await ed.action("/review", { action: reviewOpen, note: note || undefined });
                  setReviewOpen(null);
                  setNote("");
                  toast(reviewOpen === "approved" ? "Approved" : reviewOpen === "submitted" ? "Submitted for review" : "Recorded", { tone: "success" });
                })
              }
            >
              {reviewOpen === "approved" ? "Approve" : reviewOpen === "rejected" ? "Reject" : reviewOpen === "on_hold" ? "Put on hold" : "Submit"}
            </Button>
          </>
        }
      >
        <Field label={reviewOpen === "approved" ? "Conditions and reasons (recorded in the trail)" : "Note"}>
          <Textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} autoFocus placeholder={reviewOpen === "approved" ? "e.g. Approved under License Exception LVS; UVL statement obtained…" : ""} />
        </Field>
      </Dialog>
    </Page>
  );
}

function MenuItem({ icon, children, onSelect, danger }: { icon: React.ReactNode; children: React.ReactNode; onSelect: () => void; danger?: boolean }) {
  return (
    <Dropdown.Item onSelect={onSelect} className={cx("flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13.5px] outline-none data-[highlighted]:bg-accent data-[highlighted]:text-white [&>svg]:size-4", danger ? "text-red-text" : "text-fg")}>
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
        {products.data?.length === 0 && <div className="py-6 text-center text-[13.5px] text-fg-2">No saved products yet. Classify a product and save it to reuse it here.</div>}
        <div className="k-list" style={{ ["--inset" as string]: "4px" }}>
          {products.data?.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                const { id: _id, updatedAt: _u, ...rest } = p;
                onPick(rest);
                setOpen(false);
              }}
              className="flex w-full items-center gap-3 rounded-lg px-1 py-2.5 text-left hover:bg-fill-2"
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

/** Multi-line, auto-growing title field that reads as a heading. */
function TitleInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\n/g, " "))}
      className="block w-full resize-none overflow-hidden rounded-lg bg-transparent text-[28px] font-bold leading-[1.2] tracking-[-0.022em] outline-none focus:bg-fill-2"
      aria-label="Case title"
    />
  );
}
