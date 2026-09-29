// Printable transaction review record (取引審査票) with item classifications (該非判定) and screening evidence.
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import type { Finding } from "@/shared/assessment.ts";
import { api, type CaseView, type CountryInfo, type Meta } from "../lib/api.ts";
import { fmtDate, LIST_NAMES, OUTCOME } from "../lib/format.ts";

const ROLE: Record<string, string> = { end_user: "End user (需要者)", consignee: "Ultimate consignee", intermediate_consignee: "Intermediate consignee", purchaser: "Purchaser (契約先)", forwarder: "Forwarder", other: "Other" };

export function ReportPage() {
  const { id = "" } = useParams();
  const q = useQuery({ queryKey: ["case", id], queryFn: () => api.get<CaseView>(`/cases/${id}`) });
  const meta = useQuery({ queryKey: ["meta"], queryFn: () => api.get<Meta>("/meta") });
  const countries = useQuery({ queryKey: ["countries"], queryFn: () => api.get<CountryInfo[]>("/countries") });
  if (!q.data) return <div className="p-10 text-fg-3">Loading…</div>;
  const { case: c, assessment: a, questions } = q.data;
  const cn = (iso: string) => (iso ? `${countries.data?.find((x) => x.iso2 === iso)?.en ?? iso} (${iso})` : "—");
  const jp = a.jurisdictions.find((j) => j.jurisdiction === "JP");
  const us = a.jurisdictions.find((j) => j.jurisdiction === "US");
  const company = meta.data?.settings.company;
  const lastDecision = [...c.review].reverse().find((r) => ["approved", "rejected"].includes(r.action));

  return (
    <div className="min-h-screen bg-panel-2 print:bg-white">
      <div className="no-print sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-panel px-6 py-3">
        <Link to={`/cases/${c.id}`} className="inline-flex items-center gap-1.5 text-[13px] text-fg-2 hover:text-fg">
          <ArrowLeft className="size-4" /> Back to case
        </Link>
        <button onClick={() => window.print()} className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-[13px] font-medium text-accent-fg">
          <Printer className="size-3.5" /> Print / Save as PDF
        </button>
      </div>
      <article className="mx-auto my-8 max-w-[860px] bg-white px-12 py-10 text-[12.5px] leading-relaxed text-[#111] shadow-float print:my-0 print:max-w-none print:px-0 print:py-0 print:shadow-none" style={{ colorScheme: "light" }}>
        <style>{`@page { size: A4; margin: 16mm 14mm; } .rpt h2 { font-size: 13px; font-weight: 600; margin: 22px 0 8px; padding-bottom: 4px; border-bottom: 1.5px solid #111; letter-spacing: .01em } .rpt table { width: 100%; border-collapse: collapse } .rpt th, .rpt td { border: 1px solid #d4d4d8; padding: 5px 7px; text-align: left; vertical-align: top } .rpt th { background: #f4f4f5; font-weight: 600; font-size: 11.5px } .rpt tr, .rpt .keep { break-inside: avoid }`}</style>
        <div className="rpt">
          <header className="flex items-start justify-between gap-6 border-b-2 border-[#111] pb-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.08em] text-[#555]">{company || "Export control"}</div>
              <h1 className="mt-1 text-[20px] font-semibold tracking-tight">Transaction Review Record</h1>
              <div className="text-[12px] text-[#555]">取引審査票 · export control determination</div>
            </div>
            <table style={{ width: 260 }}>
              <tbody>
                <tr><th>Reference</th><td className="font-mono">{c.ref}</td></tr>
                <tr><th>Status</th><td className="capitalize">{c.status.replace("_", " ")}</td></tr>
                <tr><th>Printed</th><td>{fmtDate(new Date().toISOString())}</td></tr>
              </tbody>
            </table>
          </header>

          <h2>1. Transaction (件名・仕向地・用途)</h2>
          <table>
            <tbody>
              <tr><th style={{ width: 170 }}>Title</th><td colSpan={3}>{c.title}</td></tr>
              <tr><th>Ships from</th><td>{cn(c.shipFrom)}</td><th style={{ width: 130 }}>Destination</th><td>{cn(c.destination)}{c.destinationRegion ? ` — ${c.destinationRegion}` : ""}</td></tr>
              <tr><th>Contract / PO</th><td>{c.contractRef || "—"}</td><th>Incoterms / date</th><td>{[c.incoterms, c.shipDate && fmtDate(c.shipDate)].filter(Boolean).join(" · ") || "—"}</td></tr>
              <tr><th>Exporter of record</th><td colSpan={3}>{c.exporter || "—"}</td></tr>
              <tr><th>Stated end use (用途)</th><td colSpan={3}>{c.endUseDescription || "—"}</td></tr>
            </tbody>
          </table>

          <h2>2. Determination</h2>
          <div className="keep mb-2 flex items-center gap-3">
            <span className="rounded border border-[#111] px-2 py-0.5 text-[13px] font-semibold">{OUTCOME[a.overall].label}</span>
            <span className="font-medium">{a.headline}</span>
          </div>
          <table>
            <thead>
              <tr><th style={{ width: 170 }}>Regime</th><th style={{ width: 150 }}>Outcome</th><th>Why it attaches / summary</th></tr>
            </thead>
            <tbody>
              {a.jurisdictions.map((j) => (
                <tr key={j.jurisdiction}>
                  <td>{j.jurisdiction === "JP" ? "Japan — FEFTA (外為法)" : j.jurisdiction === "US" ? "United States — EAR" : "China — Export Control Law"}</td>
                  <td>{j.nexus.attaches === false ? "Does not attach" : OUTCOME[j.outcome].label}</td>
                  <td>{j.nexus.reasons.join("; ")}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2>3. Item classification (該非判定)</h2>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th style={{ width: 150 }}>Japan (輸出令別表第一)</th>
                <th style={{ width: 150 }}>US (CCL)</th>
                <th style={{ width: 150 }}>Outcome</th>
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
                      <div className="text-[11px] text-[#555]">{[i.manufacturer, i.model, i.hsCode && `HS ${i.hsCode}`, `qty ${i.quantity}`, i.unitValue !== undefined && `${i.currency} ${i.unitValue.toLocaleString()}`].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td>
                      {i.jp.listStatus === "listed" ? `該当 ${i.jp.kou}` : i.jp.listStatus === "not_listed" ? "非該当 (1–15の項)" : "Not classified"}
                      {i.jp.classificationBasis && <div className="text-[11px] text-[#555]">{i.jp.classificationBasis}</div>}
                    </td>
                    <td>
                      <span className="font-mono">{i.us.eccn ? `${i.us.eccn}${i.us.paragraph ? `.${i.us.paragraph}` : ""}` : "—"}</span> <span className="text-[11px] text-[#555]">({i.us.classification})</span>
                      {i.us.classificationBasis && <div className="text-[11px] text-[#555]">{i.us.classificationBasis}</div>}
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

          <h2>4. Parties and screening (需要者・取引経路)</h2>
          <table>
            <thead>
              <tr><th>Party</th><th style={{ width: 130 }}>Role</th><th style={{ width: 120 }}>Country</th><th>Screening result and disposition</th></tr>
            </thead>
            <tbody>
              {c.parties.map((p) => {
                const s = c.screenings[p.id];
                return (
                  <tr key={p.id}>
                    <td className="font-medium">{p.name}{p.address && <div className="text-[11px] font-normal text-[#555]">{p.address}</div>}</td>
                    <td>{ROLE[p.role]}</td>
                    <td>{cn(p.country)}</td>
                    <td>
                      {!s ? (
                        "Not screened"
                      ) : s.hits.length === 0 ? (
                        `No potential matches (score ≥ ${s.threshold}); screened ${fmtDate(s.ranAt)} against lists as of ${s.dataAsOf}`
                      ) : (
                        <div>
                          <div className="text-[11px] text-[#555]">Screened {fmtDate(s.ranAt)} (lists as of {s.dataAsOf}), threshold {s.threshold}</div>
                          {s.hits.map((h) => (
                            <div key={h.entryId}>
                              {LIST_NAMES[h.list]?.name ?? h.list}: {h.matchedName} ({Math.round(h.score)}) — <strong>{h.disposition === "cleared" ? "not a match" : h.disposition}</strong>
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

          <h2>5. End-use and end-user checks (用途・需要者チェック)</h2>
          <table>
            <tbody>
              {questions
                .filter((qq) => qq.group !== "red_flag")
                .map((qq) => (
                  <tr key={qq.id}>
                    <td>{qq.text}</td>
                    <td style={{ width: 70 }} className="font-semibold">{qq.answer === "unknown" ? "—" : qq.answer === "yes" ? "Yes" : "No"}</td>
                    <td style={{ width: 170 }} className="text-[11px] text-[#555]">{qq.cite.label}</td>
                  </tr>
                ))}
              <tr>
                <td>BIS red flags (Supp. No. 3 to Part 732)</td>
                <td className="font-semibold">{questions.filter((x) => x.group === "red_flag" && x.answer === "yes").length} present</td>
                <td className="text-[11px] text-[#555]">{questions.filter((x) => x.group === "red_flag" && x.answer !== "unknown").length} of {questions.filter((x) => x.group === "red_flag").length} reviewed</td>
              </tr>
            </tbody>
          </table>

          <h2>6. Findings and legal basis</h2>
          {a.jurisdictions
            .filter((j) => j.nexus.attaches !== false)
            .map((j) => (
              <div key={j.jurisdiction} className="keep mb-3">
                <div className="mb-1 font-semibold">{j.jurisdiction === "JP" ? "Japan" : j.jurisdiction === "US" ? "United States" : "China"}</div>
                <ul className="space-y-0.5 pl-4">
                  {[...j.findings, ...j.items.flatMap((i) => i.findings)]
                    .filter((f: Finding) => f.status !== "pass" && f.status !== "info")
                    .map((f, n) => (
                      <li key={n} className="list-disc">
                        <span className="font-medium">{f.title}</span>
                        {f.citations.length > 0 && <span className="text-[11px] text-[#555]"> — {f.citations.map((x) => x.label).join("; ")}</span>}
                      </li>
                    ))}
                </ul>
                {j.items.some((i) => i.exceptions.length) && (
                  <div className="mt-1.5">
                    <div className="text-[11.5px] font-semibold">Exceptions considered</div>
                    {j.items.flatMap((i) => i.exceptions.map((e) => ({ e, item: c.items.find((x) => x.id === i.itemId)?.name }))).map(({ e, item }, n) => (
                      <div key={n} className="mt-1">
                        {e.code} — {e.name} ({item}): {e.conditions.map((cc) => `☐ ${cc}`).join("  ")}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

          <h2>7. Decision and sign-off (総合判定)</h2>
          <table className="keep">
            <tbody>
              <tr><th style={{ width: 170 }}>Decision</th><td colSpan={3}>{lastDecision ? `${lastDecision.action === "approved" ? "Approved" : "Rejected"} by ${lastDecision.by || "—"} on ${fmtDate(lastDecision.at)}${lastDecision.note ? ` — ${lastDecision.note}` : ""}` : "Pending"}</td></tr>
              <tr><th>Licensing path</th><td colSpan={3}>☐ Not subject &nbsp; ☐ Not controlled (非該当) &nbsp; ☐ License exception (許可例外) &nbsp; ☐ Bulk license (包括許可) &nbsp; ☐ Individual license (個別許可)</td></tr>
              <tr style={{ height: 54 }}><th>Prepared by (担当者)</th><td /><th style={{ width: 130 }}>Reviewed by (上長)</th><td /></tr>
              <tr style={{ height: 54 }}><th>Final approval (最終判断権者)</th><td colSpan={3} /></tr>
            </tbody>
          </table>
          {c.notes && (
            <>
              <h2>Notes</h2>
              <div className="whitespace-pre-line">{c.notes}</div>
            </>
          )}
          <footer className="mt-8 border-t border-[#d4d4d8] pt-3 text-[10.5px] text-[#666]">
            Determination computed {new Date(a.computedAt).toLocaleString("en-GB")} by {a.engineVersion} against: eCFR 15 CFR (as of {a.dataVersions.ccl}); 輸出貿易管理令 (revision {a.dataVersions.jpLaw}); 貨物等省令 ({a.dataVersions.jpList}){a.dataVersions.csl ? `; Consolidated Screening List (${a.dataVersions.csl})` : ""}
            {a.dataVersions.meti ? `; METI End User List (${a.dataVersions.meti})` : ""}. Kanmon is a decision-support tool; the exporter remains responsible for compliance. Retain this record (15 CFR Part 762: five years; METI guidance: seven years).
          </footer>
        </div>
      </article>
    </div>
  );
}
