// Audit trail: every change, screening disposition, review decision, data sync and AI call, recorded locally.
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ScrollText, Search } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Page } from "../components/AppShell.tsx";
import { Button, Card, Empty, Input, PageHeader, Section, Segmented, Skeleton } from "../components/ui/index.tsx";
import { api, type CaseSummary } from "../lib/api.ts";
import { cx, LIST_NAMES, relTime } from "../lib/format.ts";

interface AuditEvent {
  id: number;
  at: string;
  actor: string | null;
  entity: string;
  entity_id: string | null;
  action: string;
  detail: unknown;
}

const PAGE = 300;

const ENTITY: Record<string, string> = {
  case: "Cases",
  product: "Products",
  screening: "Screening",
  settings: "Settings",
  data: "Data",
  ai: "AI",
};

const ACTION: Record<string, { label: string; tone?: "red" | "green" | "amber" }> = {
  created: { label: "Created" },
  updated: { label: "Updated" },
  deleted: { label: "Deleted", tone: "red" },
  screened: { label: "Screened parties" },
  batch: { label: "Batch screening" },
  synced: { label: "Data synced" },
  "sample-cases": { label: "Added sample cases" },
  "hit.cleared": { label: "Hit cleared (false positive)", tone: "green" },
  "hit.confirmed": { label: "Hit confirmed as a match", tone: "red" },
  "hit.pending": { label: "Hit reset to pending", tone: "amber" },
  "review.submitted": { label: "Submitted for review" },
  "review.approved": { label: "Approved", tone: "green" },
  "review.rejected": { label: "Rejected", tone: "red" },
  "review.on_hold": { label: "Put on hold", tone: "amber" },
  "review.reopened": { label: "Reopened" },
  "review.comment": { label: "Commented" },
};
const TONE_DOT = { red: "bg-red", green: "bg-green", amber: "bg-amber" } as const;

const AI_FEATURE: Record<string, string> = {
  classify: "Drafted a classification",
  "classify.plan": "Planned a classification search",
  ask: "Answered a question",
  extract: "Read a document",
  romanize: "Romanized a name",
};

function humanKey(k: string) {
  return k.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").toLowerCase();
}

function fmtValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "number") return v.toLocaleString("en-US");
  if (typeof v === "string") {
    // Screening entry ids are "<LIST>:<hash>" — show the list name and a short hash.
    const m = v.match(/^([A-Z][A-Z-]+):([0-9a-f]{12,})$/);
    return m ? `${LIST_NAMES[m[1]]?.name ?? m[1]} · ${m[2].slice(0, 8)}` : v;
  }
  if (Array.isArray(v)) return v.every((x) => typeof x !== "object" || x === null) ? v.join(", ") : `${v.length} items`;
  return JSON.stringify(v);
}

const CASE_PHRASE: Record<string, (target: ReactNode) => ReactNode> = {
  created: (t) => <>Created case {t}</>,
  updated: (t) => <>Updated case {t}</>,
  deleted: (t) => <>Deleted case {t}</>,
  screened: (t) => <>Screened the parties on {t}</>,
  "hit.cleared": (t) => <>Cleared a screening hit on {t} as a false positive</>,
  "hit.confirmed": (t) => <>Confirmed a screening hit on {t} as a match</>,
  "hit.pending": (t) => <>Reset a screening hit on {t} to pending</>,
  "review.submitted": (t) => <>Submitted {t} for review</>,
  "review.approved": (t) => <>Approved {t}</>,
  "review.rejected": (t) => <>Rejected {t}</>,
  "review.on_hold": (t) => <>Put {t} on hold</>,
  "review.reopened": (t) => <>Reopened {t}</>,
  "review.comment": (t) => <>Commented on {t}</>,
};

/** What happened, in words: "Created case EWY-2026-0005", "Updated settings". */
function describe(e: AuditEvent, refs: Map<string, string>): { title: ReactNode; lead?: string; skip: string[] } {
  const d = (e.detail && typeof e.detail === "object" && !Array.isArray(e.detail) ? e.detail : {}) as Record<string, unknown>;
  const label = ACTION[e.action]?.label;
  switch (e.entity) {
    case "case": {
      const ref = typeof d.ref === "string" ? d.ref : e.entity_id ? refs.get(e.entity_id) : undefined;
      const text = ref ?? <span className="font-mono text-[12.5px]">{e.entity_id ?? "—"}</span>;
      const target = e.entity_id && e.action !== "deleted" ? (
        <Link to={`/cases/${e.entity_id}`} className="text-accent-text hover:underline">
          {text}
        </Link>
      ) : (
        text
      );
      const phrase = CASE_PHRASE[e.action];
      return { title: phrase ? phrase(target) : <>{label ?? e.action} · {target}</>, lead: typeof d.title === "string" ? d.title : typeof d.name === "string" ? d.name : undefined, skip: ["ref", "title", "name"] };
    }
    case "product":
      return { title: <>{label ?? e.action} product</>, lead: typeof d.name === "string" ? d.name : undefined, skip: ["name"] };
    case "settings":
      return { title: <>{label ?? e.action} settings</>, skip: [] };
    case "data":
      return { title: e.action === "synced" ? "Updated regulatory data" : (label ?? e.action), skip: [] };
    case "ai":
      return { title: AI_FEATURE[e.action] ?? `AI: ${e.action}`, skip: [] };
    case "screening":
      return { title: e.action === "batch" ? "Screened a batch of parties" : (label ?? e.action), skip: [] };
    default:
      return { title: <>{label ?? e.action}{e.entity_id ? <span className="font-mono text-[12.5px] text-fg-2"> {e.entity_id}</span> : null}</>, skip: [] };
  }
}

const plural = (n: unknown, one: string, many: string) => (typeof n === "number" ? `${n.toLocaleString("en-US")} ${n === 1 ? one : many}` : null);

/** Readable summaries for the events whose detail is just counts or field names. */
const DETAIL: Record<string, (d: Record<string, unknown>) => string | null> = {
  "case.screened": (d) => [plural(d.parties, "party", "parties"), plural(d.hits, "potential match", "potential matches")].filter(Boolean).join(" · "),
  "screening.batch": (d) => [plural(d.rows, "row", "rows"), typeof d.withHits === "number" ? `${d.withHits.toLocaleString("en-US")} with potential matches` : null].filter(Boolean).join(" · "),
  "settings.updated": (d) => (Array.isArray(d.fields) ? `Changed ${d.fields.map((f) => humanKey(String(f)).replace("(redacted)", "")).join(", ")}` : null),
  "case.updated": (d) => (Array.isArray(d.fields) ? `Changed ${d.fields.map((f) => humanKey(String(f))).join(", ")}` : null),
  "data.sample-cases": (d) => plural(d.count, "case", "cases"),
  "data.synced": (d) => [typeof d.targets === "string" ? d.targets.split(",").map((t) => ({ ear: "EAR", jp: "Japan", screening: "screening lists" })[t] ?? t).join(", ") : null, plural(d.changes, "change", "changes")].filter(Boolean).join(" · "),
};

function detailLine(e: AuditEvent, skip: string[]): string {
  const detail = e.detail;
  if (detail === null || detail === undefined) return "";
  const special = typeof detail === "object" && !Array.isArray(detail) ? (DETAIL[`${e.entity}.${e.action}`] ?? (e.entity === "ai" ? aiDetail : null)) : null;
  if (special) {
    const text = special(detail as Record<string, unknown>);
    if (text) return text;
  }
  if (typeof detail !== "object" || Array.isArray(detail)) return fmtValue(detail);
  return Object.entries(detail as Record<string, unknown>)
    .filter(([k, v]) => !skip.includes(k) && v !== undefined && v !== null && v !== "")
    .map(([k, v]) => {
      const t = fmtValue(v);
      return `${humanKey(k)} ${t.length > 80 ? `${t.slice(0, 80)}…` : t}`;
    })
    .join(" · ");
}

function aiDetail(d: Record<string, unknown>): string | null {
  const tokens = [typeof d.input === "number" ? `${d.input.toLocaleString("en-US")} in` : null, typeof d.output === "number" ? `${d.output.toLocaleString("en-US")} out` : null].filter(Boolean).join(" / ");
  return [typeof d.model === "string" ? d.model : null, tokens && `${tokens} tokens`].filter(Boolean).join(" · ") || null;
}

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (dayKey(iso) === dayKey(today.toISOString())) return "Today";
  if (dayKey(iso) === dayKey(yesterday.toISOString())) return "Yesterday";
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", ...(d.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}) });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function AuditPage() {
  const [limit, setLimit] = useState(PAGE);
  const audit = useQuery({ queryKey: ["audit", limit], queryFn: () => api.get<AuditEvent[]>(`/audit?limit=${limit}`), placeholderData: keepPreviousData });
  // Case references read better than ids; the list is already cached by the rest of the app.
  const cases = useQuery({ queryKey: ["cases"], queryFn: () => api.get<CaseSummary[]>("/cases") });
  const refs = useMemo(() => new Map((cases.data ?? []).map((c) => [c.id, c.ref])), [cases.data]);
  const [params, setParams] = useSearchParams();
  const entity = params.get("entity") ?? "all";
  const [q, setQ] = useState("");

  const list = audit.data ?? [];
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of list) m[e.entity] = (m[e.entity] ?? 0) + 1;
    return m;
  }, [list]);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return list.filter(
      (e) =>
        (entity === "all" || e.entity === entity) &&
        (!s || `${e.actor ?? ""} ${e.action} ${ACTION[e.action]?.label ?? ""} ${e.entity_id ?? ""} ${JSON.stringify(e.detail ?? "")}`.toLowerCase().includes(s)),
    );
  }, [list, entity, q]);
  const days = useMemo(() => {
    const out: { key: string; label: string; events: AuditEvent[] }[] = [];
    for (const e of rows) {
      const k = dayKey(e.at);
      if (out.at(-1)?.key !== k) out.push({ key: k, label: dayLabel(e.at), events: [] });
      out.at(-1)!.events.push(e);
    }
    return out;
  }, [rows]);

  const entities = [...new Set([...Object.keys(ENTITY), ...Object.keys(counts)])].filter((k) => counts[k]);

  return (
    <Page>
      <PageHeader title="Audit trail" description="Who did what, and when. Entries are kept in this workspace’s database and cannot be edited from the app." />

      <div className="mb-8 flex flex-wrap items-center gap-3">
        <Segmented
          value={entity}
          onChange={(v) => setParams(v === "all" ? {} : { entity: v }, { replace: true })}
          options={[
            { value: "all", label: <>All <span className="tabular text-fg-3">{list.length}</span></> },
            ...entities.map((k) => ({
              value: k,
              label: (
                <>
                  {ENTITY[k] ?? k} <span className="tabular text-fg-3">{counts[k]}</span>
                </>
              ),
            })),
          ]}
        />
        <div className="relative ml-auto w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setQ("")} placeholder="Search events" className="pl-9" aria-label="Filter events" />
        </div>
      </div>

      {audit.isLoading ? (
        <Card className="space-y-3 p-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-9" />
          ))}
        </Card>
      ) : audit.isError ? (
        <Card>
          <Empty icon={<ScrollText />} title="The audit trail could not be loaded">
            {(audit.error as Error).message}
          </Empty>
        </Card>
      ) : list.length === 0 ? (
        <Card>
          <Empty icon={<ScrollText />} title="Nothing recorded yet">
            Events appear as soon as you create a case, screen a party, save a product or sync data.
          </Empty>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <Empty icon={<Search />} title="No events match">
            Try another filter or search.
          </Empty>
        </Card>
      ) : (
        <div className="space-y-8">
          {days.map((day) => (
            <Section key={day.key} title={day.label}>
              <Card className="k-list overflow-hidden" style={{ ["--inset" as string]: "88px" }}>
                {day.events.map((e) => (
                  <EventRow key={e.id} e={e} refs={refs} />
                ))}
              </Card>
            </Section>
          ))}
        </div>
      )}

      {list.length > 0 && (
        <div className="mt-4 flex items-center justify-between gap-4 px-1 text-[12.5px] text-fg-3">
          <span className="tabular">
            {rows.length !== list.length ? `${rows.length.toLocaleString("en-US")} of the latest ${list.length.toLocaleString("en-US")} events` : `The latest ${list.length.toLocaleString("en-US")} event${list.length === 1 ? "" : "s"}`}
          </span>
          {list.length >= limit && (
            <Button size="sm" loading={audit.isFetching} onClick={() => setLimit((l) => l + PAGE)}>
              Load older events
            </Button>
          )}
        </div>
      )}
    </Page>
  );
}

function EventRow({ e, refs }: { e: AuditEvent; refs: Map<string, string> }) {
  const { title, lead, skip } = describe(e, refs);
  const detail = detailLine(e, skip);
  const tone = ACTION[e.action]?.tone;
  return (
    <div className="grid grid-cols-[56px_minmax(0,1fr)_auto] gap-x-4 px-5 py-3">
      <span className="pt-px text-[13px] tabular text-fg-3" title={`${new Date(e.at).toLocaleString("en-GB")} · ${relTime(e.at)}`}>
        {fmtTime(e.at)}
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-[14px]">
          {tone && <span className={cx("size-2 shrink-0 rounded-full", TONE_DOT[tone])} />}
          <span className="min-w-0 truncate" title={e.action}>
            {title}
          </span>
        </div>
        {lead && <div className="mt-0.5 truncate text-[13px] text-fg-2">{lead}</div>}
        {detail && (
          <div className="mt-0.5 truncate text-[12.5px] text-fg-3" title={detail}>
            {detail}
          </div>
        )}
      </div>
      <span className="max-w-[180px] truncate pt-px text-right text-[13px] text-fg-2">{e.actor || <span className="text-fg-3">System</span>}</span>
    </div>
  );
}
