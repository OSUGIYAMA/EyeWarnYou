// Audit trail: every change, screening disposition, review decision, data sync and AI call, recorded locally.
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ScrollText, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Page } from "../components/AppShell.tsx";
import { Button, Card, Empty, Input, PageHeader, Segmented, Skeleton } from "../components/ui/index.tsx";
import { api } from "../lib/api.ts";
import { cx, relTime } from "../lib/format.ts";

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
  case: "Case",
  product: "Product",
  screening: "Screening",
  settings: "Settings",
  data: "Data sync",
  ai: "AI",
};

const ACTION: Record<string, { label: string; tone?: "red" | "green" | "amber" }> = {
  created: { label: "Created" },
  updated: { label: "Updated" },
  deleted: { label: "Deleted", tone: "red" },
  screened: { label: "Screened parties" },
  batch: { label: "Batch screening" },
  synced: { label: "Data synced" },
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

function humanKey(k: string) {
  return k.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").toLowerCase();
}

function fmtValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "number") return v.toLocaleString("en-US");
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.every((x) => typeof x !== "object" || x === null) ? v.join(", ") : `${v.length} items`;
  return JSON.stringify(v);
}

function DetailChips({ detail }: { detail: unknown }) {
  if (detail === null || detail === undefined) return <span className="text-fg-3">—</span>;
  if (typeof detail !== "object" || Array.isArray(detail))
    return <span className="text-[12px] text-fg-2">{fmtValue(detail)}</span>;
  const entries = Object.entries(detail as Record<string, unknown>).filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (!entries.length) return <span className="text-fg-3">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {entries.map(([k, v]) => {
        const text = fmtValue(v);
        return (
          <span key={k} title={`${k}: ${text}`} className="inline-flex h-5 max-w-[320px] items-center gap-1 rounded-md bg-panel-2 px-1.5 text-[11.5px] ring-1 ring-inset ring-line">
            <span className="shrink-0 text-fg-3">{humanKey(k)}</span>
            <span className="truncate font-medium text-fg-2">{text.length > 80 ? `${text.slice(0, 80)}…` : text}</span>
          </span>
        );
      })}
    </span>
  );
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
    time: d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
  };
}

export function AuditPage() {
  const [limit, setLimit] = useState(PAGE);
  const audit = useQuery({ queryKey: ["audit", limit], queryFn: () => api.get<AuditEvent[]>(`/audit?limit=${limit}`), placeholderData: keepPreviousData });
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

  const entities = [...new Set([...Object.keys(ENTITY), ...Object.keys(counts)])].filter((k) => counts[k]);

  return (
    <Page wide>
      <PageHeader
        title="Audit trail"
        description="Every change to a case or product, every screening disposition and review decision, every data sync and every AI call is recorded in this workspace’s local database. Entries cannot be edited or removed from the app."
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
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
          <Search className="pointer-events-none absolute left-2.5 top-2 size-4 text-fg-3" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setQ("")} placeholder="Filter by actor, action or detail" className="pl-8" aria-label="Filter events" />
        </div>
      </div>

      <Card className="overflow-hidden">
        {audit.isLoading ? (
          <div className="space-y-3 p-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-8" />
            ))}
          </div>
        ) : audit.isError ? (
          <Empty icon={<ScrollText className="size-5" />} title="The audit trail could not be loaded">
            {(audit.error as Error).message}
          </Empty>
        ) : list.length === 0 ? (
          <Empty icon={<ScrollText className="size-5" />} title="Nothing recorded yet">
            Events appear here as soon as you create a case, screen a party, save a product, sync data or use an AI feature.
          </Empty>
        ) : rows.length === 0 ? (
          <Empty icon={<Search className="size-5" />} title="No events match">
            Try another filter.
          </Empty>
        ) : (
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[960px] text-[13px]">
              <thead>
                <tr className="border-b border-line bg-panel-2/60 text-left text-[11.5px] font-medium text-fg-3">
                  <th className="w-[168px] px-4 py-2 font-medium">Time</th>
                  <th className="px-4 py-2 font-medium">Actor</th>
                  <th className="px-4 py-2 font-medium">Entity</th>
                  <th className="px-4 py-2 font-medium">Entity ID</th>
                  <th className="px-4 py-2 font-medium">Action</th>
                  <th className="px-4 py-2 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((e) => {
                  const t = fmtTime(e.at);
                  const a = ACTION[e.action];
                  return (
                    <tr key={e.id} className="align-top transition-colors hover:bg-panel-2/40">
                      <td className="whitespace-nowrap px-4 py-2.5 tabular" title={`${e.at} · ${relTime(e.at)}`}>
                        <span className="text-fg-2">{t.date}</span> <span className="text-fg-3">{t.time}</span>
                      </td>
                      <td className="max-w-[160px] truncate px-4 py-2.5 text-fg-2">{e.actor || <span className="text-fg-3">—</span>}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-fg-2">{ENTITY[e.entity] ?? e.entity}</td>
                      <td className="px-4 py-2.5">
                        {!e.entity_id ? (
                          <span className="text-fg-3">—</span>
                        ) : e.entity === "case" ? (
                          <Link to={`/cases/${e.entity_id}`} className="font-mono text-[12px] text-accent-text hover:underline">
                            {e.entity_id}
                          </Link>
                        ) : (
                          <span className="font-mono text-[12px] text-fg-2">{e.entity_id}</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5" title={e.action}>
                        <span className="inline-flex items-center gap-1.5">
                          {a?.tone && <span className={cx("size-1.5 rounded-full", TONE_DOT[a.tone])} />}
                          <span className={cx(a ? "text-fg" : "font-mono text-[12px] text-fg")}>{a?.label ?? e.action}</span>
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <DetailChips detail={e.detail} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {list.length > 0 && (
        <div className="mt-3 flex items-center justify-between text-[12px] text-fg-3">
          <span className="tabular">
            Showing the latest {list.length.toLocaleString("en-US")} event{list.length === 1 ? "" : "s"}
            {rows.length !== list.length && ` · ${rows.length} match the filter`}
          </span>
          {list.length >= limit && (
            <Button size="sm" variant="secondary" loading={audit.isFetching} onClick={() => setLimit((l) => l + PAGE)}>
              Load older events
            </Button>
          )}
        </div>
      )}
    </Page>
  );
}
