// Changes: what differs in the regulation data between consecutive data syncs.
import { useQuery } from "@tanstack/react-query";
import { History, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Page, useMeta } from "../components/AppShell.tsx";
import { CountryName } from "../components/CountryPicker.tsx";
import { Button, Card, Empty, PageHeader, Section, Segmented, Skeleton, StatusDot, Tooltip } from "../components/ui/index.tsx";
import { api, type ChangeEntry } from "../lib/api.ts";
import { cx, fmtDate, LIST_NAMES, relTime } from "../lib/format.ts";

const KINDS: Record<string, string> = {
  ccl: "Control List",
  chart: "Country Chart",
  groups: "Country Groups",
  "jp-countries": "Japan lists",
  screening: "Screening lists",
};

const SEVERITY: Record<ChangeEntry["severity"], string> = {
  high: "High impact",
  medium: "Medium impact",
  low: "Low impact",
};

const ECCN_RE = /^\d[A-E]\d{3}$/;
const ISO_RE = /^[A-Z]{2}$/;

const chip = "inline-flex h-6 items-center rounded-md bg-fill-2 px-1.5 text-[12px] transition-colors";

function Refs({ refs, kind }: { refs: string[]; kind: string }) {
  const [all, setAll] = useState(false);
  if (kind === "screening") {
    // Entry ids are "<LIST>:<hash>" — summarise by list.
    const byList = new Map<string, number>();
    for (const r of refs) {
      const list = r.includes(":") ? r.slice(0, r.indexOf(":")) : "";
      byList.set(list, (byList.get(list) ?? 0) + 1);
    }
    const lists = [...byList.entries()].filter(([l]) => l);
    return (
      <div className="mt-1.5 text-[12.5px] text-fg-2">
        {lists.map(([l, n], i) => (
          <span key={l}>
            {i > 0 && <span className="text-fg-3"> · </span>}
            {LIST_NAMES[l]?.name ?? l} <span className="tabular">{n}</span>
          </span>
        ))}
        <span className="text-fg-3">
          {lists.length > 0 && " — "}
          <span className="tabular">{refs.length}</span> list entr{refs.length === 1 ? "y" : "ies"} affected
        </span>
      </div>
    );
  }
  const shown = all ? refs : refs.slice(0, 12);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1">
      {shown.map((r) =>
        ECCN_RE.test(r) ? (
          <Link key={r} to={`/regulations/ccl/${r}`} className={cx(chip, "font-mono text-fg hover:bg-fill hover:text-accent-text")}>
            {r}
          </Link>
        ) : ISO_RE.test(r) ? (
          <Link key={r} to={`/regulations/countries/${r}`} className={cx(chip, "text-fg hover:bg-fill hover:text-accent-text")}>
            <CountryName iso2={r} withCode={false} />
          </Link>
        ) : (
          <span key={r} className={cx(chip, "font-mono text-fg-3")}>
            {r}
          </span>
        ),
      )}
      {refs.length > 12 && (
        <button type="button" onClick={() => setAll((a) => !a)} className="px-1 text-[12.5px] font-medium text-accent-text hover:underline">
          {all ? "Show fewer" : `${refs.length - 12} more`}
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
      <div className={cx("text-[13px] leading-relaxed text-fg-2", long && !open && "line-clamp-2")}>{text}</div>
      {long && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="text-[12.5px] font-medium text-accent-text hover:underline">
          {open ? "Less" : "More"}
        </button>
      )}
    </div>
  );
}

/** Severity as a symbol: a warning glyph for high impact, a quiet dot otherwise. */
function Severity({ s }: { s: ChangeEntry["severity"] }) {
  return (
    <Tooltip content={SEVERITY[s]}>
      <span className="flex h-5 w-4 shrink-0 items-center justify-center" aria-label={SEVERITY[s]} role="img">
        {s === "high" ? <StatusDot status="flag" className="mt-0" /> : <span className={cx("size-2 rounded-full", s === "medium" ? "bg-amber" : "bg-fg-3/50")} />}
      </span>
    </Tooltip>
  );
}

export function UpdatesPage() {
  const meta = useMeta();
  const nav = useNavigate();
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
  const toSync = () => nav("/settings#data");

  return (
    <Page>
      <PageHeader
        title="Changes"
        description="What changed in the regulation data at each sync."
        actions={
          list.length > 0 ? (
            <Button icon={<RefreshCw className="size-3.5" />} onClick={toSync}>
              Sync data
            </Button>
          ) : undefined
        }
      />

      {updates.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <Card>
          <Empty
            icon={<History />}
            title="No changes yet"
            action={
              <Button variant="primary" icon={<RefreshCw className="size-3.5" />} onClick={toSync}>
                Sync data
              </Button>
            }
          >
            {lastSync
              ? `The last sync, ${relTime(lastSync)}, set the baseline. After the next one, every difference in the Control List, Country Chart, Country Groups, Japan’s lists and the screening lists appears here.`
              : "The first data sync sets the baseline. Each later sync is compared with it, and every difference in the Control List, Country Chart, Country Groups, Japan’s lists and the screening lists appears here."}
          </Empty>
        </Card>
      ) : (
        <>
          <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
            <Segmented
              value={kind}
              onChange={(v) => setParams(v === "all" ? {} : { kind: v }, { replace: true })}
              options={[
                { value: "all", label: <>All <span className="tabular text-fg-3">{list.length}</span></> },
                ...Object.entries(KINDS)
                  .filter(([k]) => counts[k])
                  .map(([k, label]) => ({
                    value: k,
                    label: (
                      <>
                        {label} <span className="tabular text-fg-3">{counts[k]}</span>
                      </>
                    ),
                  })),
              ]}
            />
            <div className="flex items-center gap-1.5 text-[12.5px] text-fg-3">
              {high > 0 && (
                <>
                  <span className="text-fg-2">
                    <span className="tabular">{high}</span> high impact
                  </span>
                  {lastSync && <span>·</span>}
                </>
              )}
              {lastSync && <span>Last sync {relTime(lastSync)}</span>}
            </div>
          </div>

          {days.length === 0 ? (
            <Card>
              <Empty icon={<History />} title="No changes of this kind">
                Choose another filter to see the rest.
              </Empty>
            </Card>
          ) : (
            <div className="space-y-10">
              {days.map(([day, items]) => (
                <Section key={day || "undated"} title={day ? fmtDate(day) : "Undated"} description={`${items.length} change${items.length === 1 ? "" : "s"}`}>
                  <Card className="k-list" style={{ ["--inset" as string]: "44px" }}>
                    {items.map((u, i) => (
                      <div key={i} className="flex gap-3 px-4 py-3.5">
                        <Severity s={u.severity} />
                        <div className="min-w-0 flex-1">
                          <div className="text-[14px] font-medium leading-snug">{u.title}</div>
                          <div className="text-[12.5px] text-fg-3">{KINDS[u.kind] ?? u.kind}</div>
                          {u.detail && <Detail text={u.detail} />}
                          {u.refs && u.refs.length > 0 && <Refs refs={u.refs} kind={u.kind} />}
                        </div>
                      </div>
                    ))}
                  </Card>
                </Section>
              ))}
            </div>
          )}
        </>
      )}
    </Page>
  );
}
