// Structured rendering of a CCL entry: license requirements, license exceptions, items, notes.
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { api, type EccnDetail } from "../lib/api.ts";
import { cx } from "../lib/format.ts";
import { Badge, Mono, SectionLabel } from "./ui/index.tsx";
import { CountryPicker } from "./CountryPicker.tsx";

const REASONS: Record<string, string> = {
  NS: "National security", MT: "Missile technology", NP: "Nuclear nonproliferation", CB: "Chemical & biological weapons",
  RS: "Regional stability", CC: "Crime control", AT: "Anti-terrorism", FC: "Firearms convention", UN: "UN embargo",
  EI: "Encryption items", SL: "Surreptitious listening", SS: "Short supply", CW: "Chemical Weapons Convention", SI: "Significant items",
};

export function EccnBody({ eccn, highlight, compact }: { eccn: EccnDetail; highlight?: string; compact?: boolean }) {
  const [dest, setDest] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (highlight) ref.current?.querySelector(`[data-ref="${highlight}"]`)?.scrollIntoView({ block: "center" });
  }, [highlight, eccn.id]);
  const check = useQuery({
    queryKey: ["eccn-check", eccn.id, dest, highlight ?? ""],
    queryFn: () => api.get<{ rows: { index: number; applies: string; licenseRequired: string; note?: string; appliesWhy: string }[] }>(`/ccl/${eccn.id}/check?dest=${dest}&para=${highlight ?? ""}`),
    enabled: !!dest,
  });
  const fields = eccn.blocks.filter((b) => b.kind === "field") as { kind: "field"; label: string; text: string }[];
  const relFields = fields.filter((f) => /^(Related Controls|Related Definitions|Unit|Technical Note)/i.test(f.label));
  return (
    <div ref={ref}>
      <div className="flex flex-wrap items-start gap-3">
        <Mono className="rounded-lg bg-panel-2 px-2 py-1 text-[15px] font-semibold ring-1 ring-line">{eccn.id}</Mono>
        <div className="min-w-0 flex-1">
          <div className={cx("font-medium leading-snug", compact ? "text-[14px]" : "text-[16px]")}>{eccn.heading.replace(/\s*\(see List of Items Controlled\)\.?/i, "")}</div>
          <div className="mt-1 text-[12px] text-fg-3">
            Category {eccn.category} — {eccn.categoryTitle.replace(/\s*\(.*$/, "")} · Group {eccn.group}
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {[...new Set(eccn.controls.map((c) => c.reason))].map((r) => (
          <Badge key={r} tone={r === "AT" ? "gray" : ["NS", "MT", "NP", "CB"].includes(r) ? "orange" : "blue"}>
            {r} <span className="font-normal opacity-70">{REASONS[r] ?? ""}</span>
          </Badge>
        ))}
        {eccn.series600 && <Badge tone="red">600 series</Badge>}
        {eccn.series515 && <Badge tone="red">9x515</Badge>}
        {eccn.meuSupp2 && <Badge tone="violet">MEU Supp. No. 2 item</Badge>}
        {eccn.itar && <Badge tone="red">Subject to the ITAR</Badge>}
      </div>

      {eccn.controls.length > 0 && (
        <div className="mt-6">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <SectionLabel>License requirements</SectionLabel>
            <div className="flex items-center gap-2 text-[12px] text-fg-3">
              Check destination
              <div className="w-52">
                <CountryPicker value={dest} onChange={setDest} placeholder="Choose a country" compact />
              </div>
            </div>
          </div>
          <div className="overflow-hidden rounded-lg border border-line">
            <table className="w-full text-[13px]">
              <thead className="bg-panel-2 text-left text-[11.5px] font-medium text-fg-3">
                <tr>
                  <th className="px-3 py-2">Control(s)</th>
                  <th className="px-3 py-2">Country Chart</th>
                  {dest && <th className="w-40 px-3 py-2">{dest}</th>}
                </tr>
              </thead>
              <tbody>
                {eccn.controls.map((c, i) => {
                  const row = check.data?.rows.find((r) => r.index === i);
                  return (
                    <tr key={i} className="border-t border-line align-top">
                      <td className="px-3 py-2 text-fg-2">
                        <span className="mr-1.5 font-mono text-[12px] font-medium text-fg">{c.reason}</span>
                        {c.scope.replace(/^[A-Z]{2,3}\s+/, "")}
                      </td>
                      <td className="px-3 py-2 text-fg-2">{c.chart}</td>
                      {dest && (
                        <td className="px-3 py-2">
                          {!row ? (
                            <span className="text-fg-3">…</span>
                          ) : row.applies === "no" ? (
                            <span className="text-[12px] text-fg-3">Not in scope</span>
                          ) : row.licenseRequired === "yes" ? (
                            <Badge tone="orange" dot>
                              License{row.applies === "maybe" ? " if in scope" : ""}
                            </Badge>
                          ) : row.licenseRequired === "no" ? (
                            <Badge tone="green" dot>
                              NLR
                            </Badge>
                          ) : (
                            <Badge tone="gray">Read text</Badge>
                          )}
                          {row?.note && <div className="mt-1 text-[11.5px] leading-snug text-fg-3">{row.note}</div>}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {eccn.licenseExceptions.length > 0 && (
        <div className="mt-6">
          <SectionLabel className="mb-2">List-based license exceptions</SectionLabel>
          <div className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2">
            {eccn.licenseExceptions.map((le) => (
              <div key={le.code} className="flex items-start gap-2 bg-panel px-3 py-2">
                <Mono className="w-16 shrink-0 pt-px font-medium">{le.code}</Mono>
                <span className={cx("text-[12.5px]", le.status === "no" ? "text-fg-3" : "text-fg-2")}>{le.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {relFields.length > 0 && (
        <div className="mt-6 space-y-2">
          {relFields.map((f) => (
            <div key={f.label} className="text-[13px] leading-relaxed">
              <span className="font-medium">{f.label}: </span>
              <span className="text-fg-2">{f.text}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6">
        <SectionLabel className="mb-2">Items</SectionLabel>
        <div className="reg-text space-y-1">
          {eccn.blocks
            .filter((b) => b.kind === "para" || b.kind === "note" || b.kind === "table")
            .map((b, i) => {
              if (b.kind === "note")
                return (
                  <div key={i} className="my-2 rounded-lg border-l-2 border-line-strong bg-panel-2/60 px-3 py-2 text-[12.5px] italic text-fg-2">
                    {b.title && <div className="mb-0.5 font-medium not-italic text-fg">{b.title}</div>}
                    <div className="whitespace-pre-line">{b.text}</div>
                  </div>
                );
              if (b.kind === "table")
                return (
                  <div key={i} className="my-2 overflow-x-auto rounded-lg border border-line">
                    <table className="w-full text-[12px]">
                      <tbody>
                        {b.rows.map((r, j) => (
                          <tr key={j} className="border-t border-line first:border-0">
                            {r.map((cell, k) => (
                              <td key={k} className="px-2 py-1 align-top text-fg-2">
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              if (b.kind !== "para") return null;
              const hi = !!highlight && !!b.ref && (b.ref === highlight || b.ref.startsWith(`${highlight}.`));
              return (
                <p key={i} data-ref={b.ref} className={cx("rounded-md px-2 py-0.5", hi ? "bg-amber-soft text-fg ring-1 ring-amber/30" : "text-fg-2")} style={{ marginLeft: `${Math.max(0, (b.depth || 1) - 1) * 18}px` }}>
                  {b.ref && <span className="mr-1.5 font-mono text-[12px] font-medium text-fg">{b.ref}.</span>}
                  {b.text}
                </p>
              );
            })}
        </div>
      </div>
      <div className="mt-6 text-[11.5px] text-fg-3">
        Source: eCFR, 15 CFR Part 774 Supp. No. 1, as amended to {eccn.stamp.asOf}.
      </div>
    </div>
  );
}
