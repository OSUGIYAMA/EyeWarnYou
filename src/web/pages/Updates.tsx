// Regulatory updates: structural changes detected between consecutive data syncs.
import { useQuery } from "@tanstack/react-query";
import { History, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Page, useMeta } from "../components/AppShell.tsx";
import { CountryName } from "../components/CountryPicker.tsx";
import { Badge, Button, Card, Empty, PageHeader, Segmented, Skeleton } from "../components/ui/index.tsx";
import { api, type ChangeEntry } from "../lib/api.ts";
import { cx, fmtDate, relTime, type Tone } from "../lib/format.ts";

const KINDS: Record<string, { label: string; tone: Tone }> = {
  ccl: { label: "CCL", tone: "blue" },
  chart: { label: "Country Chart", tone: "orange" },
  groups: { label: "Country Groups", tone: "amber" },
  "jp-countries": { label: "Japan lists", tone: "violet" },
  screening: { label: "Screening", tone: "gray" },
};

const SEVERITY: Record<ChangeEntry["severity"], { dot: string; label: string }> = {
  high: { dot: "bg-orange", label: "High impact" },
  medium: { dot: "bg-amber", label: "Medium impact" },
  low: { dot: "bg-fg-3", label: "Low impact" },
};

const ECCN_RE = /^\d[A-E]\d{3}$/;
const ISO_RE = /^[A-Z]{2}$/;

function Refs({ refs, kind }: { refs: string[]; kind: string }) {
  const [all, setAll] = useState(false);
  if (kind === "screening") {
    return <div className="mt-1.5 text-[11.5px] tabular text-fg-3">{refs.length} list entr{refs.length === 1 ? "y" : "ies"} affected</div>;
  }
  const shown = all ? refs : refs.slice(0, 12);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1">
      {shown.map((r) =>
        ECCN_RE.test(r) ? (
          <Link key={r} to={`/regulations/ccl/${r}`} className="rounded bg-panel-2 px-1.5 py-0.5 font-mono text-[11.5px] text-fg-2 ring-1 ring-line transition-colors hover:text-fg hover:ring-line-strong">
            {r}
          </Link>
        ) : ISO_RE.test(r) ? (
          <Link key={r} to={`/regulations/countries/${r}`} className="rounded-md bg-panel px-1.5 py-0.5 text-[12px] ring-1 ring-line transition-colors hover:bg-panel-2 hover:ring-line-strong">
            <CountryName iso2={r} />
          </Link>
        ) : (
          <span key={r} className="rounded bg-panel-2 px-1.5 py-0.5 font-mono text-[11.5px] text-fg-3 ring-1 ring-line">
            {r}
          </span>
        ),
      )}
      {refs.length > 12 && (
        <button type="button" onClick={() => setAll((a) => !a)} className="px-1 text-[12px] font-medium text-accent-text hover:underline">
          {all ? "Show fewer" : `+${refs.length - 12} more`}
        </button>
      )}
    </div>
  );
}

function Detail({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 260;
  return (
    <div className="mt-0.5">
      <div className={cx("text-[12.5px] leading-relaxed text-fg-2", long && !open && "line-clamp-2")}>{text}</div>
      {long && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="text-[12px] font-medium text-accent-text hover:underline">
          {open ? "Show less" : "Show all"}
        </button>
      )}
    </div>
  );
}

export function UpdatesPage() {
  const meta = useMeta();
  const updates = useQuery({ queryKey: ["updates"], queryFn: () => api.get<ChangeEntry[]>("/updates") });
  const [params, setParams] = useSearchParams();
  const kind = params.get("kind") ?? "all";

  const list = updates.data ?? [];
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const u of list) m[u.kind] = (m[u.kind] ?? 0) + 1;
    return m;
  }, [list]);
  const days = useMemo(() => {
    const rows = list.filter((u) => kind === "all" || u.kind === kind);
    const m = new Map<string, ChangeEntry[]>();
    for (const u of rows) {
      const d = u.detectedAt?.slice(0, 10) ?? "";
      const g = m.get(d) ?? [];
      g.push(u);
      m.set(d, g);
    }
    const rank = { high: 0, medium: 1, low: 2 } as const;
    return [...m.entries()].sort((a, b) => (a[0] === "" ? 1 : b[0] === "" ? -1 : b[0].localeCompare(a[0]))).map(([d, us]) => [d, [...us].sort((a, b) => rank[a.severity] - rank[b.severity])] as const);
  }, [list, kind]);

  const high = list.filter((u) => u.severity === "high").length;
  const lastSync = meta.data?.manifest?.generatedAt;

  return (
    <Page>
      <PageHeader
        title="Regulatory updates"
        description="Each data sync is compared with the previous snapshot. Changes to the Commerce Control List, the Country Chart, the Country Groups, Japan’s country lists and the screening lists are recorded here."
        actions={
          <Link to="/settings#data">
            <Button icon={<RefreshCw className="size-3.5" />}>Sync data</Button>
          </Link>
        }
      />

      {updates.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <Card>
          <Empty
            icon={<History className="size-5" />}
            title="No changes recorded yet"
            action={
              <Link to="/settings#data">
                <Button variant="primary" icon={<RefreshCw className="size-3.5" />}>
                  Open Settings → Data
                </Button>
              </Link>
            }
          >
            Updates appear after you run a data sync from Settings → Data. The first sync establishes the baseline; each later sync is compared with it and every difference is listed here.
            {lastSync && <span className="mt-2 block text-[12px]">Last sync {relTime(lastSync)}.</span>}
          </Empty>
        </Card>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <Segmented
              value={kind}
              onChange={(v) => setParams(v === "all" ? {} : { kind: v }, { replace: true })}
              options={[
                { value: "all", label: <>All <span className="tabular text-fg-3">{list.length}</span></> },
                ...Object.entries(KINDS)
                  .filter(([k]) => counts[k])
                  .map(([k, v]) => ({
                    value: k,
                    label: (
                      <>
                        {v.label} <span className="tabular text-fg-3">{counts[k]}</span>
                      </>
                    ),
                  })),
              ]}
            />
            <div className="flex items-center gap-3 text-[12px] text-fg-3">
              {high > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-orange" />
                  <span className="tabular">{high}</span> high impact
                </span>
              )}
              {lastSync && <span>Last sync {relTime(lastSync)}</span>}
            </div>
          </div>

          {days.length === 0 ? (
            <Card>
              <Empty icon={<History className="size-5" />} title="No changes of this kind">
                Choose another filter to see the rest.
              </Empty>
            </Card>
          ) : (
            <div className="space-y-8">
              {days.map(([day, items]) => (
                <section key={day || "undated"}>
                  <div className="mb-3 flex items-baseline gap-2">
                    <h2 className="text-[13.5px] font-semibold tracking-tight">{day ? fmtDate(day) : "Undated"}</h2>
                    <span className="text-[12px] tabular text-fg-3">
                      {items.length} change{items.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <ol className="relative ml-[5px] border-l border-line pl-6">
                    {items.map((u, i) => {
                      const k = KINDS[u.kind] ?? { label: u.kind, tone: "gray" as Tone };
                      return (
                        <li key={i} className="relative pb-4 last:pb-0">
                          <span className={cx("absolute -left-[28.5px] top-[18px] size-2 rounded-full ring-4 ring-bg", SEVERITY[u.severity].dot)} title={SEVERITY[u.severity].label} />
                          <Card className="px-4 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge tone={k.tone}>{k.label}</Badge>
                              <span className="text-[13.5px] font-medium">{u.title}</span>
                              {u.severity === "high" && <span className="text-[11.5px] font-medium text-orange-text">High impact</span>}
                            </div>
                            {u.detail && <Detail text={u.detail} />}
                            {u.refs && u.refs.length > 0 && <Refs refs={u.refs} kind={u.kind} />}
                          </Card>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </Page>
  );
}
