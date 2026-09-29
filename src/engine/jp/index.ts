// Japan — Foreign Exchange and Foreign Trade Act (外為法) and the Export Trade Control Order (輸出令).
//
// Goods exported from Japan are analysed in the order the law is structured:
//   1. List control (輸出令別表第一 1–15の項)            → license (外為法第48条第1項, 輸出令第1条)
//      with the small-value exception (輸出令第4条第1項第5号) as a candidate
//   2. Catch-all (16の項（1）/（2）)                      → license unless 輸出令第4条第1項第3号/第4号 applies
//      – WMD: 用途要件 / 需要者要件 (核兵器等おそれ省令) and METI notification (インフォーム)
//      – Conventional: 用途 / 需要者 (通常兵器おそれ省令) — all non-Group-A destinations for 16の項（1）,
//        UN-arms-embargo destinations (別表第三の二) for 16の項（2）
//   3. Export approval regimes (外為法第48条第3項, 輸出令第2条): Russia/Belarus, diversion countries,
//      occupied regions of Ukraine, North Korea
import type { Case, Item } from "../../shared/case.ts";
import type { Citation, ExceptionCandidate, Finding, ItemAssessment, JurisdictionAssessment, Outcome } from "../../shared/assessment.ts";
import { worst } from "../../shared/assessment.ts";
import { countryName, type EngineData } from "../data.ts";

export interface JpOptions {
  fxPerUsd: Record<string, number>;
  /** Bulk licenses (包括許可) held by the exporter, if any. */
  bulkLicenses?: string[];
}

const LAW = {
  fefta: "https://laws.e-gov.go.jp/law/324AC0000000228",
  order: "https://laws.e-gov.go.jp/law/324CO0000000378",
  wmd: "https://laws.e-gov.go.jp/law/413M60000400249",
  conv: "https://laws.e-gov.go.jp/law/420M60000400057",
  goods: "https://laws.e-gov.go.jp/law/403M50000400049",
};
const cite = (label: string, url: string, section?: string): Citation => ({ label, url, section });
const C = {
  art48_1: cite("外為法 第48条第1項", LAW.fefta, "jp:324AC0000000228:48"),
  art48_3: cite("外為法 第48条第3項", LAW.fefta, "jp:324AC0000000228:48"),
  art25: cite("外為法 第25条第1項（役務取引）", LAW.fefta, "jp:324AC0000000228:25"),
  order1: cite("輸出令 第1条第1項・別表第一", LAW.order, "jp:324CO0000000378:別表第一"),
  order2: cite("輸出令 第2条第1項（輸出承認）", LAW.order, "jp:324CO0000000378:2"),
  order4_3: cite("輸出令 第4条第1項第3号", LAW.order, "jp:324CO0000000378:4"),
  order4_4: cite("輸出令 第4条第1項第4号", LAW.order, "jp:324CO0000000378:4"),
  order4_5: cite("輸出令 第4条第1項第5号（少額特例）", LAW.order, "jp:324CO0000000378:4"),
  appx3: cite("輸出令 別表第三（グループA）", LAW.order, "jp:324CO0000000378:別表第三"),
  appx3_2: cite("輸出令 別表第三の二（国連武器禁輸国・地域）", LAW.order, "jp:324CO0000000378:別表第三の二"),
  appx3_3: cite("輸出令 別表第三の三", LAW.order, "jp:324CO0000000378:別表第三の三"),
  appx4: cite("輸出令 別表第四（懸念国）", LAW.order, "jp:324CO0000000378:別表第四"),
  appx2_3: cite("輸出令 別表第二の三", LAW.order, "jp:324CO0000000378:別表第二の三"),
  appx2_4: cite("輸出令 別表第二の四", LAW.order, "jp:324CO0000000378:別表第二の四"),
  wmd: cite("核兵器等おそれ省令（平成13年経済産業省令第249号）", LAW.wmd, "jp:413M60000400249:main"),
  conv: cite("通常兵器おそれ省令（平成20年経済産業省令第57号）", LAW.conv, "jp:420M60000400057:main"),
  goods16: cite("貨物等省令 第14条の2", LAW.goods, "jp:403M50000400049:14_2"),
};

/** Sub-items of 別表第一 listed in 別表第三の三 (5万円 threshold if designated by METI notice). */
const APPX3_3 = [/^5の項（1[48]）/, /^7の項（(2|15)）/, /^8の項/, /^9の項（[16]）/, /^10の項（(1|2|4|6|7|9|9の2|11)）/, /^12の項（[1256]）/, /^13の項（5）/];

export function catchAllScopeFromHs(hs: string | undefined, d: EngineData): "16-1" | "16-2" | "out_of_scope" | "unknown" {
  const h = (hs ?? "").replace(/\D/g, "");
  if (h.length < 4) return "unknown";
  const { include, exclude } = d.jpDerived.catchAll16_1;
  if (!exclude.some((e) => h.startsWith(e)) && include.some((p) => h.startsWith(p))) return "16-1";
  if (d.jpDerived.catchAll16_2Chapters.includes(h.slice(0, 2))) return "16-2";
  return "out_of_scope";
}

const kouNumber = (kou: string) => {
  const m = kou.match(/^(\d+)(?:の(\d+))?の項/);
  return m ? { n: Number(m[1]), sub: m[2] } : undefined;
};

function toJpy(value: number, currency: string, fx: Record<string, number>): number {
  const perUsd = fx[currency] ?? 1;
  return (value / perUsd) * (fx.JPY ?? 150);
}

interface JpTx {
  findings: Finding[];
  wmdTrigger: string[];
  convTrigger: string[]; // notification-based (any tier)
  convUse: boolean;
  convUser: boolean;
  convClear: boolean;
  wmdUnknown: string[];
  convUnknown: string[];
  eulWmd: boolean;
  eulCw: boolean;
  informWmd: boolean;
  informConv: boolean;
  designated: "yes" | "no" | "unknown";
  incomplete: boolean;
}

function transaction(c: Case, d: EngineData): JpTx {
  const a = (id: string) => c.answers[id] ?? "unknown";
  const tx: JpTx = {
    findings: [], wmdTrigger: [], convTrigger: [], convUse: false, convUser: false, convClear: false,
    wmdUnknown: [], convUnknown: [], eulWmd: false, eulCw: false,
    informWmd: a("jp.informWmd") === "yes", informConv: a("jp.informConv") === "yes",
    designated: a("jp.designated") as JpTx["designated"], incomplete: false,
  };
  const dest = c.destination;

  // METI End User List hits — concern codes decide which end-user requirement they satisfy
  for (const party of c.parties) {
    for (const hit of c.screenings[party.id]?.hits ?? []) {
      if (hit.list !== "METI-EUL") continue;
      if (hit.disposition === "pending") {
        tx.incomplete = true;
        continue;
      }
      if (hit.disposition !== "confirmed") continue;
      const entry = d.screening(hit.entryId);
      const codes = entry?.concern ?? [];
      if (!codes.length || codes.some((x) => ["B", "C", "M", "N"].includes(x))) tx.eulWmd = true;
      if (codes.includes("CW")) tx.eulCw = true;
      tx.findings.push({
        id: `jp.eul.${hit.entryId}`,
        status: "block",
        title: `${party.name} is on METI's End User List (外国ユーザーリスト)`,
        detail: `Concern type: ${codes.join(", ") || "—"} (B biological, C chemical, M missile, N nuclear, CW conventional weapons). For non-Group-A destinations a listing satisfies the matching end-user requirement (需要者要件) unless the 明らかガイドライン shows the goods will clearly not be used for that purpose.`,
        citations: [C.wmd, C.conv, C.order4_3],
        evidence: { kind: "screening", partyId: party.id, entryId: hit.entryId, list: hit.list, name: hit.matchedName, score: hit.score },
      });
    }
  }

  if (!dest) return tx;
  const groupA = d.jp.groupA.includes(dest);
  const unEmbargo = d.jp.unArmsEmbargo.includes(dest);
  const concern = d.jp.concern.includes(dest);
  tx.findings.push({
    id: "jp.dest",
    status: groupA ? "pass" : concern ? "flag" : "info",
    title: `${countryName(d, dest)}: ${
      groupA
        ? "Group A (別表第三) — only METI notifications (インフォーム) apply under the catch-all"
        : concern
          ? "Country of concern (別表第四) — small-value exception unavailable"
          : unEmbargo
            ? "UN arms-embargo destination (別表第三の二) — conventional-weapons use and end-user requirements apply to all 16の項 goods"
            : "General destination — WMD catch-all for all 16の項 goods; conventional-weapons use / end-user requirements for 16の項（1）"
    }`,
    citations: [groupA ? C.appx3 : concern ? C.appx4 : unEmbargo ? C.appx3_2 : C.appx3],
  });

  const note = (id: string, label: string, list: string[], unknown: string[]) => {
    const v = a(id);
    if (v === "yes") list.push(label);
    else if (v === "unknown") unknown.push(id);
  };
  // Notifications apply to every tier (Group A: 輸出令第1条第3項 / 第4条第2項第3号)
  note("jp.informWmd", "METI notification (インフォーム) — WMD", tx.wmdTrigger, tx.wmdUnknown);
  note("jp.informConv", "METI notification (インフォーム) — conventional weapons", tx.convTrigger, tx.convUnknown);
  if (groupA) return tx;

  // WMD objective requirements (輸出令第4条第1項第3号イ / 第4号イ; 核兵器等おそれ省令)
  note("jp.wmdUse", "Documented or communicated use for WMD development (用途要件, おそれ省令第1号)", tx.wmdTrigger, tx.wmdUnknown);
  const userAns = a("jp.wmdUser");
  const clear = a("jp.wmdClear");
  const wmdUser = userAns === "yes" || tx.eulWmd;
  if (wmdUser && clear !== "yes")
    tx.wmdTrigger.push(tx.eulWmd ? "End user on the METI End User List — WMD (需要者要件, おそれ省令第2号・第3号)" : "End user develops / developed WMD (需要者要件)");
  if (userAns === "unknown" && !tx.eulWmd) tx.wmdUnknown.push("jp.wmdUser");
  if (wmdUser && clear === "unknown") tx.wmdUnknown.push("jp.wmdClear");

  // Conventional-weapons objective requirements (第3号ハ / 第4号ハ; 通常兵器おそれ省令)
  tx.convUse = a("jp.convUse") === "yes";
  tx.convUser = a("jp.convUser") === "yes" || tx.eulCw;
  tx.convClear = a("jp.convClear") === "yes";
  if (a("jp.convUse") === "unknown") tx.convUnknown.push("jp.convUse");
  if (a("jp.convUser") === "unknown" && !tx.eulCw) tx.convUnknown.push("jp.convUser");
  if (tx.convUser && a("jp.convClear") === "unknown") tx.convUnknown.push("jp.convClear");
  return tx;
}

function assessItem(c: Case, item: Item, d: EngineData, tx: JpTx, opts: JpOptions): ItemAssessment {
  const findings: Finding[] = [];
  const exceptions: ExceptionCandidate[] = [];
  const outcomes: Outcome[] = [];
  const dest = c.destination;
  const jp = item.jp;
  const tech = item.kind === "technology";
  const baseCite = tech ? C.art25 : C.art48_1;
  let licenseReasons: string[] = [];
  let approvalReasons: string[] = [];
  const groupA = !!dest && d.jp.groupA.includes(dest);

  if (tech)
    findings.push({ id: "jp.tech", status: "info", title: "Technology transfer (役務取引) — assessed under 外為法第25条 and 外為令別表, which mirrors 輸出令別表第一", citations: [C.art25] });

  // 1. List control
  if (jp.listStatus === "unclassified") {
    findings.push({ id: "jp.class", status: "incomplete", title: "該非判定 (classification against 輸出令別表第一 / 貨物等省令) not recorded", citations: [C.order1] });
    outcomes.push("incomplete");
  } else if (jp.listStatus === "listed") {
    const k = kouNumber(jp.kou);
    licenseReasons.push(`List control ${jp.kou || "(項番 not recorded)"}`);
    findings.push({
      id: "jp.listed",
      status: "block",
      title: `Listed item${jp.kou ? ` — ${jp.kou}` : ""}: METI license required for all destinations`,
      detail: jp.classificationBasis,
      citations: [baseCite, C.order1],
    });
    if (!jp.kou) findings.push({ id: "jp.kou", status: "incomplete", title: "Record the 項番 (e.g. 8の項（1）) of the listed item", citations: [C.order1] });

    // 少額特例 — 輸出令第4条第1項第5号
    if (!tech && k && ((k.n >= 5 && k.n <= 13) || k.n === 15) && dest) {
      const totalJpy = item.unitValue !== undefined ? toJpy(item.unitValue * item.quantity, item.currency, opts.fxPerUsd) : undefined;
      const low = k.n === 15 || APPX3_3.some((re) => re.test(jp.kou));
      const limit = low ? 50_000 : 1_000_000;
      const concern = d.jp.concern.includes(dest);
      const un = d.jp.unArmsEmbargo.includes(dest) && !["IQ", "KP"].includes(dest);
      const adverse = groupA
        ? tx.informWmd || tx.informConv
        : tx.wmdTrigger.length > 0 || tx.informConv || (un && (tx.convUse || (tx.convUser && !tx.convClear)));
      if (!concern && !adverse && (totalJpy === undefined || totalJpy <= limit)) {
        exceptions.push({
          code: "少額特例",
          name: "Small-value exception (少額特例)",
          basis: `${jp.kou} is within 5–13 or 15の項; total value ${totalJpy === undefined ? "not stated" : `¥${Math.round(totalJpy).toLocaleString("ja-JP")}`} vs limit ¥${limit.toLocaleString("ja-JP")}`,
          conditions: [
            `Total value of the goods in this export ≤ ¥${limit.toLocaleString("ja-JP")}${low && k.n !== 15 ? " — this 項 is in 別表第三の三; the ¥50,000 limit applies if METI's notice (告示) designates the item" : ""}`,
            groupA ? "No METI notification (インフォーム) received" : "None of the WMD catch-all conditions or conventional-weapons notification apply (第3号イ・ロ・ニ)",
            ...(un ? ["No conventional-weapons use / end-user concern (第3号ハ) — destination is in 別表第三の二"] : []),
            "Values converted at the configured exchange rate — confirm against the invoice currency",
          ],
          citations: [C.order4_5, C.appx3_3],
          strength: totalJpy !== undefined && !low ? "likely" : "possible",
        });
      } else if (concern) findings.push({ id: "jp.small.concern", status: "info", title: "Small-value exception unavailable — destination is a country of concern (別表第四)", citations: [C.order4_5, C.appx4] });
    }
    if (opts.bulkLicenses?.length)
      exceptions.push({
        code: "包括許可",
        name: `Bulk license (${opts.bulkLicenses.join(", ")})`,
        basis: "The company holds a bulk license (包括許可)",
        conditions: ["Confirm the 項番 and destination are covered by the bulk license type (包括許可取扱要領)", "Observe the bulk license conditions (reporting, internal compliance program)"],
        citations: [C.art48_1],
        strength: "possible",
      });
  } else if (!tech) {
    // 2. Catch-all (16の項)
    const scope = jp.catchAllScope !== "unknown" ? jp.catchAllScope : catchAllScopeFromHs(item.hsCode, d);
    if (!dest) outcomes.push("incomplete");
    else if (scope === "unknown") {
      findings.push({ id: "jp.ca.scope", status: "incomplete", title: "Provide the HS code to determine catch-all scope (16の項)", detail: "16の項（1）: HS codes designated in 貨物等省令第14条の2; 16の項（2）: HS Chapters 25–40, 54–59, 63, 68–93 and 95.", citations: [C.order1, C.goods16] });
      outcomes.push("incomplete");
    } else if (scope === "out_of_scope") {
      findings.push({ id: "jp.ca.out", status: "pass", title: `HS ${item.hsCode ?? ""} is outside 16の項 — catch-all controls do not apply`, citations: [C.order1] });
    } else if (groupA) {
      const triggers = [...tx.wmdTrigger, ...tx.convTrigger];
      if (triggers.length) {
        licenseReasons.push(...triggers.map((t) => `Catch-all: ${t}`));
        findings.push({ id: "jp.ca.hit", status: "block", title: "License required — METI notification for a Group A destination", detail: triggers.map((t) => `• ${t}`).join("\n"), citations: [baseCite, cite("輸出令 第1条第3項 / 第4条第2項第3号", LAW.order, "jp:324CO0000000378:4")] });
      } else if (tx.wmdUnknown.length || tx.convUnknown.length) {
        findings.push({ id: "jp.ca.open", status: "incomplete", title: "Confirm no METI notification (インフォーム) has been received", citations: [cite("輸出令 第1条第3項", LAW.order, "jp:324CO0000000378:1")] });
        outcomes.push("incomplete");
      } else findings.push({ id: "jp.ca.groupA", status: "pass", title: "Group A destination — only METI notifications apply; none received", citations: [C.appx3] });
    } else {
      const unEmbargo = d.jp.unArmsEmbargo.includes(dest);
      const convObjective = scope === "16-1" || unEmbargo;
      // 明らかガイドライン ⑲: UN-arms-embargo destination and 16の項（1）goods — cannot be "clearly unrelated"
      const clearImpossible = unEmbargo && scope === "16-1";
      findings.push({
        id: "jp.ca.scope",
        status: "info",
        title:
          scope === "16-1"
            ? "16の項（1）(HS-designated goods): WMD and conventional-weapons catch-all — use, end-user and notification requirements"
            : `16の項（2）: WMD catch-all (use, end user, notification)${convObjective ? "; conventional-weapons use and end-user requirements (UN arms-embargo destination)" : "; conventional weapons — notification only"}`,
        citations: [scope === "16-1" ? C.order4_3 : C.order4_4, C.goods16],
      });
      const convHits: string[] = [];
      if (convObjective && tx.convUse) convHits.push("Documented or communicated use for conventional-weapons development (用途要件, 通常兵器おそれ省令第1号)");
      if (convObjective && tx.convUser && (!tx.convClear || clearImpossible))
        convHits.push(
          `End user develops, manufactures or uses conventional weapons${tx.eulCw ? " (METI End User List: CW)" : ""} (需要者要件, 通常兵器おそれ省令第2号・第3号)${clearImpossible && tx.convClear ? " — 明らかガイドライン ⑲ precludes a 'clearly unrelated' finding" : ""}`,
        );
      const triggers = [...tx.wmdTrigger, ...tx.convTrigger, ...convHits];
      if (triggers.length) {
        licenseReasons.push(...triggers.map((t) => `Catch-all: ${t}`));
        findings.push({ id: "jp.ca.hit", status: "block", title: "Catch-all license required", detail: triggers.map((t) => `• ${t}`).join("\n"), citations: [baseCite, scope === "16-1" ? C.order4_3 : C.order4_4, C.wmd, ...(convObjective ? [C.conv] : [])] });
      } else {
        const open = [...tx.wmdUnknown, ...tx.convUnknown.filter((q) => q === "jp.informConv" || convObjective)];
        if (open.length || tx.incomplete) {
          findings.push({ id: "jp.ca.open", status: "incomplete", title: `Catch-all review incomplete (${open.length} question${open.length === 1 ? "" : "s"} open)`, citations: [C.wmd, C.conv] });
          outcomes.push("incomplete");
        } else findings.push({ id: "jp.ca.clear", status: "pass", title: "No catch-all condition applies (用途・需要者・インフォーム)", citations: [C.wmd, ...(convObjective ? [C.conv] : [])] });
      }
    }
  }

  // 3. Export approval regimes (外為法第48条第3項 / 輸出令第2条)
  if (!tech && dest) {
    const listed = jp.listStatus === "listed";
    const in23 = listed || jp.appendix2_3 === "yes";
    if (["RU", "BY"].includes(dest)) {
      if (in23) approvalReasons.push(`${countryName(d, dest)}: goods in 別表第二の三`);
      else if (jp.appendix2_3 === "unknown") {
        findings.push({ id: "jp.ru.23", status: "incomplete", title: `Determine whether the goods fall under 別表第二の三 (export approval list for ${countryName(d, dest)})`, citations: [C.order2, C.appx2_3], question: { id: `jp23.${item.id}`, text: "Do the goods fall under 輸出令別表第二の三?" } });
        outcomes.push("incomplete");
      }
      if (!in23 && tx.designated === "yes") approvalReasons.push(`${countryName(d, dest)}: transaction with a METI-designated person (第2条第1項第1号の${dest === "RU" ? "7" : "6"})`);
    }
    if (d.jp.russiaDiversion.includes(dest) && in23) {
      if (tx.designated === "yes") approvalReasons.push(`${countryName(d, dest)} (別表第二の四): 別表第二の三 goods to a METI-designated person (第2条第1項第1号の8)`);
      else if (tx.designated === "unknown") {
        findings.push({
          id: "jp.div",
          status: "incomplete",
          title: `Confirm no party is a METI-designated person under the Russia-diversion measures (${countryName(d, dest)} is in 別表第二の四)`,
          citations: [C.order2, C.appx2_4],
          question: { id: "jp.designated", text: "Is any party a person designated by METI notice under the Russia / Belarus measures (including third-country diversion measures)?" },
        });
        outcomes.push("incomplete");
      }
    }
    if (["UA-DNR", "UA-LNR"].includes(c.destinationRegion)) approvalReasons.push("Designated areas of Donetsk / Luhansk (第2条第1項第1号の5)");
    if (dest === "KP") approvalReasons.push("North Korea — comprehensive export prohibition (all goods); approval is not granted");
    for (const r of approvalReasons)
      findings.push({ id: `jp.approval.${approvalReasons.indexOf(r)}`, status: "block", title: `Export approval (輸出承認) required — ${r}`, citations: [C.art48_3, C.order2] });
  }

  licenseReasons = [...new Set(licenseReasons)];
  approvalReasons = [...new Set(approvalReasons)];
  let summary: string;
  if (dest === "KP") {
    outcomes.push("prohibited");
    summary = "Prohibited — North Korea";
  } else if (licenseReasons.length || approvalReasons.length) {
    const what = [...licenseReasons, ...approvalReasons];
    if (exceptions.some((e) => e.code === "少額特例") && !approvalReasons.length) {
      outcomes.push("exception_available");
      summary = `License required (${what[0]}) — small-value exception candidate`;
    } else {
      outcomes.push("license_required");
      summary = `${licenseReasons.length ? "METI license" : "METI export approval"} required — ${what.slice(0, 2).join("; ")}`;
    }
  } else {
    outcomes.push(jp.listStatus === "unclassified" ? "incomplete" : "no_license_required");
    summary = jp.listStatus === "unclassified" ? "Classification (該非判定) required" : "No METI license or approval required";
  }
  return { itemId: item.id, outcome: worst(...outcomes), summary, findings, exceptions };
}

export function assessJp(c: Case, d: EngineData, opts: JpOptions): JurisdictionAssessment {
  if (c.shipFrom !== "JP") {
    return {
      jurisdiction: "JP",
      nexus: { attaches: false, reasons: [`Goods ship from ${countryName(d, c.shipFrom || "??")}, not Japan (FEFTA governs exports from Japan and technology provided by Japanese residents)`] },
      outcome: "not_applicable",
      summary: "FEFTA does not apply to this shipment",
      items: [],
      findings: [],
      actions: [],
    };
  }
  const tx = transaction(c, d);
  const items = c.items.map((i) => assessItem(c, i, d, tx, opts));
  const outcome = worst(...items.map((i) => i.outcome), tx.incomplete ? "incomplete" : "not_applicable", c.items.length ? "not_applicable" : "incomplete");
  const actions: string[] = [];
  if (outcome === "license_required" || outcome === "prohibited") actions.push("Apply for a METI license / export approval (NACCS or paper) before shipment; do not ship until granted.");
  if (items.some((i) => i.exceptions.some((e) => e.code === "少額特例"))) actions.push("If relying on the small-value exception, record the value calculation and the absence of catch-all conditions.");
  actions.push("Keep the 該非判定書 and transaction screening record (取引審査票) with the shipment file.");
  const summaryMap: Record<Outcome, string> = {
    prohibited: "Prohibited under FEFTA",
    license_required: "METI license / approval required",
    exception_available: "License required — exception may be available",
    incomplete: "Assessment incomplete",
    no_license_required: "No METI license or approval required",
    not_applicable: "FEFTA does not apply",
  };
  return {
    jurisdiction: "JP",
    nexus: { attaches: true, reasons: ["Goods are exported from Japan (外為法第48条)"] },
    outcome,
    summary: summaryMap[outcome],
    items,
    findings: tx.findings,
    actions,
  };
}
