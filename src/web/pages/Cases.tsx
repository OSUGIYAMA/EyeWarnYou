import { useQuery } from "@tanstack/react-query";
import { FolderClosed, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Page } from "../components/AppShell.tsx";
import { CountryName } from "../components/CountryPicker.tsx";
import { Button, Card, Empty, Input, OutcomePill, PageHeader, Segmented, Skeleton } from "../components/ui/index.tsx";
import { api, type CaseSummary } from "../lib/api.ts";
import { cx, fmtDate, relTime, STATUS_LABEL } from "../lib/format.ts";

const STATUS_TONE: Record<string, string> = {
  draft: "text-fg-2",
  in_review: "text-accent-text",
  approved: "text-green-text",
  rejected: "text-red-text",
  on_hold: "text-orange-text",
};

export function CasesPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "all";
  const [q, setQ] = useState("");
  const cases = useQuery({ queryKey: ["cases"], queryFn: () => api.get<CaseSummary[]>("/cases") });
  const rows = useMemo(
    () =>
      (cases.data ?? []).filter(
        (c) => (status === "all" || (status === "open" ? c.status === "draft" || c.status === "in_review" : c.status === status)) && (!q || `${c.ref} ${c.title} ${c.destination}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [cases.data, status, q],
  );
  const count = (v: string) => (cases.data ?? []).filter((c) => v === "all" || (v === "open" ? c.status === "draft" || c.status === "in_review" : c.status === v)).length;
  return (
    <Page wide>
      <PageHeader
        title="Cases"
        description="Each case is one transaction, assessed under every law that reaches it."
        actions={
          <Link to="/cases/new">
            <Button variant="primary" icon={<Plus className="size-4" />}>
              New case
            </Button>
          </Link>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented
          value={status}
          onChange={(v) => setParams(v === "all" ? {} : { status: v })}
          options={[
            { value: "all", label: <>All <span className="tabular text-fg-3">{count("all")}</span></> },
            { value: "open", label: <>Open <span className="tabular text-fg-3">{count("open")}</span></> },
            { value: "in_review", label: "In review" },
            { value: "approved", label: "Approved" },
            { value: "rejected", label: "Rejected" },
          ]}
        />
        <div className="relative ml-auto w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search cases" className="pl-9" />
        </div>
      </div>
      <Card className="overflow-hidden">
        {cases.isLoading ? (
          <div className="space-y-3 p-4">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : rows.length === 0 ? (
          <Empty
            icon={<FolderClosed />}
            title={cases.data?.length ? "No cases match" : "No cases yet"}
            action={
              cases.data?.length ? undefined : (
                <Link to="/cases/new">
                  <Button variant="primary">Start a case</Button>
                </Link>
              )
            }
          >
            {cases.data?.length ? "Try another filter or search." : "A case is one transaction: the goods, where they go, and who is involved."}
          </Empty>
        ) : (
          <>
            <div className="grid grid-cols-[minmax(0,1fr)_180px_200px_90px] gap-4 border-b border-line px-5 py-2 text-[12px] font-medium text-fg-3">
              <span>Transaction</span>
              <span>Determination</span>
              <span>Next</span>
              <span className="text-right">Updated</span>
            </div>
            <div className="k-list" style={{ ["--inset" as string]: "20px" }}>
              {rows.map((c) => {
                const next = c.progress?.next;
                const open = c.status === "draft";
                return (
                  <Link key={c.id} to={`/cases/${c.id}${open && next ? `#${next.anchor}` : ""}`} className="grid grid-cols-[minmax(0,1fr)_180px_200px_90px] items-center gap-4 px-5 py-3 transition-colors hover:bg-fill-2">
                    <div className="min-w-0">
                      <div className="truncate text-[14.5px] font-medium">{c.title}</div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-fg-3">
                        <span className="tabular">{c.ref}</span>
                        <span>·</span>
                        <CountryName iso2={c.destination} withCode={false} />
                        <span>·</span>
                        <span>
                          {c.itemCount} item{c.itemCount === 1 ? "" : "s"}
                        </span>
                      </div>
                    </div>
                    <div>{c.outcome ? <OutcomePill outcome={c.outcome} size="sm" /> : <span className="text-fg-3">—</span>}</div>
                    <div className={cx("truncate text-[13px]", open ? "font-medium text-accent-text" : STATUS_TONE[c.status])}>{open ? (next?.label ?? "Draft") : STATUS_LABEL[c.status]}</div>
                    <div className="text-right text-[12.5px] text-fg-3" title={fmtDate(c.updatedAt)}>
                      {relTime(c.updatedAt)}
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </Card>
    </Page>
  );
}
