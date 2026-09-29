import { useQuery } from "@tanstack/react-query";
import { FolderKanban, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Page } from "../components/AppShell.tsx";
import { CountryName } from "../components/CountryPicker.tsx";
import { Button, Card, Empty, Input, OutcomePill, Segmented, Skeleton } from "../components/ui/index.tsx";
import { api, type CaseSummary } from "../lib/api.ts";
import { cx, fmtDate, relTime, STATUS_LABEL } from "../lib/format.ts";

const STATUS_TONE: Record<string, string> = {
  draft: "text-fg-2",
  in_review: "text-accent-text",
  approved: "text-green-text",
  rejected: "text-red-text",
  on_hold: "text-amber-text",
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
  return (
    <Page wide>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Cases</h1>
          <p className="mt-1 text-[13.5px] text-fg-2">Each case is one transaction, assessed under every regime that attaches to it.</p>
        </div>
        <Link to="/cases/new">
          <Button variant="primary" icon={<Plus className="size-3.5" />}>
            New case
          </Button>
        </Link>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented
          value={status}
          onChange={(v) => setParams(v === "all" ? {} : { status: v })}
          options={[
            { value: "all", label: "All" },
            { value: "open", label: "Open" },
            { value: "in_review", label: "In review" },
            { value: "approved", label: "Approved" },
            { value: "rejected", label: "Rejected" },
          ]}
        />
        <div className="relative ml-auto w-72">
          <Search className="absolute left-2.5 top-2 size-4 text-fg-3" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by reference, title, country" className="pl-8" />
        </div>
      </div>
      <Card className="overflow-hidden">
        {cases.isLoading ? (
          <div className="space-y-3 p-4">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-9" />)}</div>
        ) : rows.length === 0 ? (
          <Empty icon={<FolderKanban className="size-5" />} title={cases.data?.length ? "No cases match" : "No cases yet"}>
            {cases.data?.length ? "Try another filter." : "Create a case from scratch or from a contract / purchase order."}
          </Empty>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-line bg-panel-2/60 text-left text-[11.5px] font-medium text-fg-3">
                <th className="px-4 py-2 font-medium">Reference</th>
                <th className="px-4 py-2 font-medium">Title</th>
                <th className="px-4 py-2 font-medium">Destination</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Determination</th>
                <th className="px-4 py-2 text-right font-medium">Items</th>
                <th className="px-4 py-2 text-right font-medium">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((c) => (
                <tr key={c.id} className="group cursor-pointer transition-colors hover:bg-panel-2/50" onClick={() => (window.location.href = `/cases/${c.id}`)}>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-fg-3">
                    <Link to={`/cases/${c.id}`} onClick={(e) => e.stopPropagation()}>
                      {c.ref}
                    </Link>
                  </td>
                  <td className="max-w-[360px] truncate px-4 py-2.5 font-medium">{c.title}</td>
                  <td className="px-4 py-2.5">
                    <CountryName iso2={c.destination} />
                  </td>
                  <td className={cx("px-4 py-2.5", STATUS_TONE[c.status])}>{STATUS_LABEL[c.status]}</td>
                  <td className="px-4 py-2.5">{c.outcome ? <OutcomePill outcome={c.outcome} size="sm" /> : <span className="text-fg-3">—</span>}</td>
                  <td className="px-4 py-2.5 text-right tabular text-fg-2">{c.itemCount}</td>
                  <td className="px-4 py-2.5 text-right text-fg-3" title={fmtDate(c.updatedAt)}>
                    {relTime(c.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </Page>
  );
}
