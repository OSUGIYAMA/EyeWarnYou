// End-use / end-user / "knowledge" questions the reviewer answers per case.
// Each question states the legal trigger it tests and is shown only when relevant.
import type { Case } from "../shared/case.ts";
import type { Citation, Jurisdiction } from "../shared/assessment.ts";
import { inGroup, type EngineData } from "./data.ts";

export interface Question {
  id: string;
  jurisdiction: Jurisdiction;
  group: "end_use" | "end_user" | "notice" | "red_flag";
  text: string;
  help?: string;
  cite: Citation;
  /** When false the question is hidden and treated as not applicable. */
  relevant: (c: Case, d: EngineData) => boolean;
  /** "yes" is adverse for every question in this catalog. */
}

const cfr = (section: string, label = section): Citation => ({
  section,
  label: `15 CFR ${label}`,
  url: `https://www.ecfr.gov/current/title-15/section-${section.split(" ")[0]}`,
});
const jp = (label: string, section?: string): Citation => ({
  section,
  label,
  url: section?.includes("413M") ? "https://laws.e-gov.go.jp/law/413M60000400249" : section?.includes("420M") ? "https://laws.e-gov.go.jp/law/420M60000400057" : "https://laws.e-gov.go.jp/law/324CO0000000378",
});

const MEU_ALL_ITEMS = ["RU", "BY"];
const MI_DEST = ["BY", "MM", "KH", "CN", "CU", "IR", "KP", "RU", "SY", "VE", "NI"];

const partyCountries = (c: Case) => new Set([c.destination, ...c.parties.map((p) => p.country)].filter(Boolean));
const touches = (c: Case, list: string[]) => [...partyCountries(c)].some((x) => list.includes(x));
const nonGroupA = (c: Case, d: EngineData) => !!c.destination && !d.jp.groupA.includes(c.destination);


export function usQuestions(d: EngineData): Question[] {
  const flags: Question[] = d.ear.redFlags.map((f) => ({
    id: `us.redflag.${f.n}`,
    jurisdiction: "US",
    group: "red_flag",
    text: f.text,
    cite: cfr("732 Supp. 3", "732, Supp. No. 3 — Red Flag " + f.n),
    relevant: (c) => (f.n >= 13 && f.n <= 14 ? c.items.some((i) => /^\d[A-E](5|6)\d\d$/.test(i.us.eccn) && (/515$/.test(i.us.eccn) || /6\d\d$/.test(i.us.eccn))) : f.n >= 15 ? c.items.some((i) => /^3[A-E]|^4[A-E]/.test(i.us.eccn)) : true),
  }));
  return [
    {
      id: "us.informed",
      jurisdiction: "US",
      group: "notice",
      text: "Has BIS informed you (by specific notice or an \"is-informed\" letter) that a license is required for this transaction, item, or party?",
      cite: cfr("744.21", "744.21(b); see also 744.2(b), 744.3(b), 744.4(b), 744.11"),
      relevant: () => true,
    },
    {
      id: "us.affiliate50",
      jurisdiction: "US",
      group: "end_user",
      text: "Is any party owned 50% or more (directly or indirectly, individually or in aggregate) by one or more entities on the Entity List or the Military End-User List?",
      help: "Affiliates Rule — stayed until 2026-11-09; re-applies from 2026-11-10 unless extended (90 FR 50857).",
      cite: cfr("744.11", "744.11(a)(1)"),
      relevant: () => true,
    },
    {
      id: "us.nuclear",
      jurisdiction: "US",
      group: "end_use",
      text: "Do you know the items will be used, directly or indirectly, in nuclear explosive activities, unsafeguarded nuclear activities, or nuclear fuel-cycle / heavy-water activities?",
      cite: cfr("744.2", "744.2(a)"),
      relevant: () => true,
    },
    {
      id: "us.missile",
      jurisdiction: "US",
      group: "end_use",
      text: "Do you know the items will be used in the design, development, production, or use of rocket systems or unmanned aerial vehicles (including ballistic missiles, space launch vehicles, sounding rockets) in or by a Country Group D:4 country?",
      cite: cfr("744.3", "744.3(a)"),
      relevant: () => true,
    },
    {
      id: "us.cbw",
      jurisdiction: "US",
      group: "end_use",
      text: "Do you know the items will be used in the design, development, production, stockpiling, or use of chemical or biological weapons?",
      cite: cfr("744.4", "744.4(a)"),
      relevant: () => true,
    },
    {
      id: "us.meu",
      jurisdiction: "US",
      group: "end_use",
      text: "Do you know the items are intended, entirely or in part, for a 'military end use' or a 'military end user' of Belarus, Burma, Cambodia, China, Nicaragua, Russia, or Venezuela (wherever located)?",
      help: "For Burma, Cambodia, China, Nicaragua and Venezuela the rule covers items in Supplement No. 2 to Part 744; for Belarus and Russia it covers all items subject to the EAR.",
      cite: cfr("744.21", "744.21(a)"),
      relevant: (c) => touches(c, [...d.ear.meuSupp2Destinations, ...MEU_ALL_ITEMS]),
    },
    {
      id: "us.milintel",
      jurisdiction: "US",
      group: "end_use",
      text: "Do you know the items are intended for a 'military-intelligence end use' or 'military-intelligence end user' (e.g., intelligence services of the armed forces) in Belarus, Burma, Cambodia, China, Cuba, Iran, Nicaragua, North Korea, Russia, Syria, or Venezuela?",
      cite: cfr("744.22", "744.22(a)"),
      relevant: (c) => touches(c, MI_DEST),
    },
    {
      id: "us.advcomp",
      jurisdiction: "US",
      group: "end_use",
      text: "Do you know the items will be used for the development or production of 'supercomputers', 'advanced-node integrated circuits', or semiconductor manufacturing equipment destined to Macau or a Country Group D:1/D:4/D:5 destination?",
      cite: cfr("744.23", "744.23(a)"),
      relevant: (c) => !!c.destination && (c.destination === "MO" || inGroup(d, c.destination, "D:1", "D:4", "D:5")),
    },
    {
      id: "us.ruOilGas",
      jurisdiction: "US",
      group: "end_use",
      text: "Do you know the items will be used directly or indirectly in exploration for, or production of, oil or gas in Russian deepwater (>500 ft) or Arctic offshore locations or shale formations in Russia or Belarus?",
      cite: cfr("746.8", "746.8(a)(4)"),
      relevant: (c) => touches(c, ["RU", "BY"]),
    },
    ...flags,
  ];
}

export function jpQuestions(d: EngineData): Question[] {
  const wmdOrd = jp("核兵器等おそれ省令 / 輸出令 第4条第1項第3号イ・第4号イ", "jp:413M60000400249:main");
  const convOrd = jp("通常兵器おそれ省令 / 輸出令 第4条第1項第3号ハ・第4号ハ", "jp:420M60000400057:main");
  const russia = (c: Case) => ["RU", "BY"].includes(c.destination) || d.jp.russiaDiversion.includes(c.destination);
  return [
    {
      id: "jp.informWmd",
      jurisdiction: "JP",
      group: "notice",
      text: "Has METI notified you that a license application is required because of WMD concerns (インフォーム通知 — 核兵器等)?",
      cite: jp("輸出令 第4条第1項第3号ロ・第4号ロ / 第1条第3項", "jp:324CO0000000378:4"),
      relevant: (c) => c.shipFrom === "JP",
    },
    {
      id: "jp.informConv",
      jurisdiction: "JP",
      group: "notice",
      text: "Has METI notified you that a license application is required because of conventional-weapons concerns (インフォーム通知 — 通常兵器)?",
      cite: jp("輸出令 第4条第1項第3号ニ・第4号ニ / 第1条第3項", "jp:324CO0000000378:4"),
      relevant: (c) => c.shipFrom === "JP",
    },
    {
      id: "jp.wmdUse",
      jurisdiction: "JP",
      group: "end_use",
      text: "Do the contract or other documents, or communications from the importer / end user, indicate the goods will be used for the development, manufacture, use or storage of nuclear, chemical or biological weapons or missiles, or for the nuclear activities listed in the ordinance's appended table?",
      help: "用途要件 — WMD catch-all (核兵器等おそれ省令 第1号・別表).",
      cite: wmdOrd,
      relevant: (c, dd) => c.shipFrom === "JP" && nonGroupA(c, dd),
    },
    {
      id: "jp.wmdUser",
      jurisdiction: "JP",
      group: "end_user",
      text: "Do documents (including METI's End User List) or communications indicate the end user develops, or has developed, WMD or missiles?",
      help: "需要者要件 — a confirmed METI End User List hit (B/C/M/N) is applied automatically.",
      cite: wmdOrd,
      relevant: (c, dd) => c.shipFrom === "JP" && nonGroupA(c, dd),
    },
    {
      id: "jp.wmdClear",
      jurisdiction: "JP",
      group: "end_user",
      text: "Having worked through METI's 明らかガイドライン, is it clear from the use and the terms of the transaction that the goods will not be used for WMD development?",
      help: "Only relevant when the end-user requirement is met. Any failed check in the guideline means it is not 'clear'.",
      cite: jp("明らかガイドライン（補完規制通達 1.(6)）"),
      relevant: (c, dd) => c.shipFrom === "JP" && nonGroupA(c, dd) && (c.answers["jp.wmdUser"] === "yes" || hasEul(c, dd, ["B", "C", "M", "N"])),
    },
    {
      id: "jp.convUse",
      jurisdiction: "JP",
      group: "end_use",
      text: "Do documents or communications indicate the goods will be used for the development, manufacture or use of conventional weapons (輸出令別表第一 1の項 goods)?",
      help: "用途要件 — conventional-weapons catch-all. Applies to 16の項（1）goods for all non-Group-A destinations, and to all 16の項 goods for UN arms-embargo destinations.",
      cite: convOrd,
      relevant: (c, dd) => c.shipFrom === "JP" && nonGroupA(c, dd),
    },
    {
      id: "jp.convUser",
      jurisdiction: "JP",
      group: "end_user",
      text: "Is the end user a military or military-related body (including defence, security and intelligence agencies), or an entity that develops, manufactures or uses conventional weapons, according to documents (incl. the End User List 'CW' column) or communications?",
      help: "需要者要件 — conventional-weapons catch-all (added 2025-10-09). METI's templates check 「軍若しくは軍関係機関又はこれらに類する機関であるか」.",
      cite: convOrd,
      relevant: (c, dd) => c.shipFrom === "JP" && nonGroupA(c, dd),
    },
    {
      id: "jp.convClear",
      jurisdiction: "JP",
      group: "end_user",
      text: "Having worked through the 明らかガイドライン, is it clear the goods will not be used for the development, manufacture or use of conventional weapons?",
      help: "Not available for UN arms-embargo destinations when the goods are 16の項（1）(guideline ⑲).",
      cite: jp("明らかガイドライン（補完規制通達 1.(6)）"),
      relevant: (c, dd) => c.shipFrom === "JP" && nonGroupA(c, dd) && (c.answers["jp.convUser"] === "yes" || hasEul(c, dd, ["CW"])),
    },
    {
      id: "jp.designated",
      jurisdiction: "JP",
      group: "end_user",
      text: "Is any party a person designated by METI notice under the Russia / Belarus measures (including third-country diversion measures, 輸出令第2条第1項第1号の6〜8)?",
      cite: jp("輸出令 第2条第1項第1号の6〜8 / 別表第二の四", "jp:324CO0000000378:2"),
      relevant: (c) => c.shipFrom === "JP" && russia(c),
    },
  ];
}

function hasEul(c: Case, d: EngineData, codes: string[]): boolean {
  return c.parties.some((p) =>
    (c.screenings[p.id]?.hits ?? []).some((h) => h.list === "METI-EUL" && h.disposition === "confirmed" && (d.screening(h.entryId)?.concern ?? []).some((x) => codes.includes(x))),
  );
}

export function cnQuestions(): Question[] {
  const cn = (c: Case) => c.shipFrom === "CN" || c.items.some((i) => i.cn.materials.length > 0 || (i.countryOfOrigin === "CN" && i.cn.listStatus === "listed"));
  const mof = (label: string, url: string): Citation => ({ label, url });
  return [
    {
      id: "cn.jpMilitary",
      jurisdiction: "CN",
      group: "end_use",
      text: "Will the China-origin dual-use items, or products containing them, go to a Japanese military user or military use, or to any use that helps enhance Japan's military capability?",
      help: "MOFCOM Announcement 2026 No. 1 prohibits this and reaches foreign parties that transfer China-origin items.",
      cite: mof("MOFCOM Announcement 2026 No. 1", "https://www.mofcom.gov.cn/zwgk/zcfb/art/2026/art_8990fedae8fa462eb02cc9bae5034e91.html"),
      relevant: (c) => cn(c) && (c.destination === "JP" || c.shipFrom === "JP" || c.parties.some((p) => p.country === "JP")),
    },
    {
      id: "cn.usMilitary",
      jurisdiction: "CN",
      group: "end_use",
      text: "Will the China-origin dual-use items, or products containing them, go to a US military user or military use?",
      cite: mof("MOFCOM Announcement 2024 No. 46", "https://www.mofcom.gov.cn/zwgk/zcfb/art/2024/art_3d5e990b43424e60828030f58a547b60.html"),
      relevant: (c) => cn(c) && (c.destination === "US" || c.parties.some((p) => p.country === "US")),
    },
    {
      id: "cn.euc",
      jurisdiction: "CN",
      group: "notice",
      text: "Were the China-origin items acquired under a MOFCOM export licence with an end-user certificate or commitment (no change of end use / no transfer without MOFCOM consent)?",
      cite: mof("两用物项出口管制条例 第24条", "https://exportcontrol.mofcom.gov.cn/article/zcfg/gnzcfg/gzjgfxwj/202410/1057.html"),
      relevant: (c) => c.shipFrom !== "CN" && c.items.some((i) => i.cn.materials.length > 0 || (i.countryOfOrigin === "CN" && i.cn.listStatus === "listed")),
    },
    {
      id: "cn.catchAll",
      jurisdiction: "CN",
      group: "end_use",
      text: "Do you know, or have reason to know, that the items may endanger China's national security or be used for WMD, their delivery systems, or terrorism?",
      cite: mof("出口管制法 第12条第3款", "https://exportcontrol.mofcom.gov.cn/article/zcfg/gnzcfg/flfg/202111/226.html"),
      relevant: (c) => c.shipFrom === "CN",
    },
  ];
}

export function allQuestions(d: EngineData): Question[] {
  return [...usQuestions(d), ...jpQuestions(d), ...cnQuestions()];
}
