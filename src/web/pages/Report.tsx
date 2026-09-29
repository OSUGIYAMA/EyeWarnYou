// Printable transaction review record (取引審査票) with item classifications (該非判定) and screening evidence.
// A formal document: always black on white, whatever the app's appearance.
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import type { Finding } from "@/shared/assessment.ts";
import { api, type CaseView, type CountryInfo, type Meta } from "../lib/api.ts";
import { fmtDate, LIST_NAMES, OUTCOME } from "../lib/format.ts";

const ROLE: Record<string, string> = { end_user: "End user (需要者)", consignee: "Ultimate consignee", intermediate_consignee: "Intermediate consignee", purchaser: "Purchaser (契約先)", forwarder: "Forwarder", other: "Other" };

const STYLES = `
@page { size: A4; margin: 16mm 15mm; }
.rpt { color: #1d1d1f; font-size: 12.5px; line-height: 1.55; font-feature-settings: "tnum" 1; }
.rpt h2 { display: flex; align-items: baseline; gap: 10px; font-size: 14px; font-weight: 600; letter-spacing: -0.01em; margin: 30px 0 10px; padding-bottom: 6px; border-bottom: 1px solid #1d1d1f; break-after: avoid; }
.rpt h2 .n { width: 16px; color: #86868b; font-weight: 500; }
.rpt h2 .ja { color: #6e6e73; font-weight: 400; font-size: 12px; }
.rpt table { width: 100%; border-collapse: collapse; }
.rpt th, .rpt td { padding: 7px 10px 7px 0; text-align: left; vertical-align: top; border-bottom: 1px solid #e5e5ea; }
.rpt th:last-child, .rpt td:last-child { padding-right: 0; }
.rpt thead th { font-size: 11px; font-weight: 500; color: #6e6e73; border-bottom: 1px solid #d2d2d7; padding-top: 0; }
.rpt tbody th { font-weight: 400; color: #6e6e73; }
.rpt .sub { font-size: 11px; color: #6e6e73; }
.rpt .mono { font-family: ui-monospace, "SF Mono", SFMono-Regular, Menlo, monospace; font-size: 11.5px; }
.rpt tr, .rpt .keep { break-inside: avoid; }
`;

function Heading({ n, children, ja }: { n?: number; children: ReactNode; ja?: string }) {
  return (
    <h2>
      {n !== undefined && <span className="n">{n}</span>}
      <span>{children}</span>
      {ja && <span className="ja">{ja}</span>}
    </h2>
  );
}

export function ReportPage() {
  const { id = "" } = useParams();
  const q = useQuery({ queryKey: ["case", id], queryFn: () => api.get<CaseView>(`/cases/${id}`) });
  const meta = useQuery({ queryKey: ["meta"], queryFn: () => api.get<Meta>("/meta") });
  const countries = useQuery({ queryKey: ["countries"], queryFn: () => api.get<CountryInfo[]>("/countries") });
  if (!q.data)
    return (
      <div className="min-h-screen bg-white p-10 text-[14px] text-[#86868b]" style={{ colorScheme: "light" }}>
        Loading…
      </div>
    );
  const { case: c, assessment: a, questions } = q.data;
  const cn = (iso: string) => (iso ? `${countries.data?.find((x) => x.iso2 === iso)?.en ?? iso} (${iso})` : "—");
  const jp = a.jurisdictions.find((j) => j.jurisdiction === "JP");
  const us = a.jurisdictions.find((j) => j.jurisdiction === "US");
  const company = meta.data?.settings.company;
  const lastDecision = [...c.review].reverse().find((r) => ["approved", "rejected"].includes(r.action));
  const redFlags = questions.filter((x) => x.group === "red_flag");

  return (
    <div className="min-h-screen bg-white text-[#1d1d1f]" style={{ colorScheme: "light" }}>
      <div className="no-print sticky top-0 z-10 border-b border-[#e5e5ea] bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex h-12 max-w-[860px] items-center gap-3 px-4">
          <Link to={`/cases/${c.id}`} className="-ml-1 inline-flex items-center gap-0.5 text-[14px] text-[#0066cc] hover:underline">
            <ChevronLeft className="size-4" strokeWidth={2} /> {c.ref}
          </Link>
          <span className="flex-1 truncate text-center text-[13px] font-medium text-[#6e6e73]">Transaction Review Record</span>
          <button onClick={() => window.print()} className="inline-flex h-[30px] items-center rounded-full bg-[#0071e3] px-4 text-[13px] font-medium text-white transition-colors hover:bg-[#0077ed]">
            Print or save as PDF
          </button>
        </div>
      </div>

      <article className="mx-auto max-w-[860px] px-6 pb-24 pt-14 sm:px-4 print:max-w-none print:px-0 print:pb-0 print:pt-0">
        <style>{STYLES}</style>
        <div className="rpt">
          <header className="flex items-start justify-between gap-8 pb-6">
            <div>
              {company && <div className="text-[12px] font-medium text-[#6e6e73]">{company}</div>}
              <h1 className="mt-1 text-[26px] font-semibold leading-tight tracking-[-0.02em]">Transaction Review Record</h1>
              <div className="mt-1 text-[13px] text-[#6e6e73]">取引審査票 · Export control determination</div>
            </div>
            <dl className="grid shrink-0 grid-cols-[auto_auto] gap-x-5 gap-y-1 pt-1 text-[12px]">
              <dt className="text-[#6e6e73]">Reference</dt>
              <dd className="mono text-right">{c.ref}</dd>
              <dt className="text-[#6e6e73]">Status</dt>
              <dd className="text-right capitalize">{c.status.replace("_", " ")}</dd>
              <dt className="text-[#6e6e73]">Printed</dt>
              <dd className="text-right">{fmtDate(new Date().toISOString())}</dd>
            </dl>
          </header>

          <div className="keep border-y-[1.5px] border-[#1d1d1f] py-4">
            <div className="text-[11px] font-medium text-[#6e6e73]">Determination</div>
            <div className="mt-0.5 text-[20px] font-semibold tracking-[-0.015em]">{OUTCOME[a.overall].label}</div>
            <div className="mt-0.5 text-[13px]">{a.headline}</div>
          </div>

          <Heading n={1} ja="件名・仕向地・用途">
            Transaction
          </Heading>
          <table>
            <tbody>
              <tr>
                <th style={{ width: 150 }}>Title</th>
                <td colSpan={3} className="font-medium">
                  {c.title}
                </td>
              </tr>
              <tr>
                <th>Ships from</th>
                <td>{cn(c.shipFrom)}</td>
                <th style={{ width: 120 }}>Destination</th>
                <td>
                  {cn(c.destination)}
                  {c.destinationRegion ? ` — ${c.destinationRegion}` : ""}
                </td>
              </tr>
              <tr>
                <th>Contract / PO</th>
                <td>{c.contractRef || "—"}</td>
                <th>Incoterms / date</th>
                <td>{[c.incoterms, c.shipDate && fmtDate(c.shipDate)].filter(Boolean).join(" · ") || "—"}</td>
              </tr>
              <tr>
                <th>Exporter of record</th>
                <td colSpan={3}>{c.exporter || "—"}</td>
              </tr>
              <tr>
                <th>Stated end use (用途)</th>
                <td colSpan={3}>{c.endUseDescription || "—"}</td>
              </tr>
            </tbody>
          </table>

          <Heading n={2}>Determination by regime</Heading>
          <table>
            <thead>
              <tr>
                <th style={{ width: 190 }}>Regime</th>
                <th style={{ width: 150 }}>Outcome</th>
                <th>Why it attaches / summary</th>
              </tr>
            </thead>
            <tbody>
              {a.jurisdictions.map((j) => (
                <tr key={j.jurisdiction}>
                  <td>{j.jurisdiction === "JP" ? "Japan — FEFTA (外為法)" : j.jurisdiction === "US" ? "United States — EAR" : "China — Export Control Law"}</td>
                  <td className="font-medium">{j.nexus.attaches === false ? "Does not attach" : OUTCOME[j.outcome].label}</td>
                  <td>{j.nexus.reasons.join("; ")}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <Heading n={3} ja="該非判定">
            Item classification
          </Heading>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th style={{ width: 150 }}>Japan (輸出令別表第一)</th>
                <th style={{ width: 150 }}>US (CCL)</th>
                <th style={{ width: 160 }}>Outcome</th>
              </tr>
            </thead>
            <tbody>
              {c.items.map((i) => {
                const ja = jp?.items.find((x) => x.itemId === i.id);
                const ua = us?.items.find((x) => x.itemId === i.id);
                return (
                  <tr key={i.id}>
                    <td>
                      <div className="font-medium">{i.name}</div>
                      <div className="sub">{[i.manufacturer, i.model, i.hsCode && `HS ${i.hsCode}`, `qty ${i.quantity}`, i.unitValue !== undefined && `${i.currency} ${i.unitValue.toLocaleString()}`].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td>
                      {i.jp.listStatus === "listed" ? `該当 ${i.jp.kou}` : i.jp.listStatus === "not_listed" ? "非該当 (1–15の項)" : "Not classified"}
                      {i.jp.classificationBasis && <div className="sub">{i.jp.classificationBasis}</div>}
                    </td>
                    <td>
                      <span className="mono">{i.us.eccn ? `${i.us.eccn}${i.us.paragraph ? `.${i.us.paragraph}` : ""}` : "—"}</span> <span className="sub">({i.us.classification})</span>
                      {i.us.classificationBasis && <div className="sub">{i.us.classificationBasis}</div>}
                    </td>
                    <td>
                      {ja && <div>JP: {ja.summary}</div>}
                      {ua && <div>US: {ua.summary}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <Heading n={4} ja="需要者・取引経路">
            Parties and screening
          </Heading>
          <table>
            <thead>
              <tr>
                <th>Party</th>
                <th style={{ width: 130 }}>Role</th>
                <th style={{ width: 120 }}>Country</th>
                <th>Screening result and disposition</th>
              </tr>
            </thead>
            <tbody>
              {c.parties.map((p) => {
                const s = c.screenings[p.id];
                return (
                  <tr key={p.id}>
                    <td>
                      <div className="font-medium">{p.name}</div>
                      {p.address && <div className="sub">{p.address}</div>}
                    </td>
                    <td>{ROLE[p.role]}</td>
                    <td>{cn(p.country)}</td>
                    <td>
                      {!s ? (
                        "Not screened"
                      ) : s.hits.length === 0 ? (
                        `No potential matches (score ≥ ${s.threshold}); screened ${fmtDate(s.ranAt)} against lists as of ${s.dataAsOf}`
                      ) : (
                        <div>
                          <div className="sub">
                            Screened {fmtDate(s.ranAt)} (lists as of {s.dataAsOf}), threshold {s.threshold}
                          </div>
                          {s.hits.map((h) => (
                            <div key={h.entryId} className="mt-0.5">
                              {LIST_NAMES[h.list]?.name ?? h.list}: {h.matchedName} ({Math.round(h.score)}) — <strong className="font-semibold">{h.disposition === "cleared" ? "not a match" : h.disposition}</strong>
                              {h.by ? `, ${h.by}` : ""}
                              {h.note ? ` — ${h.note}` : ""}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <Heading n={5} ja="用途・需要者チェック">
            End-use and end-user checks
          </Heading>
          <table>
            <tbody>
              {questions
                .filter((qq) => qq.group !== "red_flag")
                .map((qq) => (
                  <tr key={qq.id}>
                    <td>{qq.text}</td>
                    <td style={{ width: 84 }} className="font-semibold">
                      {qq.answer === "unknown" ? "—" : qq.answer === "yes" ? "Yes" : "No"}
                    </td>
                    <td style={{ width: 170 }} className="sub">
                      {qq.cite.label}
                    </td>
                  </tr>
                ))}
              <tr>
                <td>BIS red flags (Supp. No. 3 to Part 732)</td>
                <td className="font-semibold">{redFlags.filter((x) => x.answer === "yes").length} present</td>
                <td className="sub">
                  {redFlags.filter((x) => x.answer !== "unknown").length} of {redFlags.length} reviewed
                </td>
              </tr>
            </tbody>
          </table>

          <Heading n={6}>Findings and legal basis</Heading>
          {a.jurisdictions
            .filter((j) => j.nexus.attaches !== false)
            .map((j) => (
              <div key={j.jurisdiction} className="keep mb-4">
                <div className="mb-1 font-semibold">{j.jurisdiction === "JP" ? "Japan" : j.jurisdiction === "US" ? "United States" : "China"}</div>
                <ul className="space-y-1 pl-4">
                  {[...j.findings, ...j.items.flatMap((i) => i.findings)]
                    .filter((f: Finding) => f.status !== "pass" && f.status !== "info")
                    .map((f, n) => (
                      <li key={n} className="list-disc marker:text-[#86868b]">
                        {f.title}
                        {f.citations.length > 0 && <span className="sub"> — {f.citations.map((x) => x.label).join("; ")}</span>}
                      </li>
                    ))}
                </ul>
                {j.items.some((i) => i.exceptions.length) && (
                  <div className="mt-2">
                    <div className="text-[11.5px] font-semibold">Exceptions considered</div>
                    {j.items
                      .flatMap((i) => i.exceptions.map((e) => ({ e, item: c.items.find((x) => x.id === i.itemId)?.name })))
                      .map(({ e, item }, n) => (
                        <div key={n} className="mt-1">
                          {e.code} — {e.name} ({item}): {e.conditions.map((cc) => `☐ ${cc}`).join("  ")}
                        </div>
                      ))}
                  </div>
                )}
              </div>
            ))}

          <Heading n={7} ja="総合判定">
            Decision and sign-off
          </Heading>
          <div className="keep">
            <table>
              <tbody>
                <tr>
                  <th style={{ width: 150 }}>Decision</th>
                  <td>{lastDecision ? `${lastDecision.action === "approved" ? "Approved" : "Rejected"} by ${lastDecision.by || "—"} on ${fmtDate(lastDecision.at)}${lastDecision.note ? ` — ${lastDecision.note}` : ""}` : "Pending"}</td>
                </tr>
                <tr>
                  <th>Licensing path</th>
                  <td className="leading-[1.9]">
                    {["Not subject", "Not controlled (非該当)", "License exception (許可例外)", "Bulk license (包括許可)", "Individual license (個別許可)"].map((x) => (
                      <span key={x} className="mr-5 inline-block whitespace-nowrap">
                        ☐ {x}
                      </span>
                    ))}
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="mt-6 grid grid-cols-3 gap-6">
              {["Prepared by (担当者)", "Reviewed by (上長)", "Final approval (最終判断権者)"].map((x) => (
                <div key={x}>
                  <div className="h-12 border-b border-[#1d1d1f]" />
                  <div className="mt-1.5 flex justify-between text-[11px] text-[#6e6e73]">
                    <span>{x}</span>
                    <span>Date</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {c.notes && (
            <>
              <Heading>Notes</Heading>
              <div className="whitespace-pre-line">{c.notes}</div>
            </>
          )}

          <footer className="mt-10 border-t border-[#d2d2d7] pt-3 text-[10.5px] leading-relaxed text-[#6e6e73]">
            <p className="font-semibold text-[#1d1d1f]">Decision support, not legal advice.</p>
            <p className="mt-1">
              Determination computed {new Date(a.computedAt).toLocaleString("en-GB")} by {a.engineVersion} against: eCFR 15 CFR (as of {a.dataVersions.ccl}); 輸出貿易管理令 (revision {a.dataVersions.jpLaw}); 貨物等省令 ({a.dataVersions.jpList})
              {a.dataVersions.csl ? `; Consolidated Screening List (${a.dataVersions.csl})` : ""}
              {a.dataVersions.meti ? `; METI End User List (${a.dataVersions.meti})` : ""}. Kanmon is a decision-support tool; the exporter remains responsible for compliance. Retain this record (15 CFR Part 762: five years; METI guidance: seven years).
            </p>
          </footer>
        </div>
      </article>
    </div>
  );
}
