// Supply-chain exposure: which shipments and products depend on China-origin materials that China
// controls, what changes if the suspended measures lapse, and which counterparties sit on Chinese lists.
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Boxes, ChevronRight, CircleCheck, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Page } from "../components/AppShell.tsx";
import { CountryName } from "../components/CountryPicker.tsx";
import { Button, Card, Empty, PageHeader, Section, Segmented, Skeleton, StatusDot } from "../components/ui/index.tsx";
import { api } from "../lib/api.ts";
import { cx, fmtDate, LIST_NAMES } from "../lib/format.ts";

interface Mat {
  id: string;
  label: string;
  code: string;
  magnet?: boolean;
  measure: { id: string; title: string; announcement: string; url: string; status: string; legalUntil?: string; politicalUntil?: string };
  active: boolean;
  note: string;
  products: { id: string; name: string }[];
  caseItems: { caseId: string; ref: string; item: string; destination: string }[];
}
interface Exposure {
  asOf: string;
  materials: Mat[];
  origins: Record<string, number>;
  cnParties: { caseId: string; ref: string; party: string; list: string; matched: string; score: number; disposition: string }[];
  cnListCounts: Record<string, Record<string, number>>;
  productCount: number;
  caseCount: number;
}

/** The date the October 2025 suspension package lapses unless extended in law. */
const LAPSE = "2026-11-10";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const listName = (l: string) => LIST_NAMES[l]?.name ?? l;
/** Notes from the engine carry ISO dates; show them the way the rest of the page does. */
const humanDates = (s: string) => s.replace(/\d{4}-\d{2}-\d{2}/g, (d) => fmtDate(d));
const usedOf = (d: Exposure) => d.materials.filter((m) => m.products.length || m.caseItems.length);

function joinAnd(parts: string[]): string {
  return parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

export function ExposurePage() {
  const today = new Date().toISOString().slice(0, 10);
  const [scenario, setScenario] = useState<"today" | "lapse">("today");
  const now = useQuery({ queryKey: ["exposure", today], queryFn: () => api.get<Exposure>(`/exposure?asOf=${today}`) });
  const lapse = useQuery({ queryKey: ["exposure", LAPSE], queryFn: () => api.get<Exposure>(`/exposure?asOf=${LAPSE}`) });
  const d = scenario === "today" ? now.data : lapse.data;
  const used = d ? usedOf(d) : [];
  const origins = Object.entries(d?.origins ?? {}).sort((a, b) => b[1] - a[1]);
  const totalOrigins = origins.reduce((n, [, v]) => n + v, 0);

  return (
    <Page>
      <PageHeader
        title="Supply-chain exposure"
        description="Shipments and products that depend on China-origin materials China controls."
        actions={
          <Segmented
            value={scenario}
            onChange={setScenario}
            options={[
              { value: "today", label: "Today" },
              { value: "lapse", label: "If the suspension ends" },
            ]}
          />
        }
      />
      {!d ? (
        <div className="space-y-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-64" />
        </div>
      ) : (
        <div className="space-y-10">
          <Answer d={d} scenario={scenario} now={now.data} lapse={lapse.data} />

          <Section title="Controlled materials you use" description={`China’s measures as they stand on ${fmtDate(d.asOf)}.`}>
            {used.length === 0 ? (
              <Card>
                <Empty icon={<Boxes />} title="No China-origin materials recorded" action={<ProductsButton />}>
                  Tag items with the China-origin materials they contain — gallium, rare-earth magnets, graphite — on a case item’s China tab or in the product master.
                </Empty>
              </Card>
            ) : (
              <Card className="k-list overflow-hidden" style={{ ["--inset" as string]: "40px" }}>
                {used.map((m) => (
                  <MaterialRow key={m.id} m={m} />
                ))}
              </Card>
            )}
          </Section>

          <div className="grid gap-10 lg:grid-cols-2 lg:gap-8">
            <Section title="Counterparties on Chinese lists" description="Matches from screenings stored on cases, confirmed or pending.">
              <Card className="k-list overflow-hidden" style={{ ["--inset" as string]: "44px" }}>
                {d.cnParties.length === 0 ? (
                  <div className="flex items-center gap-3 px-4 py-3.5 text-[13.5px] text-fg-2">
                    <StatusDot status="pass" className="mt-0" />
                    No case party matches a Chinese list.
                  </div>
                ) : (
                  d.cnParties.map((p, i) => (
                    <Link key={i} to={`/cases/${p.caseId}`} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-fill-2">
                      <StatusDot status={p.disposition === "confirmed" ? "block" : "flag"} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-medium">{p.party}</div>
                        <div className="truncate text-[12.5px] text-fg-3">
                          <span className="tabular">{p.ref}</span> · {listName(p.list)} · matches {p.matched}
                        </div>
                      </div>
                      <span className="mt-0.5 flex shrink-0 items-center gap-0.5 text-[13px] text-fg-2">
                        {p.disposition === "confirmed" ? "Confirmed" : p.disposition === "pending" ? "Pending review" : p.disposition}
                        <ChevronRight className="size-4 text-fg-3" />
                      </span>
                    </Link>
                  ))
                )}
              </Card>
            </Section>

            <Section title="Chinese designations by country" description="MOFCOM lists held locally, from primary announcements.">
              <Card className="k-list overflow-hidden">
                {Object.entries(d.cnListCounts).map(([list, byCountry]) => (
                  <div key={list} className="px-4 py-3">
                    <div className="text-[14px] font-medium">{listName(list)}</div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[13px] text-fg-2">
                      {Object.entries(byCountry)
                        .sort((a, b) => b[1] - a[1])
                        .map(([iso, n]) => (
                          <span key={iso} className={cx("whitespace-nowrap", iso === "JP" && "font-medium text-fg")}>
                            {iso === "—" ? "Unspecified" : <CountryName iso2={iso} withCode={false} />} <span className="tabular">{n}</span>
                          </span>
                        ))}
                    </div>
                  </div>
                ))}
              </Card>
            </Section>
          </div>

          <Section title="Where your items come from" description="Country of origin across products and case items.">
            <Card className="px-5 py-2">
              {origins.length === 0 ? (
                <div className="py-2 text-[13.5px] text-fg-2">Record countries of origin on items to see where they come from.</div>
              ) : (
                <div className="k-list" style={{ ["--inset" as string]: "0px" }}>
                  {origins.map(([iso, n]) => {
                    const pct = Math.round((n / totalOrigins) * 100);
                    return (
                      <div key={iso} className="grid grid-cols-[150px_minmax(0,1fr)_110px] items-center gap-4 py-2.5 text-[13.5px]">
                        <CountryName iso2={iso} withCode={false} />
                        <div className="h-2.5 rounded-r-[4px]" style={{ width: `${Math.max(pct, 1)}%`, background: iso === "CN" ? "var(--orange)" : "var(--seq-1)" }} />
                        <div className="text-right tabular">
                          <span className="font-semibold">{pct}%</span>
                          <span className="ml-1.5 text-[12.5px] text-fg-3">{plural(n, "item")}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </Section>
        </div>
      )}
    </Page>
  );
}

function ProductsButton() {
  const nav = useNavigate();
  return <Button onClick={() => nav("/products")}>Open product master</Button>;
}

/** The answer to the page's question, in one sentence, with the what-if beneath it. */
function Answer({ d, scenario, now, lapse }: { d: Exposure; scenario: "today" | "lapse"; now?: Exposure; lapse?: Exposure }) {
  const used = usedOf(d);
  const activeUsed = used.filter((m) => m.active);
  const cases = new Set(activeUsed.flatMap((m) => m.caseItems.map((c) => c.caseId))).size;
  const products = new Set(activeUsed.flatMap((m) => m.products.map((p) => p.id))).size;
  const parties = new Set(d.cnParties.map((p) => p.party)).size;
  const verb = scenario === "today" ? "depend" : "would depend";
  const subject = [cases > 0 || products === 0 ? `${cases} of your ${plural(d.caseCount, "case")}` : null, products > 0 ? plural(products, "product") : null].filter(Boolean).join(" and ");
  const headline = cases === 0 && products === 0 ? `None of your ${plural(d.caseCount, "case")} ${verb} on materials China controls` : `${subject} ${cases + products === 1 && products === 0 ? verb + "s" : verb} on materials China controls`;

  // What changes between today and the lapse date, for the materials this company actually uses.
  let whatIf: string | null = null;
  if (now && lapse) {
    const before = new Map(now.materials.map((m) => [m.id, m.active]));
    const newly = usedOf(lapse).filter((m) => m.active && !before.get(m.id));
    const newCases = new Set(newly.flatMap((m) => m.caseItems.map((c) => c.caseId))).size;
    whatIf =
      newly.length > 0
        ? `${plural(newly.length, "more material")} ${newly.length === 1 ? "becomes" : "become"} controlled — ${joinAnd(newly.map((m) => m.label))}${newCases ? `, in ${plural(newCases, "case")}` : ""}.`
        : usedOf(now).length === 0
          ? "Nothing changes: no China-origin materials are recorded on your items."
          : usedOf(now).every((m) => m.active)
            ? "Nothing changes: every controlled material you use is already under a measure in force."
            : "Nothing changes for the materials you use.";
  }

  return (
    <Card>
      <div className="flex items-start gap-4 px-4 py-5">
        {activeUsed.length ? (
          <TriangleAlert className="mt-1 size-[22px] shrink-0 text-orange" fill="currentColor" stroke="var(--panel)" strokeWidth={2} />
        ) : (
          <CircleCheck className="mt-1 size-[22px] shrink-0 text-green" fill="currentColor" stroke="var(--panel)" strokeWidth={2} />
        )}
        <div className="min-w-0">
          <div className="text-[22px] font-semibold leading-snug tracking-tight">{headline}.</div>
          <p className="mt-1 text-[14px] leading-relaxed text-fg-2">
            {activeUsed.length > 0
              ? `${joinAnd(activeUsed.map((m) => m.label))} — under ${activeUsed.length === 1 ? "a measure" : "measures"} in force on ${fmtDate(d.asOf)}.`
              : used.length > 0
                ? `The materials you use are under suspended measures on ${fmtDate(d.asOf)}.`
                : "No China-origin controlled materials are recorded on your products or case items."}
          </p>
          {whatIf && (
            <p className="mt-3 text-[14px] leading-relaxed">
              <span className="font-semibold">{scenario === "today" ? `If the suspension ends on ${fmtDate(LAPSE)}: ` : "Compared with today: "}</span>
              <span className="text-fg-2">{whatIf}</span>
            </p>
          )}
        </div>
      </div>
      <div className="grid border-t border-line sm:grid-cols-3">
        <Figure label="Controlled materials in use" value={used.length} note={`${activeUsed.length} under measures in force`} />
        <Figure label="Counterparties on Chinese lists" value={parties} />
        <Figure label="Products in master" value={d.productCount} />
      </div>
    </Card>
  );
}

function Figure({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="border-t border-line px-4 py-3.5 first:border-t-0 sm:border-l sm:border-t-0 sm:first:border-l-0">
      <div className="text-[12.5px] text-fg-2">{label}</div>
      <div className="text-[20px] font-semibold tracking-tight">{value.toLocaleString()}</div>
      {note && <div className="text-[12px] text-fg-3">{note}</div>}
    </div>
  );
}

function MaterialRow({ m }: { m: Mat }) {
  return (
    <div className="grid gap-x-8 gap-y-3 px-4 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div className="flex gap-3">
        <span className={cx("mt-[7px] size-2 shrink-0 rounded-full", m.active ? "bg-orange" : "ring-[1.5px] ring-inset ring-fg-3")} aria-hidden />
        <div className="min-w-0 pl-1">
          <div className="text-[14.5px] font-medium leading-snug">
            {m.label}
            <span className="ml-2 font-mono text-[12px] font-normal text-fg-3">CN {m.code}</span>
          </div>
          <div className="mt-0.5 text-[13px] text-fg">{humanDates(m.note)}</div>
          <a href={m.measure.url} target="_blank" rel="noreferrer" className="mt-0.5 block text-[12.5px] leading-snug text-fg-3 transition-colors hover:text-accent-text">
            {m.measure.title} · {m.measure.announcement}
            <ArrowUpRight className="ml-0.5 inline size-3 align-[-1px]" />
          </a>
        </div>
      </div>
      <ul className="space-y-1.5 pl-7 md:pl-0">
        {m.caseItems.map((ci, i) => (
          <li key={`c${i}`}>
            <Link to={`/cases/${ci.caseId}`} className="group flex flex-col text-[13.5px] sm:flex-row sm:items-baseline sm:gap-2">
              <span className="shrink-0 text-[12px] tabular text-fg-3 sm:w-[92px]">{ci.ref}</span>
              <span className="min-w-0">
                <span className="font-medium text-accent-text group-hover:underline">{ci.item}</span>
                <span className="text-fg-2">
                  {" "}
                  to <CountryName iso2={ci.destination} withCode={false} />
                </span>
                <ChevronRight className="ml-0.5 inline size-3.5 align-[-2px] text-fg-3" />
              </span>
            </Link>
          </li>
        ))}
        {m.products.map((p) => (
          <li key={p.id} className="flex flex-col text-[13.5px] sm:flex-row sm:items-baseline sm:gap-2">
            <span className="shrink-0 text-[12px] text-fg-3 sm:w-[92px]">Product</span>
            <span className="min-w-0">{p.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
