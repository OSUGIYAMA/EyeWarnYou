// United States — Export Administration Regulations (15 CFR 730–774).
//
// Order of analysis follows Part 732 ("Steps for using the EAR"):
//   1. Is the item subject to the EAR? (origin, de minimis §734.4, FDP §734.9)
//   2. Classification (ECCN / EAR99) and paragraph
//   3. CCL × Country Chart (GP1–GP3)
//   4. Destination-based controls (Part 746 embargoes and sanctions)
//   5. Parties (GP4 denial orders; Part 744 Entity List / MEU / UVL / §744.8 SDN)
//   6. End uses (Part 744) and red flags (Supp. No. 3 to Part 732)
//   7. License exception candidates (Part 740), only where the requirement is CCL-based
import type { Case, Item } from "../../shared/case.ts";
import type {
  Citation,
  ExceptionCandidate,
  Finding,
  ItemAssessment,
  JurisdictionAssessment,
  Outcome,
} from "../../shared/assessment.ts";
import { worst } from "../../shared/assessment.ts";
import type { Eccn, ScreeningEntry } from "../../shared/regs.ts";
import { countryName, inGroup, type EngineData } from "../data.ts";
import { usQuestions } from "../questions.ts";
import { evaluateControls, type ControlEvaluation } from "./ccl.ts";
import { licenseExceptionCandidates } from "./exceptions.ts";
import { FDP_GATE, relevantFdpRules } from "./fdp.ts";
import { affiliatesRuleActive, POLICY_STATUS } from "./status.ts";

export interface UsOptions {
  asOf: string; // YYYY-MM-DD — evaluation date (ship date if known)
  fxPerUsd: Record<string, number>; // units of currency per 1 USD
}

export const cfr = (id: string, label?: string): Citation => {
  const base = id.replace(/\(.*$/, "");
  const isSupp = /Supp/.test(id);
  return {
    section: base,
    label: `15 CFR ${label ?? id}`,
    url: isSupp ? undefined : `https://www.ecfr.gov/current/title-15/section-${base}`,
  };
};

const EMBARGO_ALL: Record<string, { section: string; label: string; exceptFoodMedicine: boolean; policy: string }> = {
  CU: { section: "746.2", label: "Cuba", exceptFoodMedicine: false, policy: "General policy of denial, with case-by-case and favorable categories (§746.2(b))" },
  KP: { section: "746.4", label: "North Korea", exceptFoodMedicine: true, policy: "Case-by-case; denial for luxury goods, arms, WMD-related and NP/MT items (§746.4(b))" },
  SY: { section: "746.9", label: "Syria", exceptFoodMedicine: true, policy: "Presumption of approval for commercial end uses supporting the Syrian people; otherwise case-by-case. EAR99 items may use License Exception SPP (§740.5)" },
};
const REGIONS: Record<string, string> = {
  "UA-CRIMEA": "the temporarily occupied Crimea region of Ukraine",
  "UA-DNR": 'the so-called "Donetsk People\'s Republic" region of Ukraine',
  "UA-LNR": 'the so-called "Luhansk People\'s Republic" region of Ukraine',
};
const IRAQ_REASONS = ["NS", "MT", "NP", "CW", "CB", "RS", "CC", "EI", "SI", "SL", "UN"];
const IRAQ_RS_ECCNS = ["0B999", "0D999", "1B999", "1C992", "1C995", "1C997", "1C999", "6A992"];
const SDN_744_8 = /RUSSIA-EO14024|BELARUS|UKRAINE-EO1366|UKRAINE-EO13685|\bFTO\b|SDGT|NPWMD|ILLICIT-DRUGS-EO14059|\bSDNT\b|SDNTK|\bTCO\b/;

const LIST_LABEL: Record<string, string> = {
  EL: "Entity List",
  MEU: "Military End-User List",
  UVL: "Unverified List",
  DPL: "Denied Persons List",
  SDN: "OFAC SDN List",
  SSI: "OFAC Sectoral Sanctions Identifications List",
  ISN: "State Dept. Nonproliferation Sanctions",
  DTC: "ITAR Debarred List",
  CMIC: "OFAC Non-SDN Chinese Military-Industrial Complex List",
  "NS-MBS": "OFAC Non-SDN Menu-Based Sanctions List",
  PLC: "OFAC Palestinian Legislative Council List",
  CAP: "OFAC CAPTA List",
  "METI-EUL": "METI End User List (Japan)",
};

const isFoodOrMedicine = (item: Item) => !!item.hsCode && /^(0[1-9]|1\d|2[0-4]|30)/.test(item.hsCode.replace(/\D/g, ""));
const hts6 = (item: Item) => (item.hsCode ?? "").replace(/\D/g, "").slice(0, 6);

// ---------------------------------------------------------------------------

interface TxContext {
  findings: Finding[];
  /** Requirements that apply to every item subject to the EAR (party / end-use / notice based). */
  allItems: { reason: string; cite: Citation; title: string; prohibited?: boolean }[];
  /** Requirements applying only to items whose ECCN is in a set (MEU Supp. 2). */
  meuSupp2: boolean;
  ruOilGas: boolean;
  advComp: boolean;
  uvl: boolean;
  entityFn: Set<string>;
  incomplete: boolean;
  actions: string[];
}

function screeningFindings(c: Case, d: EngineData, tx: TxContext, asOf: string) {
  const affiliatesOn = affiliatesRuleActive(asOf);
  for (const party of c.parties) {
    const scr = c.screenings[party.id];
    const who = `${party.name}${party.country ? ` (${countryName(d, party.country)})` : ""}`;
    if (!scr) {
      tx.incomplete = true;
      tx.findings.push({
        id: `us.party.${party.id}.unscreened`,
        status: "incomplete",
        title: `${who} has not been screened`,
        detail: "Screen every party against the Consolidated Screening List before relying on this assessment.",
        citations: [cfr("736.2(b)(4)", "736.2(b)(4)–(5) (GP4, GP5)")],
      });
      continue;
    }
    const pending = scr.hits.filter((h) => h.disposition === "pending" && !h.list.startsWith("CN-") && h.list !== "METI-EUL");
    if (pending.length) {
      tx.incomplete = true;
      tx.findings.push({
        id: `us.party.${party.id}.pending`,
        status: "incomplete",
        title: `${who}: ${pending.length} potential match${pending.length > 1 ? "es" : ""} awaiting review`,
        detail: pending.map((h) => `${LIST_LABEL[h.list] ?? h.list}: ${h.matchedName} (score ${h.score})`).join("\n"),
        citations: [cfr("732 Supp. 3", "732, Supp. No. 3")],
      });
    }
    for (const hit of scr.hits.filter((h) => h.disposition === "confirmed" && !h.list.startsWith("CN-") && h.list !== "METI-EUL")) {
      const entry: ScreeningEntry | undefined = d.screening(hit.entryId);
      const listName = LIST_LABEL[hit.list] ?? hit.list;
      const base = { evidence: { kind: "screening" as const, partyId: party.id, entryId: hit.entryId, list: hit.list, name: hit.matchedName, score: hit.score } };
      switch (hit.list) {
        case "DPL":
          tx.allItems.push({ reason: "GP4", cite: cfr("736.2(b)(4)", "736.2(b)(4) (GP4)"), title: `Denied Persons List: ${hit.matchedName}`, prohibited: true });
          tx.findings.push({ id: `us.dpl.${hit.entryId}`, status: "block", title: `${who} is subject to a BIS denial order`, detail: "No export, reexport or transfer may be made to or with a denied person, and no license exception is available.", citations: [cfr("736.2(b)(4)", "736.2(b)(4) (GP4)"), cfr("764.3")], ...base });
          break;
        case "EL": {
          const req = entry?.licenseRequirement ?? "See the Entity List entry";
          const fns = [...req.matchAll(/(?:footnote|FN)\s*(\d)/gi)].map((m) => m[1]);
          for (const f of fns) tx.entityFn.add(f);
          tx.allItems.push({ reason: "EL", cite: cfr("744.11"), title: `Entity List: ${hit.matchedName}` });
          tx.findings.push({
            id: `us.el.${hit.entryId}`,
            status: "block",
            title: `${who} is on the Entity List`,
            detail: `License requirement: ${req}\nLicense review policy: ${entry?.licensePolicy ?? "—"}${entry?.frNotice ? `\nFederal Register: ${entry.frNotice}` : ""}\nLicense exceptions may not be used unless the entry authorizes them (§744.11(a)).`,
            citations: [cfr("744.11"), cfr("744.16"), cfr("744 Supp. 4", "744, Supp. No. 4")],
            ...base,
          });
          break;
        }
        case "MEU":
          tx.meuSupp2 = true;
          tx.findings.push({ id: `us.meu.${hit.entryId}`, status: "block", title: `${who} is on the Military End-User List`, detail: "A license is required for items listed in Supplement No. 2 to Part 744. Presumption of denial; only GOV (§740.11(b)(2)(i)–(ii)) is available.", citations: [cfr("744.21"), cfr("744 Supp. 7", "744, Supp. No. 7")], ...base });
          break;
        case "UVL":
          tx.uvl = true;
          tx.findings.push({ id: `us.uvl.${hit.entryId}`, status: "flag", title: `${who} is on the Unverified List`, detail: "Obtain a signed UVL statement from the party before any export not requiring a license; license exceptions are unavailable (§740.2(a)(17)); file EEI/AES.", citations: [cfr("744.15"), cfr("740.2(a)(17)")], ...base });
          break;
        case "SDN": {
          const programs = entry?.programs.join(", ") ?? "";
          if (SDN_744_8.test(programs)) {
            tx.allItems.push({ reason: "744.8", cite: cfr("744.8"), title: `§744.8 SDN party: ${hit.matchedName}` });
            tx.findings.push({ id: `us.sdn8.${hit.entryId}`, status: "block", title: `${who} is an SDN subject to §744.8 (${programs})`, detail: "A BIS license is required for any item subject to the EAR when this SDN is a party; presumption of denial. OFAC authorization may also be required.", citations: [cfr("744.8")], ...base });
          } else {
            tx.findings.push({ id: `us.sdn.${hit.entryId}`, status: "block", title: `${who} is on the OFAC SDN List (${programs || "program n/a"})`, detail: "Transactions involving blocked persons are prohibited for US persons and may expose non-US persons to secondary sanctions. Escalate to legal before proceeding.", citations: [{ label: "31 CFR Chapter V (OFAC)", url: "https://ofac.treasury.gov" }], ...base });
          }
          break;
        }
        case "METI-EUL":
          break; // handled in the Japan module
        default:
          tx.findings.push({ id: `us.list.${hit.entryId}`, status: "flag", title: `${who} appears on the ${listName}`, detail: entry?.remarks || "Review the program restrictions before proceeding.", citations: entry?.sourceUrl ? [{ label: listName, url: entry.sourceUrl }] : [], ...base });
      }
    }
  }
  // Affiliates Rule: ownership question when it is (or will be) in force
  const aff = POLICY_STATUS.find((p) => p.id === "affiliates-rule")!;
  const ans = c.answers["us.affiliate50"] ?? "unknown";
  if (affiliatesOn) {
    if (ans === "yes") {
      tx.allItems.push({ reason: "EL-affiliate", cite: cfr("744.11(a)(1)"), title: "Party ≥50% owned by listed entities" });
      tx.findings.push({ id: "us.affiliate.yes", status: "block", title: "A party is ≥50% owned by Entity List / MEU-listed parties", detail: "Under the Affiliates Rule the owners' restrictions extend to the party.", citations: [cfr("744.11(a)(1)"), cfr("744 Supp. 8", "744, Supp. No. 8")] });
    } else if (ans === "unknown") {
      tx.incomplete = true;
      tx.findings.push({ id: "us.affiliate.q", status: "incomplete", title: "Ownership of parties not confirmed (Affiliates Rule in force)", detail: aff.summary, citations: [cfr("744.11(a)(1)")], question: { id: "us.affiliate50", text: "Is any party owned 50% or more (directly or indirectly, individually or in aggregate) by entities on the Entity List or MEU List?" } });
    }
  } else {
    tx.findings.push({
      id: "us.affiliate.stayed",
      status: "info",
      title: `Affiliates (50%) Rule stayed until ${aff.inactiveUntil}`,
      detail: `${aff.summary}\nShipments on or after ${aff.effectiveFrom} should be re-screened for ownership by listed entities.`,
      citations: [cfr("744.11(a)(1)")],
    });
  }
}

function endUseFindings(c: Case, d: EngineData, tx: TxContext) {
  const qs = usQuestions(d).filter((q) => q.relevant(c, d));
  const unanswered: string[] = [];
  const redFlagsYes: string[] = [];
  for (const q of qs) {
    const a = c.answers[q.id] ?? "unknown";
    if (a === "unknown") {
      unanswered.push(q.id);
      continue;
    }
    if (a !== "yes") continue;
    if (q.group === "red_flag") {
      redFlagsYes.push(q.text);
      continue;
    }
    switch (q.id) {
      case "us.meu":
        if ([c.destination, ...c.parties.map((p) => p.country)].some((x) => ["RU", "BY"].includes(x)))
          tx.allItems.push({ reason: "744.21", cite: q.cite, title: "Military end use / end user (Russia/Belarus)" });
        else tx.meuSupp2 = true;
        break;
      case "us.ruOilGas":
        tx.ruOilGas = true;
        break;
      case "us.advcomp":
        tx.advComp = true;
        tx.allItems.push({ reason: "744.23", cite: q.cite, title: "Advanced computing / semiconductor end use" });
        break;
      default:
        tx.allItems.push({ reason: q.id.replace("us.", ""), cite: q.cite, title: q.text });
    }
    tx.findings.push({ id: `us.eu.${q.id}`, status: "block", title: `End-use/end-user control triggered: ${q.cite.label}`, detail: q.text, citations: [q.cite] });
  }
  const flagQs = qs.filter((q) => q.group === "red_flag");
  const flagUnanswered = unanswered.filter((id) => id.startsWith("us.redflag"));
  const coreUnanswered = unanswered.filter((id) => !id.startsWith("us.redflag"));
  if (coreUnanswered.length) {
    tx.incomplete = true;
    tx.findings.push({
      id: "us.eu.unanswered",
      status: "incomplete",
      title: `${coreUnanswered.length} end-use / end-user question${coreUnanswered.length > 1 ? "s" : ""} unanswered`,
      detail: qs.filter((q) => coreUnanswered.includes(q.id)).map((q) => `• ${q.text}`).join("\n"),
      citations: [cfr("744.1")],
    });
  }
  if (redFlagsYes.length) {
    const resolved = c.answers["us.redflagsResolved"] ?? "unknown";
    if (resolved !== "yes") tx.incomplete = true;
    tx.findings.push({
      id: "us.redflags",
      status: resolved === "yes" ? "flag" : "incomplete",
      title: `${redFlagsYes.length} red flag${redFlagsYes.length > 1 ? "s" : ""} present — ${resolved === "yes" ? "inquiry documented as resolved" : "inquire and document before proceeding"}`,
      detail: `${redFlagsYes.map((t) => `• ${t}`).join("\n")}\nIf the red flags cannot be resolved, refrain from the transaction or disclose to BIS (GP10).`,
      citations: [cfr("732 Supp. 3", "732, Supp. No. 3"), cfr("736.2(b)(10)", "736.2(b)(10) (GP10)")],
      question: { id: "us.redflagsResolved", text: "Have you inquired into every red flag and documented why it is resolved?" },
    });
  }
  else if (flagUnanswered.length) {
    tx.incomplete = true;
    tx.findings.push({ id: "us.redflags.unanswered", status: "incomplete", title: `Know-Your-Customer review: ${flagQs.length - flagUnanswered.length} of ${flagQs.length} red flags reviewed`, citations: [cfr("732 Supp. 3", "732, Supp. No. 3")] });
  } else tx.findings.push({ id: "us.redflags.none", status: "pass", title: "No red flags identified", citations: [cfr("732 Supp. 3", "732, Supp. No. 3")] });
}

// ---------------------------------------------------------------------------

function subjectToEar(c: Case, item: Item, d: EngineData): { subject: boolean | "unknown"; findings: Finding[] } {
  const f: Finding[] = [];
  const us = item.us;
  if (us.origin === "us_origin") {
    f.push({ id: "subject.origin", status: "info", title: "US-origin item — subject to the EAR wherever located", citations: [cfr("734.3(a)(2)")] });
    return { subject: true, findings: f };
  }
  if (us.origin === "unknown") {
    f.push({ id: "subject.unknown", status: "incomplete", title: "Origin and US content not specified", detail: "State whether the item is US-origin, foreign-made with US content, or foreign-made without US content.", citations: [cfr("734.3")] });
    return { subject: "unknown", findings: f };
  }

  let subject: boolean | "unknown" = false;
  if (us.origin === "foreign_with_us_content") {
    const e1e2 = inGroup(d, c.destination, "E:1", "E:2");
    let threshold = e1e2 ? 10 : 25;
    const zero: string[] = [];
    for (const raw of us.usContentEccns) {
      const e = raw.toUpperCase();
      const is600or515 = /^\d[A-E](6\d\d|515)/.test(e);
      if (is600or515 && !/\.Y/.test(e) && inGroup(d, c.destination, "D:5")) zero.push(`${e} content to D:5 (§734.4(a)(6)(i))`);
      if (is600or515 && /\.Y/.test(e) && (inGroup(d, c.destination, "E:1", "E:2") || ["BY", "CN", "RU"].includes(c.destination))) zero.push(`${e} content (.y) to ${countryName(d, c.destination)} (§734.4(a)(6)(ii))`);
      if (/^5E002/.test(e)) zero.push("US-origin 5E002 encryption technology (§734.4(a)(2))");
      if (/^0A919/.test(e) && inGroup(d, c.destination, "D:5")) zero.push("0A919.a.1 content to D:5 (§734.4(a)(5))");
      if (/^9E003/.test(e)) zero.push("9E003 hot-section technology (§734.4(a)(4))");
    }
    if (zero.length) threshold = 0;
    if (us.usContentValue === undefined || item.unitValue === undefined || item.unitValue === 0) {
      f.push({ id: "deminimis.missing", status: "incomplete", title: "De minimis calculation needs the item value and the value of controlled US content", citations: [cfr("734.4"), cfr("734 Supp. 2", "734, Supp. No. 2")] });
      subject = "unknown";
    } else {
      const pct = (us.usContentValue / item.unitValue) * 100;
      const over = threshold === 0 ? us.usContentValue > 0 : pct > threshold;
      subject = over;
      const partner = d.ear.partnerCountries.some((p) => p.iso2 === c.shipFrom);
      const notes = [
        zero.length ? `No de minimis level applies: ${zero.join("; ")}.` : `Threshold ${threshold}% (${e1e2 ? "destination in Country Group E:1/E:2 — §734.4(c)" : "§734.4(d)"}).`,
        "Count only US content that would require a license to this destination under the Country Chart and Part 746 (not Part 744), excluding GBS-eligible content (Supp. No. 2 to Part 734).",
        ...(partner && ["RU", "BY"].includes(c.destination) ? ["Exported from a Supp. No. 3 to Part 746 country: AT-only and EAR99 US content is not counted for Russia/Belarus (§746.8(a)(12)(iii)(B))."] : []),
        "Retain the calculation method and whether values are arm's-length (§734.4(g)).",
      ];
      f.push({
        id: "deminimis",
        status: over ? "flag" : "pass",
        title: over
          ? `US controlled content ${pct.toFixed(1)}% exceeds the ${threshold}% de minimis level — item is subject to the EAR`
          : `US controlled content ${pct.toFixed(1)}% is within the ${threshold}% de minimis level — not subject to the EAR on that basis`,
        detail: notes.join("\n"),
        citations: [cfr("734.4"), cfr("734 Supp. 2", "734, Supp. No. 2")],
        evidence: { kind: "deminimis", usContent: us.usContentValue, total: item.unitValue, pct, threshold },
      });
    }
  }

  // Foreign Direct Product rules
  const gate = us.fdp[FDP_GATE.id] ?? "unknown";
  if (gate === "unknown") {
    f.push({ id: "fdp.gate", status: "incomplete", title: "Foreign Direct Product screening not answered", citations: [cfr("734.9")], question: { id: `fdp.${item.id}.gate`, text: FDP_GATE.text } });
    if (subject === false) subject = "unknown";
  } else if (gate === "yes") {
    const rules = relevantFdpRules(c, item, d);
    const yes = rules.filter((r) => us.fdp[r.id] === "yes");
    const unk = rules.filter((r) => (us.fdp[r.id] ?? "unknown") === "unknown");
    for (const r of yes) f.push({ id: `fdp.${r.id}`, status: "flag", title: `Subject to the EAR under the ${r.name} (§${r.para})`, detail: `${r.product}\n${r.scope}`, citations: [cfr(r.para)] });
    if (yes.length) subject = true;
    else if (unk.length) {
      f.push({ id: "fdp.open", status: "incomplete", title: `${unk.length} Foreign Direct Product rule${unk.length > 1 ? "s" : ""} to evaluate`, detail: unk.map((r) => `• ${r.name} (§${r.para}): ${r.scope}`).join("\n"), citations: [cfr("734.9")] });
      if (subject === false) subject = "unknown";
    } else if (!rules.length) {
      f.push({ id: "fdp.none", status: "pass", title: "No Foreign Direct Product rule reaches this destination", detail: d.ear.partnerCountries.some((p) => p.iso2 === c.shipFrom) ? `Exports from ${countryName(d, c.shipFrom)} are excluded from the Russia/Belarus/Crimea and Iran FDP rules (Supp. No. 3 to Part 746).` : undefined, citations: [cfr("734.9")] });
    }
  } else {
    f.push({ id: "fdp.gate.no", status: "pass", title: "Not a direct product of US-origin technology or software", citations: [cfr("734.9")] });
  }
  if (subject === false && us.origin === "foreign_no_us_content")
    f.push({ id: "subject.no", status: "pass", title: "Foreign-made item without US content — not subject to the EAR", citations: [cfr("734.3(b)")] });
  return { subject, findings: f };
}

// ---------------------------------------------------------------------------

function assessItem(c: Case, item: Item, d: EngineData, tx: TxContext, opts: UsOptions): ItemAssessment & { subject: boolean | "unknown" } {
  const findings: Finding[] = [];
  const exceptions: ExceptionCandidate[] = [];
  const outcomes: Outcome[] = [];
  const dest = c.destination;

  const subj = subjectToEar(c, item, d);
  findings.push(...subj.findings);
  if (subj.subject === false) {
    return { itemId: item.id, outcome: "not_applicable", summary: "Not subject to the EAR", findings, exceptions, subject: false };
  }
  if (subj.subject === "unknown") outcomes.push("incomplete");

  // ---- Classification
  const eccnId = item.us.eccn.trim().toUpperCase();
  let eccn: Eccn | undefined;
  const ear99 = eccnId === "EAR99";
  if (!eccnId) {
    findings.push({ id: "class.missing", status: "incomplete", title: "Item not classified (ECCN or EAR99)", detail: "Classify against the Commerce Control List (Supp. No. 1 to Part 774), following the Order of Review in Supp. No. 4 to Part 774.", citations: [cfr("774 Supp. 4", "774, Supp. No. 4"), cfr("734.3(c)")] });
    outcomes.push("incomplete");
  } else if (!ear99) {
    eccn = d.ccl.get(eccnId.slice(0, 5));
    if (!eccn) {
      findings.push({ id: "class.unknown", status: "incomplete", title: `ECCN ${eccnId} not found in the current CCL`, citations: [cfr("774 Supp. 1", "774, Supp. No. 1")] });
      outcomes.push("incomplete");
    } else if (eccn.itar) {
      findings.push({ id: "class.itar", status: "block", title: `${eccn.id}: items are subject to the ITAR, not the EAR`, detail: "Consult the Directorate of Defense Trade Controls (22 CFR 120–130).", citations: [cfr("774 Supp. 1", `774, Supp. No. 1 — ${eccn.id}`)] });
      outcomes.push("license_required");
    }
  }
  if (item.us.classification === "provisional" && eccnId)
    findings.push({ id: "class.provisional", status: "flag", title: `Classification ${eccnId}${item.us.paragraph ? `.${item.us.paragraph}` : ""} is provisional`, detail: "Confirm with the manufacturer or through a BIS commodity classification (CCATS) before relying on it.", citations: [cfr("748.3")] });

  const reasons = new Set<string>();
  let nonChart = false;
  const requirementTitles: string[] = [];
  let prohibited = false;

  // ---- CCL × Country Chart
  let evals: ControlEvaluation[] = [];
  if (eccn && !eccn.itar && dest) {
    evals = evaluateControls(eccn, item.us.paragraph, item.us.controlOverrides, dest, d);
    for (const ev of evals) {
      const label = `${ev.control.reason}${ev.control.columns.length ? ` (${ev.control.columns.join(", ")})` : ""}`;
      const evidence = { kind: "control" as const, eccn: eccn.id, scope: ev.control.scope, chart: ev.control.chart, applies: ev.applies, columns: ev.control.columns };
      if (ev.applies === "no") continue;
      if (ev.applies === "maybe") {
        findings.push({ id: `ccl.${ev.index}.scope`, status: "incomplete", title: `Confirm whether ${label} applies — ${ev.appliesWhy}`, detail: `Scope: ${ev.control.scope}\nCountry Chart: ${ev.control.chart}${ev.licenseRequired === "yes" ? `\nIf it applies, a license is required to ${countryName(d, dest)}.` : ev.licenseRequired === "no" ? `\nEven if it applies, no license is required to ${countryName(d, dest)} for this reason.` : ""}`, citations: [cfr("774 Supp. 1", `774, Supp. No. 1 — ${eccn.id}`)], evidence, question: { id: `ctl.${item.id}.${ev.index}`, text: `Does "${ev.control.scope}" cover this item?` } });
        if (ev.licenseRequired !== "no") outcomes.push("incomplete");
        continue;
      }
      if (ev.licenseRequired === "yes") {
        reasons.add(ev.control.reason);
        if (ev.textual || ev.control.special) nonChart = nonChart || ev.textual;
        requirementTitles.push(`${label}`);
        findings.push({
          id: `ccl.${ev.index}`,
          status: "block",
          title: `License required — ${label}${ev.cells.some((x) => x.x) ? ` (X for ${countryName(d, dest)} on the Country Chart)` : ""}`,
          detail: [ev.control.scope, ev.note, ev.policy === "ai-diffusion" ? "Note: AI Diffusion Rule text is not enforced; pre-rule scope applied." : ""].filter(Boolean).join("\n"),
          citations: [cfr("738 Supp. 1", "738, Supp. No. 1 (Country Chart)"), cfr("774 Supp. 1", `774, Supp. No. 1 — ${eccn.id}`)],
          evidence: ev.cells.length ? { kind: "chart", country: dest, cells: ev.cells } : evidence,
        });
      } else if (ev.licenseRequired === "no") {
        findings.push({ id: `ccl.${ev.index}`, status: "pass", title: `No license required for ${label} to ${countryName(d, dest)}`, detail: [ev.note, ev.partyDependent === "EL-FN5" && tx.entityFn.has("5") ? "A Footnote 5 Entity List party is involved — this control applies." : ""].filter(Boolean).join("\n") || undefined, citations: [cfr("738 Supp. 1", "738, Supp. No. 1 (Country Chart)")], evidence: ev.cells.length ? { kind: "chart", country: dest, cells: ev.cells } : evidence });
        if (ev.partyDependent === "EL-FN5" && tx.entityFn.has("5")) {
          reasons.add(ev.control.reason);
          nonChart = true;
          requirementTitles.push(`${label} (Footnote 5 party)`);
        }
      } else {
        findings.push({ id: `ccl.${ev.index}.manual`, status: "flag", title: `${label}: requirement stated in text — review`, detail: `${ev.control.scope}\n${ev.control.chart}`, citations: [cfr("774 Supp. 1", `774, Supp. No. 1 — ${eccn.id}`)], evidence });
        outcomes.push("incomplete");
      }
    }
    if (!eccn.controls.length && !eccn.itar)
      findings.push({ id: "ccl.none", status: "flag", title: `${eccn.id} has no License Requirements table — read the entry`, detail: eccn.heading, citations: [cfr("774 Supp. 1", `774, Supp. No. 1 — ${eccn.id}`)] });
  }
  if (ear99) findings.push({ id: "ccl.ear99", status: "pass", title: "EAR99 — no CCL-based license requirement", detail: "EAR99 items can still require a license for embargoed destinations, prohibited end uses, or restricted parties.", citations: [cfr("734.3(c)")] });

  // ---- Destination-based controls (Part 746)
  const onCcl = !!eccn && !ear99;
  const require = (id: string, title: string, cite: Citation, detail?: string, isNonChart = true) => {
    reasons.add(id);
    nonChart = nonChart || isNonChart;
    requirementTitles.push(title);
    findings.push({ id: `dest.${id}`, status: "block", title: `License required — ${title}`, detail, citations: [cite] });
  };
  if (dest && EMBARGO_ALL[dest]) {
    const e = EMBARGO_ALL[dest];
    if (!(e.exceptFoodMedicine && ear99 && isFoodOrMedicine(item))) require(e.section, `${e.label} (all items subject to the EAR${e.exceptFoodMedicine ? " except EAR99 food and medicine" : ""})`, cfr(e.section), e.policy);
    else findings.push({ id: `dest.${e.section}.food`, status: "pass", title: `EAR99 food/medicine excepted from the ${e.label} requirement`, citations: [cfr(e.section)] });
  }
  if (c.destinationRegion && REGIONS[c.destinationRegion]) {
    if (!(ear99 && isFoodOrMedicine(item))) require("746.6", `${REGIONS[c.destinationRegion]} (all items except EAR99 food and medicine)`, cfr("746.6"), "Policy of denial.");
  }
  if (dest === "IR") {
    if (onCcl) require("746.7", "Iran — CCL item (§746.7(a)(1)(i))", cfr("746.7(a)(1)(i)"), "Licenses generally denied. The OFAC Iranian Transactions and Sanctions Regulations (31 CFR 560) also apply.");
    else if (ear99 && d.ear.russiaHts.supp7.includes(hts6(item))) require("746.7", "Iran — EAR99 item in Supp. No. 7 to Part 746", cfr("746 Supp. 7", "746, Supp. No. 7"));
    findings.push({ id: "dest.ir.ofac", status: "block", title: "Iran is subject to a comprehensive OFAC embargo", detail: "Reexports of US-origin goods and many transactions involving US persons or the US financial system are prohibited under 31 CFR 560. An OFAC-prohibited export is also an EAR violation (§746.7(e)).", citations: [cfr("746.7(e)"), { label: "31 CFR Part 560", url: "https://www.ecfr.gov/current/title-31/subtitle-B/chapter-V/part-560" }] });
    outcomes.push("license_required");
  }
  if (["RU", "BY"].includes(dest)) {
    const name = countryName(d, dest);
    if (onCcl) require("746.8(a)(1)", `${name} — every item on the CCL (§746.8(a)(1))`, cfr("746.8(a)(1)"), "Policy of denial, with limited case-by-case categories (§746.8(b)).");
    else if (ear99) {
      const h = hts6(item);
      if (!h) findings.push({ id: "dest.ru.hts", status: "incomplete", title: `Provide the HS code to check EAR99 sanctions lists for ${name}`, detail: "Supplements No. 2, 4, 5 and 6 to Part 746 impose license requirements on EAR99 items by HTS code / CAS number.", citations: [cfr("746.8")] }), outcomes.push("incomplete");
      else {
        const lists: [keyof typeof d.ear.russiaHts, string, string][] = [["supp4", "Supp. No. 4 (industrial items)", "746.8(a)(5)"], ["supp5", "Supp. No. 5 (luxury goods)", "746.8(a)(7)"]];
        let hit = false;
        for (const [k, label, para] of lists) if (d.ear.russiaHts[k].some((code) => h.startsWith(code))) {
          hit = true;
          require(para, `${name} — HTS ${h} is listed in ${label} to Part 746`, cfr(para));
        }
        if (d.ear.russiaHts.supp2.some((code) => h.startsWith(code)) && tx.ruOilGas) require("746.8(a)(4)", `${name} — oil & gas exploration/production (Supp. No. 2 to Part 746)`, cfr("746.8(a)(4)"));
        if (!hit) findings.push({ id: "dest.ru.hts.clear", status: "pass", title: `HTS ${h} is not listed in Supp. No. 4 or 5 to Part 746`, detail: "Also confirm the item is not a Supp. No. 6 chemical/biological item (by CAS) or EAR99 enterprise software under §746.8(a)(8).", citations: [cfr("746.8")] });
      }
      if (item.kind === "software") findings.push({ id: "dest.ru.sw", status: "flag", title: "EAR99 enterprise software (ERP, CRM, CAD, PLM, etc.) requires a license to Russia/Belarus", citations: [cfr("746.8(a)(8)")] });
    }
  }
  if (dest === "IQ" && eccn) {
    const rs = [...reasons].filter((r) => IRAQ_REASONS.includes(r));
    if (IRAQ_RS_ECCNS.includes(eccn.id)) require("746.3", "Iraq — regional stability ECCN (§746.3(a)(3))", cfr("746.3(a)(3)"));
    else if (!rs.length && eccn.controls.some((ct) => IRAQ_REASONS.includes(ct.reason))) require("746.3", "Iraq — CCL item controlled for listed reasons (§746.3(a)(1))", cfr("746.3(a)(1)"));
  }

  // ---- Party / end-use / notice requirements
  for (const r of tx.allItems) {
    if (r.prohibited) prohibited = true;
    reasons.add(r.reason);
    nonChart = true;
    requirementTitles.push(r.title);
  }
  if (tx.meuSupp2 && eccn && d.ear.meuEccns.includes(eccn.id)) {
    reasons.add("744.21");
    nonChart = true;
    requirementTitles.push("Military end use / end user (Supp. No. 2 to Part 744)");
    findings.push({ id: "eu.meu.item", status: "block", title: `${eccn.id} is listed in Supp. No. 2 to Part 744 — MEU license requirement applies`, citations: [cfr("744.21"), cfr("744 Supp. 2", "744, Supp. No. 2")] });
  }

  // ---- Outcome and license exceptions
  let summary: string;
  if (prohibited) {
    outcomes.push("prohibited");
    summary = "Prohibited — denied party";
  } else if (reasons.size) {
    const netUsd = item.unitValue !== undefined ? (item.unitValue * item.quantity) / (opts.fxPerUsd[item.currency] ?? 1) : undefined;
    const chartReasons = new Set([...reasons].filter((r) => /^[A-Z]{2,3}$/.test(r)));
    const blockers: string[] = [];
    if (tx.uvl) blockers.push("A party is on the Unverified List (§740.2(a)(17))");
    if (dest && (EMBARGO_ALL[dest] || dest === "IR" || c.destinationRegion)) blockers.push("Sanctioned destination — only the exceptions listed in Part 746 (§740.2(a)(6))");
    if (eccn && !nonChart) {
      const le = licenseExceptionCandidates({ eccn, paragraph: item.us.paragraph, destination: dest, reasons: chartReasons, nonChartRequirement: nonChart, blockers, netValueUsd: netUsd }, d);
      exceptions.push(...le.candidates);
      if (le.excluded.length) findings.push({ id: "le.excluded", status: "info", title: "License exceptions restricted", detail: le.excluded.map((x) => `• ${x}`).join("\n"), citations: [cfr("740.2")] });
    } else if (eccn && nonChart) {
      findings.push({ id: "le.na", status: "info", title: "List-based license exceptions do not overcome Part 744 / 746 or party-based requirements", citations: [cfr("740.2(a)"), cfr("740.20(b)(2)(i)")] });
    }
    if (exceptions.length) {
      outcomes.push("exception_available");
      summary = `License required (${requirementTitles.slice(0, 3).join("; ")}) — exception candidate${exceptions.length > 1 ? "s" : ""}: ${exceptions.map((x) => x.code).join(", ")}`;
    } else {
      outcomes.push("license_required");
      summary = `License required — ${requirementTitles.slice(0, 3).join("; ")}${requirementTitles.length > 3 ? ` +${requirementTitles.length - 3}` : ""}`;
    }
  } else {
    outcomes.push(eccnId ? "no_license_required" : "incomplete");
    summary = eccnId ? `No license required (NLR) — ${ear99 ? "EAR99" : eccnId}` : "Classification required";
  }
  const outcome = worst(...outcomes);
  if (outcome === "incomplete" && !reasons.size) summary = subj.subject === "unknown" ? "Jurisdiction undetermined — complete origin / de minimis / FDP" : summary.startsWith("No license") ? `${summary} — pending open questions` : summary;
  return { itemId: item.id, outcome, summary, findings, exceptions, subject: subj.subject };
}

// ---------------------------------------------------------------------------

export function assessUs(c: Case, d: EngineData, opts: UsOptions): JurisdictionAssessment {
  const tx: TxContext = { findings: [], allItems: [], meuSupp2: false, ruOilGas: false, advComp: false, uvl: false, entityFn: new Set(), incomplete: false, actions: [] };

  if (!c.destination) {
    tx.findings.push({ id: "us.dest", status: "incomplete", title: "Destination country not specified", citations: [cfr("732.3")] });
    tx.incomplete = true;
  } else {
    const row = d.chart.get(c.destination);
    const groups = d.groups[c.destination] ?? [];
    tx.findings.push({
      id: "us.dest.profile",
      status: "info",
      title: `${countryName(d, c.destination)}${c.destinationRegion && REGIONS[c.destinationRegion] ? ` — ${REGIONS[c.destinationRegion]}` : ""}: Country Groups ${groups.join(", ") || "—"}`,
      detail: row?.footnotes.length ? row.footnotes.map((n) => `Country Chart footnote ${n}: ${d.chartFootnotes[String(n)] ?? ""}`).join("\n") : undefined,
      citations: [cfr("740 Supp. 1", "740, Supp. No. 1 (Country Groups)")],
    });
  }
  screeningFindings(c, d, tx, opts.asOf);
  endUseFindings(c, d, tx);

  const assessed = c.items.map((item) => assessItem(c, item, d, tx, opts));
  const items: ItemAssessment[] = assessed.map(({ subject: _s, ...rest }) => rest);
  const subjectItems = items.filter((i) => i.outcome !== "not_applicable");
  const attaches: boolean | "unknown" = assessed.some((a) => a.subject === true)
    ? true
    : assessed.some((a) => a.subject === "unknown") || !c.items.length
      ? "unknown"
      : false;

  const reasons: string[] = [];
  for (const i of items) {
    const item = c.items.find((x) => x.id === i.itemId)!;
    if (item.us.origin === "us_origin") reasons.push(`${item.name}: US-origin`);
    const dm = i.findings.find((f) => f.id === "deminimis");
    if (dm?.evidence?.kind === "deminimis") reasons.push(`${item.name}: US content ${dm.evidence.pct.toFixed(1)}% vs ${dm.evidence.threshold}% de minimis`);
    for (const f of i.findings.filter((x) => x.id.startsWith("fdp.") && x.status === "flag")) reasons.push(`${item.name}: ${f.title}`);
  }

  if (attaches === false) {
    return {
      jurisdiction: "US",
      nexus: { attaches: false, reasons: reasons.length ? reasons : ["No item is subject to the EAR (no US origin, US content within de minimis, no FDP rule)"] },
      outcome: "not_applicable",
      summary: "EAR does not apply to this transaction",
      items,
      findings: tx.findings.filter((f) => f.status === "block" && f.id.startsWith("us.sdn")),
      actions: [],
    };
  }

  const itemOutcome = worst(...subjectItems.map((i) => i.outcome));
  const outcome = worst(itemOutcome, tx.incomplete && itemOutcome === "no_license_required" ? "incomplete" : "not_applicable");
  const actions: string[] = [];
  if (outcome === "license_required" || outcome === "prohibited") actions.push("Do not ship until a BIS license (SNAP-R, 15 CFR Part 748) is obtained or the requirement is resolved.");
  if (outcome === "exception_available") actions.push("Confirm every condition of the selected license exception and record it with the shipment (§740.1(e) / §758.1).");
  if (items.some((i) => i.findings.some((f) => f.id === "class.provisional"))) actions.push("Confirm provisional classifications with the manufacturer or via a CCATS request.");
  if (tx.findings.some((f) => f.status === "incomplete")) actions.push("Resolve open screening matches and answer the end-use questions.");
  actions.push("Retain records for five years (15 CFR Part 762).");

  const summaryMap: Record<Outcome, string> = {
    prohibited: "Prohibited under the EAR",
    license_required: "BIS license required",
    exception_available: "License required — license exception may be available",
    incomplete: "Assessment incomplete",
    no_license_required: "No license required (NLR)",
    not_applicable: "EAR does not apply",
  };
  return {
    jurisdiction: "US",
    nexus: { attaches, reasons: reasons.length ? reasons : ["Pending item information"] },
    outcome,
    summary: summaryMap[outcome],
    items,
    findings: tx.findings,
    actions,
  };
}
