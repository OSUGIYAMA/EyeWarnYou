// CCL-based license requirements: which reasons for control apply to the item's
// paragraph, and whether the Country Chart marks the destination for each.
import type { Eccn, EccnControl } from "../../shared/regs.ts";
import type { ChartCell } from "../../shared/assessment.ts";
import { inGroup, resolveProseCountry, type EngineData } from "../data.ts";

export type Applies = "yes" | "no" | "maybe";

/** Is the item's paragraph (e.g. "b.2.a") within a scope reference (e.g. "b.2")? */
export function paragraphRelation(itemPara: string, ref: string): "within" | "contains" | "none" {
  const a = itemPara.replace(/^\./, "").toLowerCase();
  const b = ref.replace(/^\./, "").toLowerCase();
  if (!a || !b) return "none";
  if (a === b || a.startsWith(`${b}.`)) return "within";
  if (b.startsWith(`${a}.`)) return "contains"; // item classified less precisely than the scope
  return "none";
}

export function controlApplies(ctrl: EccnControl, itemPara: string, override?: boolean): { applies: Applies; why: string } {
  if (override !== undefined) return { applies: override ? "yes" : "no", why: "Set by reviewer" };
  if (ctrl.mode === "entire") {
    return ctrl.conditional ? { applies: "maybe", why: "Scope carries a condition — confirm" } : { applies: "yes", why: "Applies to entire entry" };
  }
  if (!ctrl.paragraphs.length) return { applies: "maybe", why: "Scope could not be resolved to paragraphs — confirm" };
  if (!itemPara) return { applies: "maybe", why: "Item paragraph not specified" };
  const rel = ctrl.paragraphs.map((r) => paragraphRelation(itemPara, r));
  if (ctrl.mode === "except") {
    if (rel.includes("within")) return { applies: "no", why: `Paragraph ${itemPara} is excluded from this control` };
    if (rel.includes("contains")) return { applies: "maybe", why: `Excluded sub-paragraphs overlap ${itemPara} — classify more precisely` };
    return ctrl.conditional ? { applies: "maybe", why: "Exception text is conditional — confirm" } : { applies: "yes", why: "Applies to entire entry except other paragraphs" };
  }
  if (rel.includes("within")) return ctrl.conditional ? { applies: "maybe", why: `Paragraph ${itemPara} is in scope, subject to a condition — confirm` } : { applies: "yes", why: `Paragraph ${itemPara} is in scope` };
  if (rel.includes("contains")) return { applies: "maybe", why: `Scope covers part of ${itemPara} — classify more precisely` };
  return { applies: "no", why: `Paragraph ${itemPara} is outside this control's scope` };
}

export interface ControlEvaluation {
  index: number;
  control: EccnControl;
  applies: Applies;
  appliesWhy: string;
  /** Destination result for this control (only meaningful when applies ≠ "no"). */
  licenseRequired: "yes" | "no" | "unknown";
  cells: ChartCell[];
  note?: string;
  /** Requirement comes from free text (worldwide, §742.x, named destinations) rather than a chart column. */
  textual: boolean;
  policy?: "ai-diffusion";
  partyDependent?: "EL-FN5";
}

/** Countries named anywhere in a sentence of regulation prose. */
function mentionedCountries(text: string, data: EngineData): string[] {
  const out = new Set<string>();
  const names = ["Macau", "United Arab Emirates", "North Korea", "Pakistan", "Iraq", "Iran", "Syria", "Cuba", "China", "Russia", "Venezuela", "Belarus", "India", "Canada"];
  for (const n of names) if (new RegExp(`\\b${n}\\b`).test(text)) {
    const iso = resolveProseCountry(data, n);
    if (iso) out.add(iso);
  }
  return [...out];
}

export interface ChartTextResult {
  required: boolean;
  why: string;
  /** Provision is on the books but under a stay / non-enforcement policy (see status.ts). */
  policy?: "ai-diffusion";
  /** Requirement depends on a party (e.g. Footnote 5 Entity List entity). */
  partyDependent?: "EL-FN5";
}

/**
 * Interpret the non-column wording used in some Country Chart cells
 * (families catalogued from the full CCL; see docs/methodology.md).
 * Returns undefined when the wording is not recognized — the reviewer must read it.
 */
export function interpretChartText(text: string, dest: string, data: EngineData): ChartTextResult | undefined {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t || /^N\/A\.?$/i.test(t)) return undefined;

  // AI Diffusion Rule wording (§742.6(a)(6)(iii)(A), (a)(13)) — not enforced; apply pre-rule scope.
  if (/742\.6\(a\)\(6\)\(iii\)\(A\)|742\.6\(a\)\(13\)/.test(t)) {
    const pre = (inGroup(data, dest, "D:1", "D:4", "D:5") && !inGroup(data, dest, "A:5", "A:6")) || dest === "MO";
    return {
      required: pre,
      policy: "ai-diffusion",
      why: pre
        ? "Destination is within the pre-AI-Diffusion scope (D:1/D:4/D:5 excl. A:5/A:6, or Macau); the worldwide wording is not enforced"
        : "Worldwide wording from the AI Diffusion Rule is not enforced; destination is outside the pre-rule scope",
    };
  }
  // FN5 entity-dependent requirement (§742.6(a)(11))
  if (/742\.6\(a\)\(11\)/.test(t)) {
    return { required: false, partyDependent: "EL-FN5", why: "Applies only when a Footnote 5 Entity List entity is a party (§742.6(a)(11))" };
  }
  // Russian industry sector rows (§746.8)
  if (/^See §\s*746\.8/.test(t)) {
    const hit = ["RU", "BY"].includes(dest);
    return { required: hit, why: hit ? "Russia/Belarus sanctions (§746.8)" : "Applies to Russia and Belarus only (§746.8)" };
  }
  if (/\b(any|all) destinations? worldwide\b|\bALL destinations\b|all destinations|^Worldwide\b/i.test(t)) {
    if (/except(?:ing)? Canada/i.test(t) && dest === "CA") return { required: false, why: "Canada is excepted" };
    const note = /742\.4\(a\)\(5\)|742\.6\(a\)\(10\)/.test(t) ? " (worldwide advanced-technology control; favorable review for A:1/A:5/A:6)" : "";
    return { required: true, why: `License required to all destinations${note}` };
  }
  if (/§\s*742\.15/.test(t)) {
    return dest === "CA" ? { required: false, why: "EI controls do not apply to Canada (§742.15)" } : { required: true, why: "Encryption (EI) license requirement — see License Exception ENC (§740.17)" };
  }
  if (/§\s*742\.13/.test(t)) return { required: true, why: "Surreptitious-listening items require a license to all destinations (§742.13)" };
  if (/§\s*742\.14/.test(t)) return { required: true, why: "Significant items (SI): license required to all destinations except Canada (§742.14)" };
  if (/§\s*7[46]{2}\.1\(b\)?|UN controls/.test(t)) {
    const un = data.ear.unArmsEmbargo.includes(dest);
    return { required: un, why: un ? "Destination is under a UN Security Council arms embargo (§746.1(b))" : "Destination is not under a UN arms embargo listed in §746.1(b)(2)" };
  }
  // Country Group families: "To or within the UAE or destinations specified in Country Groups D:1, D:4, and D:5 …,
  // excluding any destination also specified in Country Groups A:5 or A:6" / "Macau or … D:5"
  if (/Country Groups?\s+[A-E]:\s?\d/.test(t)) {
    const [includePart, excludePart = ""] = t.split(/,?\s*excluding\s+/i);
    const groupsIn = [...includePart.matchAll(/\b([A-E]):\s?(\d)\b/g)].map((m) => `${m[1]}:${m[2]}`);
    const groupsOut = [...excludePart.matchAll(/\b([A-E]):\s?(\d)\b/g)].map((m) => `${m[1]}:${m[2]}`);
    const named = mentionedCountries(includePart, data);
    const hitGroup = groupsIn.find((g) => inGroup(data, dest, g as never));
    const hitNamed = named.includes(dest);
    const excluded = groupsOut.find((g) => inGroup(data, dest, g as never));
    if ((hitGroup || hitNamed) && !excluded)
      return { required: true, why: hitNamed ? "Destination is named in the requirement" : `Destination is in Country Group ${hitGroup}` };
    if (excluded) return { required: false, why: `Destination is excluded (Country Group ${excluded})` };
    return { required: false, why: "Destination is not among the listed destinations / Country Groups" };
  }
  // Named destinations: "China, Russia, or Venezuela (see § 742.6(a)(7))", "… to North Korea for anti-terrorism reasons",
  // "A license is required … for export or reexport to Iraq or Pakistan …"
  const named = mentionedCountries(t, data);
  if (named.length && (/license is required|^(China|Russia|Macau|North Korea|Iran|Iraq)/i.test(t))) {
    return named.includes(dest)
      ? { required: true, why: "Destination is named in the requirement" }
      : { required: false, why: `Applies only to ${named.join(", ")}` };
  }
  return undefined;
}

export function evaluateControls(eccn: Eccn, paragraph: string, overrides: Record<string, boolean>, dest: string, data: EngineData): ControlEvaluation[] {
  const row = data.chart.get(dest);
  return eccn.controls.map((control, index) => {
    const { applies, why } = controlApplies(control, paragraph, overrides[String(index)]);
    const cells: ChartCell[] = control.columns.map((col) => ({
      reason: col.replace(/\d$/, ""),
      column: col,
      x: !!row?.x.includes(col),
    }));
    let licenseRequired: ControlEvaluation["licenseRequired"] = "unknown";
    let note: string | undefined;
    let textual = false;
    let policy: ControlEvaluation["policy"];
    let partyDependent: ControlEvaluation["partyDependent"];
    if (control.columns.length && !control.special) {
      licenseRequired = cells.some((c) => c.x) ? "yes" : "no";
    } else if (control.columns.length && control.special) {
      // Columns plus additional prose (e.g. "RS Column 1, See § 742.6(a)(3)")
      licenseRequired = cells.some((c) => c.x) ? "yes" : "no";
      note = control.chart;
    } else {
      textual = true;
      const r = interpretChartText(control.chart, dest, data);
      if (r) {
        licenseRequired = r.required ? "yes" : "no";
        note = r.why;
        policy = r.policy;
        partyDependent = r.partyDependent;
      } else {
        note = "Requirement stated in text — read the Country Chart cell";
      }
    }
    if (!row && control.columns.length) {
      licenseRequired = "unknown";
      note = "Destination not found on the Commerce Country Chart";
    }
    return { index, control, applies, appliesWhy: why, licenseRequired, cells, note, textual, policy, partyDependent };
  });
}
