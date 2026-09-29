// Supply-chain exposure: which products and open transactions depend on China-origin controlled
// materials, how that changes if suspended measures lapse, and which counterparties sit on Chinese lists.
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Boxes, Factory, Info } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Page } from "../components/AppShell.tsx";
import { CountryName } from "../components/CountryPicker.tsx";
import { Badge, Card, CardHeader, Empty, Segmented, Skeleton } from "../components/ui/index.tsx";
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

export function ExposurePage() {
  const today = new Date().toISOString().slice(0, 10);
  const [scenario, setScenario] = useState<"today" | "lapse">("today");
  const asOf = scenario === "today" ? today : "2026-11-10";
  const q = useQuery({ queryKey: ["exposure", asOf], queryFn: () => api.get<Exposure>(`/exposure?asOf=${asOf}`) });
  const d = q.data;
  const used = d?.materials.filter((m) => m.products.length || m.caseItems.length) ?? [];
  const activeUsed = used.filter((m) => m.active);
  const origins = Object.entries(d?.origins ?? {}).sort((a, b) => b[1] - a[1]);
  const totalOrigins = origins.reduce((n, [, v]) => n + v, 0);

  return (
    <Page wide>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Supply-chain exposure</h1>
          <p className="mt-1 max-w-3xl text-[13.5px] text-fg-2">
            Where your products and open transactions depend on China-origin materials that China controls, how that picture changes if suspended measures lapse, and which counterparties appear on Chinese lists. Built from the product master and case items — record materials and countries of origin there.
          </p>
        </div>
        <Segmented
          value={scenario}
          onChange={setScenario}
          options={[
            { value: "today", label: `Today (${fmtDate(today)})` },
            { value: "lapse", label: "If the Oct-2025 suspension lapses (2026-11-10)" },
          ]}
        />
      </div>
      {!d ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Products in master" value={d.productCount} />
            <Tile label="Open / approved cases" value={d.caseCount} />
            <Tile label="Controlled materials in use" value={used.length} sub={`${activeUsed.length} under measures in force on ${fmtDate(d.asOf)}`} tone={activeUsed.length ? "orange" : undefined} />
            <Tile label="Counterparties on Chinese lists" value={new Set(d.cnParties.map((p) => p.party)).size} tone={d.cnParties.length ? "red" : undefined} />
          </div>

          <Card>
            <CardHeader title="China-origin controlled materials" subtitle={`Measure status evaluated on ${fmtDate(d.asOf)}`} icon={<Factory className="size-4" />} />
            {used.length === 0 ? (
              <Empty icon={<Boxes className="size-5" />} title="No China-origin controlled materials recorded">
                Tag items with their China-origin materials (gallium, rare-earth magnets, graphite…) in the China tab of a case item or in the product master. Exposure then updates automatically as MOFCOM measures take effect or lapse.
              </Empty>
            ) : (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-line bg-panel-2/60 text-left text-[11.5px] text-fg-3">
                    <th className="px-4 py-2 font-medium">Material</th>
                    <th className="px-4 py-2 font-medium">MOFCOM measure</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Where it is used</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {used.map((m) => (
                    <tr key={m.id} className="align-top">
                      <td className="px-4 py-2.5">
                        <div className="font-medium">{m.label}</div>
                        <div className="font-mono text-[11.5px] text-fg-3">CN {m.code}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        <a href={m.measure.url} target="_blank" rel="noreferrer" className="hover:underline">
                          {m.measure.title}
                        </a>
                        <div className="text-[11.5px] text-fg-3">{m.measure.announcement}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge tone={m.active ? "orange" : "gray"} dot>
                          {m.active ? "In force" : "Suspended"}
                        </Badge>
                        <div className="mt-1 max-w-[280px] text-[11.5px] leading-snug text-fg-3">{m.note}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        {m.products.map((p) => (
                          <div key={p.id} className="text-[12.5px]">
                            <Badge tone="neutral">Product</Badge> {p.name}
                          </div>
                        ))}
                        {m.caseItems.map((ci, i) => (
                          <Link key={i} to={`/cases/${ci.caseId}`} className="flex items-center gap-1 text-[12.5px] hover:underline">
                            <span className="font-mono text-[11.5px] text-fg-3">{ci.ref}</span> {ci.item} → <CountryName iso2={ci.destination} withCode={false} />
                            <ArrowUpRight className="size-3" />
                          </Link>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Counterparties matched to Chinese lists" subtitle="From screenings stored on cases (confirmed and pending)" />
              {d.cnParties.length === 0 ? (
                <div className="px-4 py-6 text-[13px] text-fg-3">No case party has matched a MOFCOM designation.</div>
              ) : (
                <div className="divide-y divide-line">
                  {d.cnParties.map((p, i) => (
                    <Link key={i} to={`/cases/${p.caseId}`} className="flex items-center gap-3 px-4 py-2.5 text-[13px] hover:bg-panel-2/50">
                      <span className="font-mono text-[11.5px] text-fg-3">{p.ref}</span>
                      <span className="min-w-0 flex-1 truncate font-medium">{p.party}</span>
                      <Badge tone={LIST_NAMES[p.list]?.tone ?? "gray"}>{LIST_NAMES[p.list]?.name ?? p.list}</Badge>
                      <Badge tone={p.disposition === "confirmed" ? "red" : "amber"}>{p.disposition}</Badge>
                    </Link>
                  ))}
                </div>
              )}
            </Card>
            <Card>
              <CardHeader title="Chinese designations by country" subtitle="MOFCOM lists held locally (from primary announcements)" />
              <div className="p-4">
                {Object.entries(d.cnListCounts).map(([list, byCountry]) => (
                  <div key={list} className="mb-3 last:mb-0">
                    <div className="mb-1 text-[12.5px] font-medium">{LIST_NAMES[list]?.name ?? list}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(byCountry)
                        .sort((a, b) => b[1] - a[1])
                        .map(([iso, n]) => (
                          <span key={iso} className={cx("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] ring-1 ring-inset", iso === "JP" ? "bg-violet-soft text-violet ring-violet/20" : "bg-panel-2 text-fg-2 ring-line")}>
                            {iso === "—" ? "Unspecified" : <CountryName iso2={iso} withCode={false} />} <span className="tabular font-medium">{n}</span>
                          </span>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader title="Country-of-origin concentration" subtitle="Across products and case items with a recorded origin" />
            {origins.length === 0 ? (
              <div className="flex items-center gap-2 px-4 py-6 text-[13px] text-fg-3">
                <Info className="size-4" /> Record countries of origin on items to see concentration.
              </div>
            ) : (
              <div className="space-y-2 p-4">
                {origins.map(([iso, n]) => (
                  <div key={iso} className="flex items-center gap-3 text-[13px]">
                    <div className="w-44 shrink-0">
                      <CountryName iso2={iso} />
                    </div>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-panel-2">
                      <div className={cx("h-full rounded-full", iso === "CN" ? "bg-orange" : "bg-accent")} style={{ width: `${(n / totalOrigins) * 100}%` }} />
                    </div>
                    <span className="w-16 text-right tabular text-fg-2">
                      {n} · {Math.round((n / totalOrigins) * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </Page>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: number; sub?: string; tone?: "orange" | "red" }) {
  return (
    <div className="rounded-xl border border-line bg-panel px-4 py-3.5 shadow-card">
      <div className="text-[12px] text-fg-3">{label}</div>
      <div className={cx("mt-1 text-[26px] font-semibold tabular tracking-tight", tone === "orange" && value > 0 && "text-orange-text", tone === "red" && value > 0 && "text-red-text")}>{value}</div>
      <div className="text-[11.5px] text-fg-3">{sub ?? " "}</div>
    </div>
  );
}
