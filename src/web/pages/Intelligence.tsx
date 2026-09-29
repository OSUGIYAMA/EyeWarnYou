// What's changing: scheduled regulatory changes across jurisdictions, and which open cases each one touches.
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, ChevronRight } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { LandscapeView } from "../components/Landscape.tsx";
import { Page } from "../components/AppShell.tsx";
import { Card, PageHeader, Section, Segmented, Skeleton, Tooltip } from "../components/ui/index.tsx";
import { api } from "../lib/api.ts";
import { cx, daysBetween, fmtDate } from "../lib/format.ts";

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

const J: Record<string, string> = {
  US: "United States",
  JP: "Japan",
  CN: "China",
  EU: "European Union",
  KR: "South Korea",
  UK: "United Kingdom",
  TW: "Taiwan",
};
const KIND: Record<string, string> = {
  takes_effect: "Takes effect",
  suspension_ends: "Suspension ends",
  suspended: "Suspended",
  designation: "Designations",
  list_revision: "List revision",
  not_enforced: "Not enforced",
};
const CERTAINTY: Record<Ev["certainty"], { label: string; hint: string } | null> = {
  legal: null,
  announced: { label: "Announced, not yet law", hint: "Announced policy. The legal text has not changed yet." },
  political: { label: "Agreed, not yet law", hint: "Politically agreed — not yet legal. Treat as indicative until a legal instrument is published." },
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function IntelligencePage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "landscape" ? "landscape" : "timeline";
  return (
    <Page wide>
      <PageHeader
        title="What’s changing"
        description={tab === "timeline" ? "Scheduled changes to export controls, and the open cases each one touches." : "How far US, Japanese and Chinese designations overlap, and how the lists have grown."}
        actions={
          <Segmented
            value={tab}
            onChange={(v) => setParams(v === "timeline" ? {} : { tab: v })}
            options={[
              { value: "timeline", label: "Timeline" },
              { value: "landscape", label: "List landscape" },
            ]}
          />
        }
      />
      {tab === "timeline" ? <TimelineView /> : <LandscapeView />}
    </Page>
  );
}

function TimelineView() {
  const q = useQuery({ queryKey: ["timeline"], queryFn: () => api.get<{ today: string; events: Ev[]; measures: Measure[] }>("/timeline") });
  const [filter, setFilter] = useState("all");
  const { hash } = useLocation();
  const [flash, setFlash] = useState<string | null>(null);

  // Deep links from Home arrive as /intelligence#<eventId>: bring that event into view and mark it briefly.
  useEffect(() => {
    if (!q.data || !hash) return;
    const id = decodeURIComponent(hash.slice(1));
    const ev = q.data.events.find((e) => e.id === id);
    if (!ev) return;
    if (filter !== "all" && ev.jurisdiction !== filter) {
      setFilter("all");
      return;
    }
    const raf = requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "center" }));
    setFlash(id);
    const t = setTimeout(() => setFlash(null), 1800);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data, hash]);

  if (!q.data)
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-80" />
        <Skeleton className="h-96" />
      </div>
    );
  const { today, events, measures } = q.data;
  const shown = events.filter((e) => filter === "all" || e.jurisdiction === filter);
  const upcoming = shown.filter((e) => e.date >= today);
  const past = shown.filter((e) => e.date < today).reverse();
  const touching = upcoming.filter((e) => e.exposed.length > 0);
  const touchedCases = new Set(touching.flatMap((e) => e.exposed.map((x) => x.caseId))).size;

  return (
    <div className="grid items-start gap-x-10 gap-y-10 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
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
          <Link to="/regulations/updates" className="inline-flex items-center gap-0.5 text-[13.5px] text-accent-text hover:underline">
            Changes detected in the data
            <ChevronRight className="size-3.5" />
          </Link>
        </div>

        <Section
          title="Coming up"
          description={
            upcoming.length === 0
              ? undefined
              : touching.length > 0
                ? `${touching.length} of these ${plural(upcoming.length, "change")} ${touching.length === 1 ? "touches" : "touch"} ${touchedCases === 1 ? "one of your open cases" : `${touchedCases} of your open cases`}.`
                : "None of these touch your open cases."
          }
        >
          <Agenda events={upcoming} today={today} flash={flash} empty="Nothing scheduled." />
        </Section>

        {past.length > 0 && (
          <Section title="Recent">
            <Agenda events={past} today={today} flash={flash} />
          </Section>
        )}
      </div>

      <aside>
        <ChinaMeasures measures={measures} today={today} />
      </aside>
    </div>
  );
}

function Agenda({ events, today, flash, empty }: { events: Ev[]; today: string; flash: string | null; empty?: string }) {
  return (
    <Card className="k-list overflow-hidden" style={{ ["--inset" as string]: "88px" }}>
      {events.map((e) => (
        <EventRow key={e.id} e={e} today={today} flash={flash === e.id} />
      ))}
      {events.length === 0 && <div className="px-5 py-4 text-[13.5px] text-fg-2">{empty ?? "Nothing here."}</div>}
    </Card>
  );
}

function EventRow({ e, today, flash }: { e: Ev; today: string; flash: boolean }) {
  const d = new Date(`${e.date}T00:00:00`);
  const days = daysBetween(today, e.date);
  const upcoming = days >= 0;
  const sameYear = e.date.slice(0, 4) === today.slice(0, 4);
  const certainty = CERTAINTY[e.certainty];
  return (
    <article id={e.id} className={cx("flex scroll-mt-10 items-start gap-4 px-5 py-4 transition-colors duration-700", flash && "bg-accent-soft")}>
      <div className="w-[52px] shrink-0 pt-0.5 text-center" aria-label={fmtDate(e.date)}>
        <div className={cx("text-[11px] font-semibold", upcoming ? "text-red-text" : "text-fg-3")}>{d.toLocaleDateString("en-GB", { month: "short" }).toUpperCase()}</div>
        <div className={cx("text-[22px] font-semibold leading-none tracking-tight tabular", !upcoming && "text-fg-2")}>{d.getDate()}</div>
        {!sameYear && <div className="mt-1 text-[11px] tabular text-fg-3">{d.getFullYear()}</div>}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-[15px] font-semibold leading-snug tracking-tight">{e.title}</h3>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-fg-3">
          <span>{J[e.jurisdiction] ?? e.jurisdiction}</span>
          <span>·</span>
          <span>{KIND[e.kind] ?? e.kind}</span>
          <span>·</span>
          <span className={cx(upcoming && days <= 60 && "font-medium text-fg-2")}>{days === 0 ? "today" : upcoming ? `in ${plural(days, "day")}` : `${plural(-days, "day")} ago`}</span>
          {certainty && (
            <>
              <span>·</span>
              <Tooltip content={certainty.hint}>
                <span className="cursor-help underline decoration-dotted underline-offset-2">{certainty.label}</span>
              </Tooltip>
            </>
          )}
        </div>
        <Clamp text={e.detail} />
        {e.exposed.length > 0 && <Affected exposed={e.exposed} />}
        {e.sources.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5">
            {e.sources.map((s) => (
              <a key={s.url + s.label} href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-[12px] text-fg-3 transition-colors hover:text-accent-text">
                {s.label}
                <ArrowUpRight className="size-3" />
              </a>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

/** The open cases an event touches — the reason a user is on this page, so it is the one call-out in a row. */
function Affected({ exposed }: { exposed: Ev["exposed"] }) {
  // When every case is touched for the same reason, say it once.
  const shared = exposed.every((x) => x.why === exposed[0].why) ? exposed[0].why : null;
  return (
    <div className="mt-3 border-l-2 border-orange py-0.5 pl-3.5">
      <div className="text-[13px] font-semibold text-orange-text">Affects {exposed.length === 1 ? "1 open case" : `${exposed.length} open cases`}</div>
      {shared && <div className="text-[12.5px] leading-snug text-fg-2">{shared}</div>}
      <ul className={cx("space-y-1.5", shared ? "mt-2" : "mt-1")}>
        {exposed.map((x) => (
          <li key={x.caseId}>
            <Link to={`/cases/${x.caseId}`} className="group flex flex-col text-[13.5px] sm:flex-row sm:items-baseline sm:gap-2">
              <span className="shrink-0 text-[12px] tabular text-fg-3 sm:w-[92px]">{x.ref}</span>
              <span className="min-w-0 font-medium text-accent-text group-hover:underline">
                {x.title}
                <ChevronRight className="ml-0.5 inline size-3.5 align-[-2px] text-fg-3" />
              </span>
            </Link>
            {!shared && <div className="text-[12.5px] leading-snug text-fg-2 sm:pl-[100px]">{x.why}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Two lines of detail; the rest on request. */
function Clamp({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setOverflows(el.scrollHeight > el.clientHeight + 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="mt-1.5">
      <p ref={ref} className={cx("text-[13.5px] leading-relaxed text-fg-2", !open && "line-clamp-2")}>
        {text}
      </p>
      {(overflows || open) && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="text-[12.5px] font-medium text-accent-text hover:underline">
          {open ? "Less" : "More"}
        </button>
      )}
    </div>
  );
}

/** China's commodity and end-use measures: which bite today, which are suspended and until when. */
function ChinaMeasures({ measures, today }: { measures: Measure[]; today: string }) {
  const isSuspended = (m: Measure) => m.status === "suspended" && (!m.legalUntil || today < m.legalUntil);
  const suspended = measures.filter(isSuspended).length;
  return (
    <Section title="China’s export measures" description={`On ${fmtDate(today)}: ${measures.length - suspended} in force, ${suspended} suspended.`}>
      <Card className="k-list overflow-hidden" style={{ ["--inset" as string]: "36px" }}>
        {measures.map((m) => {
          const off = isSuspended(m);
          const left = m.legalUntil ? daysBetween(today, m.legalUntil) : null;
          return (
            <a key={m.id} href={m.url} target="_blank" rel="noreferrer" className="group flex items-start gap-2.5 px-4 py-3 transition-colors hover:bg-fill-2">
              <span className={cx("mt-[7px] size-2 shrink-0 rounded-full", off ? "ring-[1.5px] ring-inset ring-fg-3" : "bg-orange")} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-medium leading-snug">{m.title}</div>
                <div className="mt-0.5 text-[12.5px] leading-snug text-fg-2">
                  {off ? `Suspended until ${fmtDate(m.legalUntil)}${left !== null && left >= 0 ? ` · ${left === 0 ? "ends today" : `${plural(left, "day")} left`}` : ""}` : `In force since ${fmtDate(m.effective)}`}
                  {m.extraterritorial && (
                    <Tooltip content="Reaches items made outside China that contain Chinese-origin content.">
                      <span className="cursor-help"> · Extraterritorial</span>
                    </Tooltip>
                  )}
                </div>
                <div className="text-[12px] leading-snug text-fg-3">
                  {m.announcement}
                  {off && m.politicalUntil && ` · agreed to extend to ${fmtDate(m.politicalUntil)}`}
                </div>
              </div>
              <ArrowUpRight className="mt-1 size-3.5 shrink-0 text-fg-3 opacity-0 transition-opacity group-hover:opacity-100" />
            </a>
          );
        })}
      </Card>
    </Section>
  );
}
