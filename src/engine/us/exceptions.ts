// License Exception screening (15 CFR Part 740). The engine surfaces *candidates* and
// the conditions an exporter must confirm; it never concludes an exception applies.
import type { Eccn } from "../../shared/regs.ts";
import type { Citation, ExceptionCandidate } from "../../shared/assessment.ts";
import { inGroup, type EngineData } from "../data.ts";

const cfr = (section: string, label = section): Citation => ({
  section: section.split("(")[0],
  label: `15 CFR ${label}`,
  url: `https://www.ecfr.gov/current/title-15/section-${section.split("(")[0]}`,
});

export interface ExceptionContext {
  eccn: Eccn;
  paragraph: string;
  destination: string;
  /** Reasons (NS, MT, …) for which the CCL/Country Chart requires a license. */
  reasons: Set<string>;
  /** A license requirement stems from Part 744 / 746 or a textual/special control. */
  nonChartRequirement: boolean;
  /** Reasons for 740.2 ineligibility already known (UVL party, embargoed destination …). */
  blockers: string[];
  netValueUsd?: number;
}

const le = (eccn: Eccn, code: string) => eccn.licenseExceptions.find((x) => x.code === code);

/**
 * Some list-based exception fields are limited to named paragraphs ("Yes, for 3A001.z.1.b").
 * Returns false when the field names paragraphs and the item's paragraph is not among them.
 */
export function fieldCoversParagraph(eccn: Eccn, text: string, paragraph: string): boolean {
  const refs = [...text.matchAll(new RegExp(`${eccn.id}\\.([a-z](?:\\.[a-z0-9]+)*)`, "g"))].map((m) => m[1]);
  // also bare continuations like "z.1.a, z.2.a" following a named paragraph
  for (const m of text.matchAll(/(?:,|and)\s+\.?([a-z]\.\d+(?:\.[a-z0-9]+)*)/g)) refs.push(m[1]);
  if (!refs.length) return true;
  if (!paragraph) return true; // unknown paragraph — keep as a possibility
  return refs.some((r) => paragraph === r || paragraph.startsWith(`${r}.`) || r.startsWith(`${paragraph}.`));
}

export function licenseExceptionCandidates(ctx: ExceptionContext, data: EngineData): { candidates: ExceptionCandidate[]; excluded: string[] } {
  const { eccn, destination: dest, reasons } = ctx;
  const excluded: string[] = [...ctx.blockers];
  const out: ExceptionCandidate[] = [];

  // §740.2 general restrictions that remove every list-based exception
  if (reasons.has("MT") && !inGroup(data, dest, "D:4", "D:5")) {
    // MT items may only use TMP/RPL/GOV/TSU/AVS/APR/STA(c)(1)(ii) — list-based LVS/GBS unavailable.
    excluded.push("MT-controlled item: only TMP, RPL, GOV, TSU, AVS, APR and limited STA are available (§740.2(a)(5))");
  }
  if (reasons.has("MT") && inGroup(data, dest, "D:4", "D:5")) excluded.push("MT-controlled item to D:4/D:5: license exceptions essentially unavailable (§740.2(a)(5)(ii))");
  if ((eccn.series600 || eccn.series515) && (inGroup(data, dest, "D:5") || dest === "HK"))
    excluded.push("9x515 / 600 series item to Country Group D:5: only GOV (and limited TMP/BAG) (§740.2(a)(12))");
  if (reasons.has("CC") && !["AU", "IN", "JP", "NZ"].includes(dest) && !inGroup(data, dest, "A:1"))
    excluded.push("Crime-control item subject to §742.7 to a non-NATO/AU/IN/JP/NZ destination (§740.2(a)(4))");
  if (/^5A980|^5A001\.f\.1/.test(`${eccn.id}.${ctx.paragraph}`)) excluded.push("Surreptitious-interception item (§740.2(a)(3))");

  if (excluded.length) return { candidates: [], excluded };

  const chartOnly = !ctx.nonChartRequirement;

  // LVS — §740.3
  const lvs = le(eccn, "LVS");
  if (chartOnly && lvs && lvs.status !== "no" && lvs.valueLimit && inGroup(data, dest, "B") && (lvs.status !== "partial" || !/^N\/A/i.test(lvs.text) || fieldCoversParagraph(eccn, lvs.text, ctx.paragraph))) {
    const within = ctx.netValueUsd === undefined ? undefined : ctx.netValueUsd <= lvs.valueLimit;
    if (within !== false)
      out.push({
        code: "LVS",
        name: "Shipments of Limited Value",
        basis: `ECCN ${eccn.id} — LVS: ${lvs.text}; destination is in Country Group B`,
        conditions: [
          `Net value of items under ${eccn.id} in the same order ≤ $${lvs.valueLimit.toLocaleString("en-US")}${ctx.netValueUsd !== undefined ? ` (this item: $${Math.round(ctx.netValueUsd).toLocaleString("en-US")})` : ""}`,
          "Orders are not split or structured to meet the limit (§740.3(d)(1)(ii)–(iii))",
          `Calendar-year total to the same consignee under ${eccn.id} ≤ 12× the LVS limit (§740.3(d)(2))`,
          ...(lvs.status === "partial" ? [`ECCN-specific limitation: "${lvs.text}"`] : []),
        ],
        citations: [cfr("740.3"), cfr("740.2")],
        strength: lvs.status === "value" && within === true ? "likely" : "possible",
      });
  }

  // GBS — §740.4: Country Group B except Sudan and Ukraine, NS-only license requirement, "GBS—Yes"
  const gbs = le(eccn, "GBS");
  const nsOnly = [...reasons].every((r) => r === "NS") && reasons.has("NS");
  if (chartOnly && gbs && gbs.status !== "no" && inGroup(data, dest, "B") && !["SD", "UA"].includes(dest) && nsOnly)
    out.push({
      code: "GBS",
      name: "Shipments to Country Group B countries",
      basis: `ECCN ${eccn.id} — GBS: ${gbs.text}; license required for NS reasons only; destination in Country Group B`,
      conditions: [
        "The Country Chart license requirement is for national security (NS) reasons only",
        ...(gbs.status === "partial" ? [`ECCN-specific limitation: "${gbs.text}"`] : []),
        "Reporting under §743.1 may apply for certain items",
      ],
      citations: [cfr("740.4"), cfr("740.2")],
      strength: gbs.status === "yes" ? "likely" : "possible",
    });

  // STA — §740.20: only for Part 742 requirements; not EI/SS/SL/CW/MT; A:5 (NS, CB, NP, RS, CC, SI) or A:6 (NS only)
  const staBlocked = ["EI", "SS", "SL", "CW", "MT"].some((r) => reasons.has(r));
  const staReasonsA5 = [...reasons].every((r) => ["NS", "CB", "NP", "RS", "CC", "SI"].includes(r));
  const staReasonsA6 = [...reasons].every((r) => r === "NS");
  const staField = eccn.blocks.find((b) => b.kind === "field" && /^STA$|License Exception STA may not be used/i.test(b.label));
  if (chartOnly && !staBlocked && reasons.size && ((inGroup(data, dest, "A:5") && staReasonsA5) || (inGroup(data, dest, "A:6") && staReasonsA6)))
    out.push({
      code: "STA",
      name: "Strategic Trade Authorization",
      basis: `Destination in Country Group ${inGroup(data, dest, "A:5") ? "A:5" : "A:6"}; reasons for control (${[...reasons].join(", ")}) are within §740.20(c)`,
      conditions: [
        "Prior consignee statement obtained and ECCN notified to the consignee (§740.20(d))",
        "Not used in lieu of any Part 744 or Part 746 requirement (§740.20(b)(2)(i))",
        ...(staField && staField.kind === "field" ? [`ECCN-specific STA condition: "${staField.text}"`] : []),
      ],
      citations: [cfr("740.20")],
      strength: "possible",
    });

  // ENC — §740.17 for 5A002/5A004/5B002/5D002/5E002 (EI)
  const enc = le(eccn, "ENC");
  if (enc && enc.status !== "no" && (reasons.has("EI") || /^5[ABDE]00[24]$/.test(eccn.id)) && fieldCoversParagraph(eccn, enc.text, ctx.paragraph))
    out.push({
      code: "ENC",
      name: "Encryption commodities, software and technology",
      basis: `ECCN ${eccn.id} — ENC: ${enc.text}`,
      conditions: [
        "Determine the applicable ENC paragraph (§740.17(a), (b)(1), (b)(2) or (b)(3)) — classification request / self-classification report may be required",
        "Government end users outside Supplement No. 3 to Part 740 are restricted under §740.17(b)(2)–(3)",
      ],
      citations: [cfr("740.17")],
      strength: "possible",
    });

  // Advanced-computing / semiconductor list-based exceptions present on the ECCN
  const advanced: Record<string, [string, string]> = {
    "NAC/ACA": ["Notified Advanced Computing / Advanced Computing Authorized", "740.8"],
    ACM: ["Advanced Compute Manufacturing", "740.2"],
    AIA: ["Artificial Intelligence Authorization", "740.27"],
    HBM: ["High Bandwidth Memory", "740.25"],
    LPP: ["Low Processing Performance", "740.29"],
  };
  for (const [code, [name, sec]] of Object.entries(advanced)) {
    const f = le(eccn, code);
    if (!f || f.status === "no") continue;
    if (!fieldCoversParagraph(eccn, f.text, ctx.paragraph)) continue;
    out.push({
      code,
      name,
      basis: `ECCN ${eccn.id} — ${code}: ${f.text}`,
      conditions: ["Review the ECCN-specific eligibility and the destination / end-user conditions of the exception", "Notification or reporting obligations may apply"],
      citations: [cfr(sec)],
      strength: "possible",
    });
  }

  return { candidates: out, excluded };
}

/** Transaction-based exceptions worth considering regardless of ECCN (always "possible"). */
export const TRANSACTION_EXCEPTIONS: { code: string; name: string; when: string; section: string }[] = [
  { code: "TMP", name: "Temporary imports, exports, reexports", when: "Tools of trade, demonstrations, exhibitions, items returned within one year", section: "740.9" },
  { code: "RPL", name: "Servicing and replacement of parts and equipment", when: "One-for-one replacement parts or servicing of previously legally exported items", section: "740.10" },
  { code: "TSU", name: "Technology and software — unrestricted", when: "Operation technology, sales technology, software updates, mass-market software", section: "740.13" },
  { code: "BAG", name: "Baggage", when: "Personal effects and tools of trade carried by travelers", section: "740.14" },
  { code: "GOV", name: "Governments and international organizations", when: "US government agencies or cooperating governments", section: "740.11" },
];
