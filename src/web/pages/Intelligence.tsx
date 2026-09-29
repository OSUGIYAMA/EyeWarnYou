// Regulatory intelligence: what is scheduled to change, across jurisdictions, and which open cases it touches.
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, CalendarClock, ExternalLink, History } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Page } from "../components/AppShell.tsx";
import { Badge, Card, CardHeader, Segmented, Skeleton } from "../components/ui/index.tsx";
import { api } from "../lib/api.ts";
import { cx, daysBetween, fmtDate, type Tone } from "../lib/format.ts";

interface Ev {
  id: string;
  date: string;
  jurisdiction: string;
  kind: string;
  title: string;
  detail: string;
  certainty: "legal" | "announced" | "political";
  sources: { label: string; url: string }[];
  exposed: { caseId: string; ref: string; title: string; why: string }[];
}
interface Measure {
  id: string;
  title: string;
  announcement: string;
  effective: string;
  status: "in_force" | "suspended";
  legalUntil?: string;
  politicalUntil?: string;
  extraterritorial?: boolean;
  url: string;
}

const J: Record<string, { label: string; tone: Tone }> = {
  US: { label: "United States", tone: "blue" },
  JP: { label: "Japan", tone: "violet" },
  CN: { label: "China", tone: "red" },
  EU: { label: "European Union", tone: "gray" },
  KR: { label: "South Korea", tone: "gray" },
  UK: { label: "United Kingdom", tone: "gray" },
  TW: { label: "Taiwan", tone: "gray" },
};
const KIND: Record<string, string> = {
  takes_effect: "Takes effect",
  suspension_ends: "Suspension ends",
  suspended: "Suspended",
  designation: "Designations",
  list_revision: "List revision",
  not_enforced: "Not enforced",
};

export function IntelligencePage() {
  const q = useQuery({ queryKey: ["timeline"], queryFn: () => api.get<{ today: string; events: Ev[]; measures: Measure[] }>("/timeline") });
  const [filter, setFilter] = useState("all");
  if (!q.data)
    return (
      <Page>
        <Skeleton className="h-64" />
      </Page>
    );
  const { today, events, measures } = q.data;
  const shown = events.filter((e) => filter === "all" || e.jurisdiction === filter);
  const upcoming = shown.filter((e) => e.date >= today);
  const past = shown.filter((e) => e.date < today).reverse();
  const exposedCount = upcoming.reduce((n, e) => n + e.exposed.length, 0);

  return (
    <Page wide>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Regulatory intelligence</h1>
          <p className="mt-1 max-w-3xl text-[13.5px] text-fg-2">
            Scheduled changes across the US, Japan and China — suspensions that lapse, rules that take effect, new designations — with the open cases each one would change. Text-level changes detected in the regulation data are listed under{" "}
            <Link to="/regulations/updates" className="text-accent-text hover:underline">
              Detected changes
            </Link>
            .
          </p>
        </div>
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "US", label: "US" },
            { value: "JP", label: "Japan" },
            { value: "CN", label: "China" },
            { value: "EU", label: "EU" },
          ]}
        />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0">
          <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold">
            <CalendarClock className="size-4 text-fg-3" /> Coming up
            {exposedCount > 0 && <Badge tone="orange">{exposedCount} open-case exposure{exposedCount > 1 ? "s" : ""}</Badge>}
          </div>
          <ol className="relative space-y-3 border-l border-line pl-6">
            {upcoming.map((e) => (
              <EventCard key={e.id} e={e} today={today} />
            ))}
            {upcoming.length === 0 && <li className="text-[13px] text-fg-3">Nothing scheduled.</li>}
          </ol>
          <div className="mb-3 mt-8 flex items-center gap-2 text-[13px] font-semibold">
            <History className="size-4 text-fg-3" /> Recent
          </div>
          <ol className="relative space-y-3 border-l border-line pl-6">
            {past.map((e) => (
              <EventCard key={e.id} e={e} today={today} />
            ))}
          </ol>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-6">
          <Card>
            <CardHeader title="China — commodity and end-use measures" subtitle={`Status on ${fmtDate(today)}`} />
            <div className="divide-y divide-line">
              {measures.map((m) => {
                const suspended = m.status === "suspended" && (!m.legalUntil || today < m.legalUntil);
                return (
                  <a key={m.id} href={m.url} target="_blank" rel="noreferrer" className="block px-4 py-2.5 hover:bg-panel-2/50">
                    <div className="flex items-start gap-2">
                      <span className={cx("mt-1.5 size-1.5 shrink-0 rounded-full", suspended ? "bg-fg-3" : "bg-orange")} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-medium leading-snug">{m.title}</div>
                        <div className="text-[11.5px] text-fg-3">
                          {m.announcement} · {suspended ? `suspended until ${m.legalUntil}${m.politicalUntil ? ` (agreed: ${m.politicalUntil})` : ""}` : `in force since ${m.effective}`}
                          {m.extraterritorial && <span className="text-red-text"> · extraterritorial</span>}
                        </div>
                      </div>
                    </div>
                  </a>
                );
              })}
            </div>
          </Card>
        </aside>
      </div>
    </Page>
  );
}

function EventCard({ e, today }: { e: Ev; today: string }) {
  const days = daysBetween(today, e.date);
  const j = J[e.jurisdiction] ?? { label: e.jurisdiction, tone: "gray" as Tone };
  return (
    <li className="relative">
      <span className={cx("absolute -left-[31px] top-4 size-2.5 rounded-full ring-4 ring-bg", days >= 0 ? (days <= 60 ? "bg-orange" : "bg-accent") : "bg-fg-3")} />
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <span className="font-mono font-medium tabular">{e.date}</span>
          {days >= 0 ? <span className={cx("font-medium", days <= 60 ? "text-orange-text" : "text-fg-2")}>{days === 0 ? "today" : `in ${days} days`}</span> : <span className="text-fg-3">{-days} days ago</span>}
          <Badge tone={j.tone}>{j.label}</Badge>
          <Badge tone="gray">{KIND[e.kind] ?? e.kind}</Badge>
          {e.certainty !== "legal" && <Badge tone="amber">{e.certainty === "political" ? "Politically agreed — not yet legal" : "Announced policy"}</Badge>}
        </div>
        <div className="mt-2 text-[14px] font-semibold tracking-tight">{e.title}</div>
        <p className="mt-1 text-[13px] leading-relaxed text-fg-2">{e.detail}</p>
        {e.exposed.length > 0 && (
          <div className="mt-3 rounded-lg bg-orange-soft/60 px-3 py-2 ring-1 ring-orange/20">
            <div className="text-[11.5px] font-semibold uppercase tracking-[0.05em] text-orange-text">Open cases affected</div>
            <ul className="mt-1 space-y-0.5">
              {e.exposed.map((x) => (
                <li key={x.caseId} className="text-[12.5px]">
                  <Link to={`/cases/${x.caseId}`} className="inline-flex items-center gap-1 font-medium hover:underline">
                    <span className="font-mono text-[11.5px] text-fg-3">{x.ref}</span> {x.title} <ArrowUpRight className="size-3" />
                  </Link>
                  <span className="text-fg-3"> — {x.why}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-3">
          {e.sources.map((s) => (
            <a key={s.url + s.label} href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] text-fg-3 hover:text-fg">
              {s.label} <ExternalLink className="size-3" />
            </a>
          ))}
        </div>
      </Card>
    </li>
  );
}
