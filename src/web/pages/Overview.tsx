import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Database, FolderKanban, Info, Plus, ScanSearch } from "lucide-react";
import { Link } from "react-router-dom";
import { Page, useMeta } from "../components/AppShell.tsx";
import { CountryName } from "../components/CountryPicker.tsx";
import { Badge, Button, Card, CardHeader, Empty, OutcomePill, Skeleton } from "../components/ui/index.tsx";
import { api, type CaseSummary, type ChangeEntry } from "../lib/api.ts";
import { cx, daysBetween, fmtDate, relTime, STATUS_LABEL } from "../lib/format.ts";

export function OverviewPage() {
  const meta = useMeta();
  const cases = useQuery({ queryKey: ["cases"], queryFn: () => api.get<CaseSummary[]>("/cases") });
  const history = useQuery({ queryKey: ["screen-history"], queryFn: () => api.get<{ at: string; hit_count: number }[]>("/screen/history") });
  const updates = useQuery({ queryKey: ["updates"], queryFn: () => api.get<ChangeEntry[]>("/updates") });
  const today = new Date().toISOString().slice(0, 10);

  const list = cases.data ?? [];
  const open = list.filter((c) => c.status === "draft" || c.status === "in_review");
  const review = list.filter((c) => c.status === "in_review");
  const blocked = open.filter((c) => c.outcome === "license_required" || c.outcome === "prohibited");
  const month = (history.data ?? []).filter((h) => Date.now() - Date.parse(h.at) < 30 * 86_400_000);
  const name = meta.data?.settings.userName?.split(" ")[0];

  return (
    <Page>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[12.5px] text-fg-3">{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
          <h1 className="mt-0.5 text-[22px] font-semibold tracking-tight">{name ? `Welcome back, ${name}` : "Overview"}</h1>
        </div>
        <div className="flex gap-2">
          <Link to="/screening">
            <Button icon={<ScanSearch className="size-3.5" />}>Screen a party</Button>
          </Link>
          <Link to="/cases/new">
            <Button variant="primary" icon={<Plus className="size-3.5" />}>
              New case
            </Button>
          </Link>
        </div>
      </div>

      {meta.data?.policyStatus.map((p) => {
        const days = p.effectiveFrom ? daysBetween(today, p.effectiveFrom) : null;
        const upcoming = days !== null && days > 0;
        return (
          <div key={p.id} className={cx("mb-3 flex gap-3 rounded-xl border px-4 py-3", upcoming ? "border-amber/30 bg-amber-soft" : "border-line bg-panel")}>
            {upcoming ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-text" /> : <Info className="mt-0.5 size-4 shrink-0 text-fg-3" />}
            <div className="min-w-0 text-[13px]">
              <div className="font-medium">
                {p.title}
                {upcoming && (
                  <span className="ml-2 text-amber-text">
                    — re-applies {fmtDate(p.effectiveFrom)} ({days} day{days === 1 ? "" : "s"})
                  </span>
                )}
                {p.state === "not_enforced" && <span className="ml-2 font-normal text-fg-3">— on the books, not enforced</span>}
              </div>
              <div className="mt-0.5 text-fg-2">{p.summary}</div>
            </div>
          </div>
        );
      })}

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Open cases" value={open.length} loading={cases.isLoading} to="/cases" />
        <Stat label="Awaiting review" value={review.length} loading={cases.isLoading} to="/cases?status=in_review" />
        <Stat label="Open cases needing a license" value={blocked.length} loading={cases.isLoading} tone={blocked.length ? "orange" : undefined} to="/cases" />
        <Stat label="Screenings, last 30 days" value={month.length} sub={`${month.filter((h) => h.hit_count > 0).length} with potential matches`} loading={history.isLoading} to="/screening" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader title="Recent cases" icon={<FolderKanban className="size-4" />} actions={<Link to="/cases" className="text-[12.5px] font-medium text-accent-text hover:underline">View all</Link>} />
          {cases.isLoading ? (
            <div className="space-y-3 p-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : list.length === 0 ? (
            <Empty
              icon={<FolderKanban className="size-5" />}
              title="No cases yet"
              action={
                <Link to="/cases/new">
                  <Button variant="primary" icon={<Plus className="size-3.5" />}>
                    Start a case
                  </Button>
                </Link>
              }
            >
              A case is one transaction: the goods, the destination, the parties and the questions a reviewer must answer. Kanmon works out which regimes attach and what each requires.
            </Empty>
          ) : (
            <div className="divide-y divide-line">
              {list.slice(0, 7).map((c) => (
                <Link key={c.id} to={`/cases/${c.id}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-panel-2/60">
                  <span className="w-[92px] shrink-0 font-mono text-[12px] text-fg-3">{c.ref}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-medium">{c.title}</div>
                    <div className="flex items-center gap-2 text-[12px] text-fg-3">
                      <CountryName iso2={c.destination} withCode={false} />
                      <span>·</span>
                      {STATUS_LABEL[c.status]}
                      <span>·</span>
                      {relTime(c.updatedAt)}
                    </div>
                  </div>
                  {c.outcome && <OutcomePill outcome={c.outcome} size="sm" />}
                </Link>
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Data sources" icon={<Database className="size-4" />} actions={<Link to="/settings#data" className="text-[12.5px] font-medium text-accent-text hover:underline">Update</Link>} />
            <div className="divide-y divide-line text-[12.5px]">
              {meta.data ? (
                [
                  { label: "US EAR (eCFR)", stamp: meta.data.stamps.ccl },
                  { label: "Japan — 輸出令 / 貨物等省令", stamp: meta.data.stamps.jp },
                  ...meta.data.stamps.screening.map((s) => ({ label: /METI/.test(s.source) ? "METI End User List" : /MOFCOM/.test(s.source) ? "China — MOFCOM designations" : "US Consolidated Screening List", stamp: s })),
                ].map((r) => (
                  <div key={r.label} className="flex items-center justify-between gap-3 px-4 py-2">
                    <span className="text-fg-2">{r.label}</span>
                    <span className="tabular text-fg">{fmtDate(r.stamp.asOf)}</span>
                  </div>
                ))
              ) : (
                <div className="space-y-2 p-4">{[1, 2, 3].map((i) => <Skeleton key={i} />)}</div>
              )}
              {meta.data && !meta.data.stamps.screening.some((s) => /Consolidated/.test(s.source)) && (
                <div className="px-4 py-2.5 text-amber-text">US screening lists not downloaded — open Settings → Data.</div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Detected changes" subtitle="Differences between consecutive syncs of the regulation data" actions={<Link to="/regulations/updates" className="text-[12.5px] font-medium text-accent-text hover:underline">All</Link>} />
            {(updates.data ?? []).length === 0 ? (
              <div className="px-4 py-5 text-[12.5px] text-fg-3">No changes recorded yet. Changes to the CCL, Country Chart, Country Groups, Japanese country lists and screening lists appear here after each data update.</div>
            ) : (
              <div className="divide-y divide-line">
                {updates.data!.slice(0, 6).map((u, i) => (
                  <div key={i} className="px-4 py-2.5">
                    <div className="flex items-center gap-2 text-[13px] font-medium">
                      <span className={cx("size-1.5 rounded-full", u.severity === "high" ? "bg-orange" : u.severity === "medium" ? "bg-amber" : "bg-fg-3")} />
                      {u.title}
                    </div>
                    {u.detail && <div className="mt-0.5 line-clamp-2 text-[12px] text-fg-3">{u.detail}</div>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </Page>
  );
}

function Stat({ label, value, sub, loading, tone, to }: { label: string; value: number; sub?: string; loading?: boolean; tone?: "orange"; to: string }) {
  return (
    <Link to={to} className="group rounded-xl border border-line bg-panel px-4 py-3.5 shadow-card transition-colors hover:border-line-strong">
      <div className="text-[12px] text-fg-3">{label}</div>
      {loading ? <Skeleton className="mt-2 h-7 w-12" /> : <div className={cx("mt-1 text-[26px] font-semibold tabular tracking-tight", tone === "orange" && value > 0 && "text-orange-text")}>{value}</div>}
      <div className="flex items-center justify-between text-[11.5px] text-fg-3">
        <span>{sub ?? " "}</span>
        <ArrowRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
    </Link>
  );
}

export { Badge };
