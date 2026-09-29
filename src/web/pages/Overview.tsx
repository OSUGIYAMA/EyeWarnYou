// Home: start from the question the user came with, then pick up unfinished work.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, PackageSearch, ScanSearch, Tag } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Page, useMeta } from "../components/AppShell.tsx";
import { CountryName } from "../components/CountryPicker.tsx";
import { Button, Card, OutcomePill, Section, Skeleton, toast } from "../components/ui/index.tsx";
import { api, type CaseSummary } from "../lib/api.ts";
import { cx, daysBetween, fmtDate, relTime } from "../lib/format.ts";

interface TimelineEvent {
  id: string;
  date: string;
  jurisdiction: string;
  kind: string;
  title: string;
  certainty: string;
  exposed: { caseId: string; ref: string; title: string; why: string }[];
}

const J_NAME: Record<string, string> = { US: "United States", JP: "Japan", CN: "China", EU: "European Union", KR: "South Korea" };

export function OverviewPage() {
  const meta = useMeta();
  const cases = useQuery({ queryKey: ["cases"], queryFn: () => api.get<CaseSummary[]>("/cases") });
  const tl = useQuery({ queryKey: ["timeline"], queryFn: () => api.get<{ today: string; events: TimelineEvent[] }>("/timeline") });
  const list = cases.data ?? [];
  const open = list.filter((c) => c.status === "draft" || c.status === "in_review" || c.status === "on_hold");
  const today = tl.data?.today ?? new Date().toISOString().slice(0, 10);
  const upcoming = (tl.data?.events ?? []).filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date) || b.exposed.length - a.exposed.length);

  return (
    <Page>
      <div className="mb-10">
        <div className="text-[13px] font-medium text-fg-3">{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</div>
        <h1 className="mt-1 text-[34px] font-bold leading-tight tracking-[-0.025em]">What would you like to check?</h1>
      </div>

      <div className="grid divide-y divide-line border-y border-line md:grid-cols-3 md:divide-x md:divide-y-0">
        <Door
          to="/cases/new"
          icon={<PackageSearch />}
          title="Check a shipment"
          text="Find out which export laws reach it — Japan, the US and China — and what each one requires before it ships."
          primary
        />
        <Door to="/screening" icon={<ScanSearch />} title="Screen a company" text={`Search ${meta.data ? meta.data.counts.screening.toLocaleString() : "27,000"} restricted parties on US, Japanese and Chinese lists.`} />
        <Door to="/classify" icon={<Tag />} title="Classify a product" text="Draft an ECCN and 項番 from a datasheet, then confirm it against the regulation text." />
      </div>

      <div className="mt-12 space-y-10">
        {cases.isLoading ? (
          <Skeleton className="h-40 rounded-xl" />
        ) : open.length > 0 ? (
          <Section
            title="Continue"
            description="Open cases, each with the one thing it needs next."
            actions={
              <Link to="/cases" className="text-[13.5px] text-accent-text hover:underline">
                All cases
              </Link>
            }
          >
            <Card className="k-list overflow-hidden">
              {open.slice(0, 6).map((c) => (
                <CaseRow key={c.id} c={c} />
              ))}
            </Card>
          </Section>
        ) : (
          <HowItWorks hasCases={list.length > 0} />
        )}

        <Section
          title="Coming up"
          description="Scheduled changes in US, Japanese and Chinese rules, and the cases they touch."
          actions={
            <Link to="/intelligence" className="text-[13.5px] text-accent-text hover:underline">
              Full timeline
            </Link>
          }
        >
          <Card className="k-list overflow-hidden" style={{ ["--inset" as string]: "84px" }}>
            {tl.isLoading
              ? [1, 2, 3].map((i) => (
                  <div key={i} className="px-4 py-4">
                    <Skeleton />
                  </div>
                ))
              : upcoming.slice(0, 4).map((e) => <EventRow key={e.id} e={e} today={today} />)}
          </Card>
        </Section>
      </div>

      <DataLine />
    </Page>
  );
}

function Door({ to, icon, title, text, primary }: { to: string; icon: ReactNode; title: string; text: string; primary?: boolean }) {
  return (
    <Link to={to} className="group flex gap-4 px-1 py-5 transition-colors hover:bg-fill-2 md:flex-col md:gap-0 md:px-6 md:py-7 md:first:pl-1">
      <div className={cx("flex size-11 shrink-0 items-center justify-center rounded-full [&>svg]:size-[22px] [&>svg]:stroke-[1.75]", primary ? "bg-accent text-white" : "bg-fill text-accent")}>{icon}</div>
      <div className="min-w-0">
        <div className={cx("flex items-center gap-1 text-[19px] font-semibold tracking-tight md:mt-6", primary && "text-accent-text")}>
          {title}
          <ChevronRight className="size-5 text-fg-3 transition-transform group-hover:translate-x-0.5" />
        </div>
        <p className="mt-1 text-[13.5px] leading-relaxed text-fg-2 md:mt-1.5">{text}</p>
      </div>
    </Link>
  );
}

function CaseRow({ c }: { c: CaseSummary }) {
  const next = c.progress?.next;
  const label = c.status === "in_review" ? "Awaiting decision" : c.status === "on_hold" ? "On hold" : next?.label ?? "Open";
  return (
    <Link to={`/cases/${c.id}${next ? `#${next.anchor}` : ""}`} className="flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-fill-2">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14.5px] font-medium">{c.title}</div>
        <div className="mt-0.5 flex items-center gap-1.5 whitespace-nowrap text-[12.5px] text-fg-3">
          <span className="tabular">{c.ref}</span>
          <span>·</span>
          <span className="truncate">
            <CountryName iso2={c.destination} withCode={false} />
          </span>
          <span className="hidden sm:inline">·</span>
          <span className="hidden sm:inline">{relTime(c.updatedAt)}</span>
        </div>
        <div className="mt-1 text-[13px] font-medium text-accent-text sm:hidden">{label}</div>
      </div>
      <div className="hidden w-[170px] shrink-0 md:block">{c.outcome && <OutcomePill outcome={c.outcome} size="sm" />}</div>
      <div className="hidden w-[190px] shrink-0 items-center justify-end gap-1 text-[13px] font-medium text-accent-text sm:flex">{label}</div>
      <ChevronRight className="size-4 shrink-0 text-fg-3" />
    </Link>
  );
}

function EventRow({ e, today }: { e: TimelineEvent; today: string }) {
  const d = new Date(`${e.date}T00:00:00`);
  const days = daysBetween(today, e.date);
  return (
    <Link to={`/intelligence#${e.id}`} className="flex items-start gap-4 px-4 py-3.5 transition-colors hover:bg-fill-2">
      <div className="w-[52px] shrink-0 text-center">
        <div className="text-[11px] font-semibold text-red-text">{d.toLocaleDateString("en-GB", { month: "short" }).toUpperCase()}</div>
        <div className="text-[22px] font-semibold leading-none tracking-tight tabular">{d.getDate()}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[14.5px] font-medium leading-snug">{e.title}</div>
        <div className="mt-0.5 text-[12.5px] text-fg-3">
          {J_NAME[e.jurisdiction] ?? e.jurisdiction} · {days === 0 ? "today" : `in ${days} day${days === 1 ? "" : "s"}`}
          {e.certainty === "political" && " · agreed, not yet published"}
        </div>
        {e.exposed.length > 0 && (
          <div className="mt-1.5 text-[13px] text-fg-2">
            <span className="font-medium text-orange-text">Affects {e.exposed.length === 1 ? e.exposed[0].ref : `${e.exposed.length} open cases`}</span> — {e.exposed[0].why}
          </div>
        )}
      </div>
      <ChevronRight className="mt-1 size-4 shrink-0 text-fg-3" />
    </Link>
  );
}

function HowItWorks({ hasCases }: { hasCases: boolean }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const steps = [
    { n: 1, title: "Describe the transaction", text: "What is shipped, from where to where, and who is involved — or drop in the purchase order." },
    { n: 2, title: "EyeWarnYou applies the law", text: "It works out which regimes reach the deal, screens every party and checks each item against the control lists." },
    { n: 3, title: "Answer, then sign off", text: "Answer the few questions only you can, review any list matches, and record a decision with its reasons." },
  ];
  return (
    <Section title={hasCases ? "No open cases" : "How it works"} description={hasCases ? "Everything is decided. Start a new case when the next order comes in." : "A case is one transaction. Three steps from order to decision."}>
      <Card className="p-6">
        <div className="grid gap-6 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n}>
              <div className="flex size-7 items-center justify-center rounded-full bg-fill text-[13px] font-semibold tabular text-fg-2">{s.n}</div>
              <div className="mt-3 text-[15px] font-semibold tracking-tight">{s.title}</div>
              <p className="mt-1 text-[13.5px] leading-relaxed text-fg-2">{s.text}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap gap-2 border-t border-line pt-5">
          <Button variant="primary" onClick={() => nav("/cases/new")}>
            Start a case
          </Button>
          {!hasCases && (
            <Button
              loading={loading}
              onClick={async () => {
                setLoading(true);
                try {
                  await api.post("/demo");
                  await qc.invalidateQueries({ queryKey: ["cases"] });
                  await qc.invalidateQueries({ queryKey: ["timeline"] });
                  toast("Five sample cases added", { detail: "Fictional transactions that exercise Japanese, US and Chinese rules.", tone: "success" });
                } finally {
                  setLoading(false);
                }
              }}
            >
              Try with sample cases
            </Button>
          )}
        </div>
      </Card>
    </Section>
  );
}

function DataLine() {
  const meta = useMeta();
  if (!meta.data) return null;
  const s = meta.data.stamps;
  const csl = s.screening.find((x) => /Consolidated/.test(x.source));
  return (
    <div className="mt-12 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-5 text-[12.5px] text-fg-3">
      <span>EAR as of {fmtDate(s.ccl.asOf)}</span>
      <span>輸出令 as of {fmtDate(s.jp.asOf)}</span>
      <span>{csl ? `Screening lists updated ${relTime(csl.fetchedAt)}` : <span className="text-orange-text">US screening lists not downloaded</span>}</span>
      <Link to="/settings#data" className="text-accent-text hover:underline">
        Update data
      </Link>
      <span className="ml-auto">Decision support, not legal advice.</span>
    </div>
  );
}
