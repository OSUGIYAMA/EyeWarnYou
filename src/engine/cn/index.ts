// China — Export Control Law (出口管制法, 2020) and Regulations on Export Control of Dual-Use Items (2024).
//
// China attaches to a transaction in three ways, and EyeWarnYou reports each separately:
//   1. Ship-from: the exporter ships from China (e.g. a Chinese subsidiary) → licensing under the ECL.
//   2. Item-following: the goods are or contain China-origin controlled items → end-user commitments
//      (Regs Art. 24) and extraterritorial prohibitions (2024 No. 46, 2026 No. 1, Control List
//      designations), plus the suspended 0.1% rule (2025 No. 61).
//   3. Person-following: a party is on a MOFCOM list (Control List, Watch List, UEL, countermeasures).
import type { Case, Item } from "../../shared/case.ts";
import type { Citation, Finding, ItemAssessment, JurisdictionAssessment, Outcome } from "../../shared/assessment.ts";
import { worst } from "../../shared/assessment.ts";
import type { EngineData } from "../data.ts";
import { CN_MATERIALS, CN_MEASURES, measureState, type CnMeasure } from "./measures.ts";

const LAW = {
  ecl: { label: "出口管制法 (Export Control Law, 2020)", url: "https://exportcontrol.mofcom.gov.cn/article/zcfg/gnzcfg/flfg/202111/226.html" },
  regs: { label: "两用物项出口管制条例 (Dual-Use Items Regulations, 2024)", url: "https://exportcontrol.mofcom.gov.cn/article/zcfg/gnzcfg/gzjgfxwj/202410/1057.html" },
};
const cite = (label: string, url: string): Citation => ({ label, url });
const mcite = (m: CnMeasure): Citation => ({ label: m.announcement, url: m.url });
const measure = (id: string) => CN_MEASURES.find((m) => m.id === id)!;

const LIST_EFFECT: Record<string, { name: string; status: Finding["status"]; effect: string; cite: Citation }> = {
  "CN-ECL": {
    name: "Export Control Control List (出口管制管控名单)",
    status: "block",
    effect: "Chinese exporters may not export dual-use items to the party, and — for designations since 2026 — no organization or individual anywhere may transfer China-origin dual-use items to it.",
    cite: cite("出口管制法 第18条 / 两用物项出口管制条例 第28–30条", LAW.regs.url),
  },
  "CN-WL": {
    name: "Watch List (关注名单)",
    status: "flag",
    effect: "Chinese exporters cannot use general licences or registration filing for this party; individual licences need a risk assessment and a written commitment, and MOFCOM applies stricter end-use review (for Japanese parties: no use enhancing Japan's military capability).",
    cite: cite("两用物项出口管制条例 第26条", LAW.regs.url),
  },
  "CN-UEL": {
    name: "Unreliable Entity List (不可靠实体清单)",
    status: "block",
    effect: "Chinese organizations may not trade with the party as specified in the listing (typically: no China-related imports/exports, no new investment in China).",
    cite: cite("不可靠实体清单规定 (MOFCOM Order 2020 No. 4)", "http://exportcontrol.mofcom.gov.cn/article/cjwt/202410/1047.html"),
  },
  "CN-AFSL": {
    name: "Countermeasure list (反制清单)",
    status: "block",
    effect: "Organizations and individuals in China are prohibited from transactions and cooperation with the party (Anti-Foreign Sanctions Law).",
    cite: cite("反外国制裁法 / 实施规定 (State Council Decree No. 803)", "https://www.moj.gov.cn/pub/sfbgw/gwxw/xwyw/202503/t20250324_516274.html"),
  },
};

export interface CnOptions {
  asOf: string;
}

function hasCnContent(i: Item): boolean {
  return i.cn.materials.length > 0 || (i.countryOfOrigin === "CN" && i.cn.listStatus === "listed");
}

export function assessCn(c: Case, d: EngineData, opts: CnOptions): JurisdictionAssessment {
  const shipFromCn = c.shipFrom === "CN";
  const cnItems = c.items.filter(hasCnContent);
  const a = (id: string) => c.answers[id] ?? "unknown";
  const findings: Finding[] = [];
  const reasons: string[] = [];
  if (shipFromCn) reasons.push("Goods are exported from China — China's Export Control Law governs the export");
  if (cnItems.length) reasons.push(`${cnItems.length} item${cnItems.length > 1 ? "s" : ""} contain${cnItems.length > 1 ? "" : "s"} China-origin controlled materials, which carry end-user commitments and extraterritorial prohibitions`);

  // Person-following: MOFCOM lists
  let partyBlock = false;
  let watch = false;
  for (const p of c.parties) {
    for (const h of c.screenings[p.id]?.hits ?? []) {
      if (!h.list.startsWith("CN-")) continue;
      if (h.disposition === "pending") {
        findings.push({ id: `cn.pending.${h.entryId}`, status: "incomplete", title: `${p.name}: potential match on a Chinese list awaiting review`, citations: [] });
        continue;
      }
      if (h.disposition !== "confirmed") continue;
      const eff = LIST_EFFECT[h.list];
      const entry = d.screening(h.entryId);
      const suspended = entry?.cnStatus && entry.cnStatus !== "active" && (!entry.cnStatusUntil || opts.asOf < entry.cnStatusUntil);
      // Effects differ: Control List designations since 2026 prohibit anyone from transferring
      // China-origin dual-use items to the party; UEL and countermeasures bind organizations in China.
      const foreignTransferBan = h.list === "CN-ECL" && (entry?.startDate ?? "") >= "2026-01-01";
      if (!suspended) {
        if (h.list === "CN-WL") watch = true;
        else if (shipFromCn || (foreignTransferBan && cnItems.length)) partyBlock = true;
      }
      reasons.push(`${p.name} is on China's ${eff?.name ?? h.list}`);
      findings.push({
        id: `cn.list.${h.entryId}`,
        status: suspended ? "info" : shipFromCn || (foreignTransferBan && cnItems.length) ? (eff?.status ?? "flag") : "flag",
        title: `${p.name} is on China's ${eff?.name ?? h.list}${suspended ? ` — measures ${entry?.cnStatus}${entry?.cnStatusUntil ? ` until ${entry.cnStatusUntil}` : ""}` : ""}`,
        detail: [
          eff?.effect,
          entry?.programs[0] && `Designated by ${entry.programs[0]} (${entry.startDate}).`,
          !shipFromCn && !(foreignTransferBan && cnItems.length) ? "For this shipment (not from China) the listing is a supply-chain and Chinese-subsidiary risk rather than a direct prohibition on the exporter." : "",
          entry?.remarks,
        ].filter(Boolean).join("\n"),
        citations: [eff?.cite, entry?.sourceUrl ? cite("MOFCOM announcement", entry.sourceUrl) : undefined].filter((x): x is Citation => !!x),
        evidence: { kind: "screening", partyId: p.id, entryId: h.entryId, list: h.list, name: h.matchedName, score: h.score },
      });
    }
  }

  if (!shipFromCn && !cnItems.length && !findings.some((f) => f.id.startsWith("cn.list"))) {
    return {
      jurisdiction: "CN",
      nexus: { attaches: false, reasons: ["Not shipped from China, no China-origin controlled materials recorded, and no party on a Chinese list"] },
      outcome: "not_applicable",
      summary: "China's export controls do not attach",
      items: [],
      findings: findings.filter((f) => f.status === "incomplete"),
      actions: [],
    };
  }

  // Destination-based measures with extraterritorial reach
  const jpMil = a("cn.jpMilitary");
  const usMil = a("cn.usMilitary");
  const m2026_1 = measure("2026-1");
  const m2024_46 = measure("2024-46-1");

  const items: ItemAssessment[] = c.items.map((item) => {
    const f: Finding[] = [];
    const outcomes: Outcome[] = [];
    const itemMaterials = item.cn.materials.map((id) => CN_MATERIALS.find((m) => m.id === id)).filter((m): m is (typeof CN_MATERIALS)[number] => !!m);
    const cnOrigin = hasCnContent(item);
    if (!shipFromCn && !cnOrigin) return { itemId: item.id, outcome: "not_applicable" as Outcome, summary: "No China nexus", findings: f, exceptions: [] };

    // Commodity-specific measures touched by the item
    for (const mat of itemMaterials) {
      const m = measure(mat.measure);
      const st = measureState(m, opts.asOf);
      f.push({
        id: `cn.mat.${mat.id}`,
        status: st.active ? (shipFromCn ? "block" : "info") : "info",
        title: `${mat.label} — ${m.title} (${st.active ? "in force" : "suspended"})`,
        detail: `${m.summary}\n${st.note}.${shipFromCn ? "" : " As a foreign holder of China-origin items, the direct licensing duty sits with the Chinese exporter; your obligations come from end-user commitments and the extraterritorial measures below."}`,
        citations: [mcite(m)],
      });
      if (shipFromCn && st.active) outcomes.push("license_required");
    }

    if (shipFromCn) {
      if (item.cn.listStatus === "listed") {
        outcomes.push("license_required");
        f.push({ id: "cn.listed", status: "block", title: `Listed on China's Dual-Use Items Export Control List${item.cn.cnCode ? ` (CN ${item.cn.cnCode})` : ""} — MOFCOM export licence required`, detail: "Single licence, general licence (通用许可, ≤3 years) or registration filing as applicable; statutory review period 45 working days (Regs Art. 17).", citations: [cite("两用物项出口管制条例 第13–17条", LAW.regs.url)] });
      } else if (item.cn.listStatus === "unclassified" && !itemMaterials.length) {
        outcomes.push("incomplete");
        f.push({ id: "cn.class", status: "incomplete", title: "Classify the item against China's Dual-Use Items Export Control List", detail: "Chinese control codes reuse the Wassenaar format but not its meanings (CN 3C001 = gallium) — classify against the Chinese list itself.", citations: [cite("两用物项出口管制清单 (2024 No. 51)", "http://exportcontrol.mofcom.gov.cn/article/zcfg/gnzcfg/zcfggzqd/202411/1067.html")] });
      }
      const ca = a("cn.catchAll");
      if (ca === "yes") {
        outcomes.push("license_required");
        f.push({ id: "cn.catchall", status: "block", title: "Catch-all: licence required for items that may threaten national security, be used for WMD or terrorism", citations: [cite("出口管制法 第12条第3款", LAW.ecl.url)] });
      } else if (ca === "unknown") outcomes.push("incomplete");
    }

    if (cnOrigin || shipFromCn) {
      // Japan military users/uses (2026 No. 1) — prohibition, reaching foreign transferors of China-origin items
      if (jpMil === "yes") {
        outcomes.push("prohibited");
        f.push({ id: "cn.jp", status: "block", title: "China prohibits dual-use items for Japanese military users or uses, or anything enhancing Japan's military capability", detail: `${m2026_1.summary}${!shipFromCn ? "\nThis extends to foreign parties that transfer China-origin dual-use items to Japanese organizations for such uses." : ""}`, citations: [mcite(m2026_1)] });
      } else if (jpMil === "unknown" && (c.destination === "JP" || c.parties.some((p) => p.country === "JP"))) outcomes.push("incomplete");
      if (usMil === "yes") {
        outcomes.push("prohibited");
        f.push({ id: "cn.us", status: "block", title: "China prohibits dual-use items for US military users or uses", detail: m2024_46.summary, citations: [mcite(m2024_46)] });
      } else if (usMil === "unknown" && c.destination === "US") outcomes.push("incomplete");
      if (partyBlock) {
        outcomes.push("prohibited");
        f.push({ id: "cn.party", status: "block", title: "A party is on a Chinese restriction list — do not supply China-origin dual-use items", citations: [LIST_EFFECT["CN-ECL"].cite] });
      }
    }

    if (cnOrigin && !shipFromCn) {
      // End-user commitment (Regs Art. 24)
      const euc = a("cn.euc");
      if (euc === "yes") {
        outcomes.push("license_required");
        f.push({ id: "cn.euc", status: "flag", title: "Re-export or transfer of China-origin items acquired under a MOFCOM end-user commitment needs MOFCOM's consent", detail: "End users commit not to change the end use or transfer the items to a third party without MOFCOM permission (Regs Art. 24).", citations: [cite("两用物项出口管制条例 第24条", LAW.regs.url)] });
      } else if (euc === "unknown") outcomes.push("incomplete");

      // 2025 No. 61 — 0.1% rule for magnets and assemblies (suspended)
      const magnets = itemMaterials.some((m) => m.magnet);
      if (magnets) {
        const m61 = measure("2025-61");
        const st = measureState(m61, opts.asOf);
        const pct = item.cn.cnControlledContentPct;
        f.push({
          id: "cn.no61",
          status: st.active ? (pct === undefined || pct >= 0.1 ? "flag" : "pass") : "info",
          title: `Foreign-made items with China-origin rare earths (2025 No. 61, 0.1% rule): ${st.active ? "may apply" : "suspended"}`,
          detail: `${m61.summary}\n${st.note}.${pct !== undefined ? `\nRecorded China-origin controlled rare-earth content: ${pct}% of value (threshold 0.1%).` : "\nRecord the China-origin rare-earth value share (it is also stated in suppliers' 合规告知书 compliance notices)."}`,
          citations: [mcite(m61)],
        });
        if (st.active && (pct === undefined || pct >= 0.1)) outcomes.push(pct === undefined ? "incomplete" : "license_required");
      }
    }

    const outcome = worst(...outcomes, "no_license_required");
    const summary =
      outcome === "prohibited"
        ? "Prohibited under Chinese measures"
        : outcome === "license_required"
          ? shipFromCn
            ? "MOFCOM export licence required"
            : "MOFCOM consent / licence may be required"
          : outcome === "incomplete"
            ? "Open questions under Chinese law"
            : "No Chinese licence requirement identified";
    return { itemId: item.id, outcome, summary, findings: f, exceptions: [] };
  });

  if (watch) findings.push({ id: "cn.watch", status: "flag", title: "A party is on China's Watch List — Chinese suppliers cannot ship to it under general licences", detail: "Expect individual licences with a risk assessment and a written commitment; plan for longer lead times.", citations: [LIST_EFFECT["CN-WL"].cite] });
  // Upcoming dates worth surfacing
  for (const id of ["2025-61", "2024-46-2"]) {
    const m = measure(id);
    if (m.status === "suspended" && m.legalUntil && opts.asOf < m.legalUntil && (id !== "2024-46-2" || c.destination === "US"))
      findings.push({ id: `cn.watchdate.${id}`, status: "info", title: `${m.title}: suspended until ${m.legalUntil}${m.politicalUntil ? ` (extension to ${m.politicalUntil} agreed, not yet formalized)` : ""}`, citations: [mcite(m)] });
  }

  const attached = items.filter((i) => i.outcome !== "not_applicable");
  const outcome = worst(...attached.map((i) => i.outcome), partyBlock ? "prohibited" : "not_applicable", findings.some((f) => f.status === "incomplete") ? "incomplete" : "not_applicable", attached.length || findings.length ? "no_license_required" : "not_applicable");
  const actions: string[] = [];
  if (shipFromCn) actions.push("Apply through the MOFCOM licensing system (ecomp.mofcom.gov.cn) with an end-user / end-use certificate; declare the control code in the customs remarks field.");
  if (cnItems.length) actions.push("Keep suppliers' compliance notices (合规告知书) and end-user commitments with the item records; track China-origin controlled content by value.");
  if (partyBlock || watch) actions.push("Escalate: dealings with parties on Chinese lists affect Chinese subsidiaries and the supply of China-origin materials.");
  return {
    jurisdiction: "CN",
    nexus: { attaches: true, reasons },
    outcome,
    summary: outcome === "prohibited" ? "Prohibited under Chinese measures" : outcome === "license_required" ? "Chinese licence / consent required" : outcome === "incomplete" ? "Assessment incomplete" : "No Chinese requirement identified",
    items,
    findings,
    actions,
  };
}
