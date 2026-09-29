// Normalized regulatory datasets produced by `npm run sync` (scripts/sync.ts) and
// loaded by the server at startup. Everything here is derived from primary sources:
// eCFR (15 CFR 730-774), e-Gov 法令API (輸出令 / 貨物等省令), trade.gov CSL, METI.

export const CHART_COLUMNS = [
  "CB1", "CB2", "CB3", "NP1", "NP2", "NS1", "NS2", "MT1",
  "RS1", "RS2", "FC1", "CC1", "CC2", "CC3", "AT1", "AT2",
] as const;
export type ChartColumn = (typeof CHART_COLUMNS)[number];

export const CHART_REASONS: Record<string, string> = {
  CB: "Chemical & biological weapons",
  NP: "Nuclear nonproliferation",
  NS: "National security",
  MT: "Missile technology",
  RS: "Regional stability",
  FC: "Firearms convention",
  CC: "Crime control",
  AT: "Anti-terrorism",
};

export interface SourceStamp {
  source: string; // human label, e.g. "eCFR 15 CFR Part 738"
  url: string;
  asOf: string; // date the source reflects (eCFR amendment date, law revision date, download date)
  fetchedAt: string; // ISO timestamp
}

export interface Country {
  iso2: string;
  en: string;
  ja: string;
  /** Names as they appear in EAR tables / Japanese law, for traceability. */
  earName?: string;
  jaLawName?: string;
}

export interface CountryChartRow {
  iso2: string;
  earName: string;
  footnotes: number[];
  x: ChartColumn[]; // columns marked with an X
}

export interface CountryChart {
  stamp: SourceStamp;
  rows: CountryChartRow[];
  footnotes: Record<string, string>;
}

export const COUNTRY_GROUP_IDS = [
  "A:1", "A:2", "A:3", "A:4", "A:5", "A:6", "B",
  "D:1", "D:2", "D:3", "D:4", "D:5", "E:1", "E:2",
] as const;
export type CountryGroupId = (typeof COUNTRY_GROUP_IDS)[number];

export interface CountryGroups {
  stamp: SourceStamp;
  labels: Record<CountryGroupId, string>;
  membership: Record<string, CountryGroupId[]>; // iso2 -> groups
  notes: string[];
}

/** One row of an ECCN "License Requirements" table. */
export interface EccnControl {
  reason: string; // NS, MT, RS, AT, UN, EI, CC, CB, NP, FC, SL, CW, SI, SS, ...
  scope: string; // raw "Control(s)" cell, e.g. "NS applies to 3A001.a.1.a"
  chart: string; // raw "Country Chart" cell
  columns: ChartColumn[]; // parsed "NS Column 2" etc.
  /**
   * entire      — applies to the entire entry
   * except      — entire entry except `paragraphs`
   * only        — only to `paragraphs`
   */
  mode: "entire" | "except" | "only";
  /** Paragraph refs parsed from the scope (e.g. ["a.1.a", "b"]). */
  paragraphs: string[];
  /** Scope carries an end-use / parameter condition ("when usable in missiles", "except ... civil telecom"). */
  conditional: boolean;
  /** Chart cell is not a simple column reference (worldwide / §742.x / §746 text). */
  special: boolean;
}

export interface EccnLicenseException {
  code: string; // LVS, GBS, NAC/ACA, ...
  text: string;
  status: "yes" | "no" | "partial" | "value";
  valueLimit?: number; // USD for LVS
}

export type CclBlock =
  | { kind: "field"; label: string; text: string }
  | { kind: "heading"; text: string }
  | { kind: "para"; ref?: string; depth: number; text: string }
  | { kind: "note"; title?: string; text: string }
  | { kind: "table"; rows: string[][] };

export interface Eccn {
  id: string; // "3A090"
  category: string; // "3"
  categoryTitle: string;
  group: string; // "A"
  groupTitle: string;
  heading: string;
  reserved: boolean;
  reasonForControl: string[];
  controls: EccnControl[];
  licenseExceptions: EccnLicenseException[];
  relatedControls?: string;
  relatedDefinitions?: string;
  unit?: string;
  /** "Items" paragraph refs in order, for paragraph-level classification. */
  paragraphs: { ref: string; text: string; depth: number }[];
  blocks: CclBlock[];
  series600: boolean;
  series515: boolean;
  /** Heading states the items are "subject to the ITAR" (no EAR license table). */
  itar: boolean;
}

export interface Ccl {
  stamp: SourceStamp;
  categories: { id: string; title: string }[];
  eccns: Eccn[];
}

/** A citable unit of regulation text (EAR section or Japanese law article). */
export interface RegSection {
  id: string; // "740.2" | "746 Supp. 2" | "jp:yushutsurei:4"
  source: "ear" | "jp";
  part: string; // "740" | "輸出令"
  title: string;
  cite: string; // "15 CFR 740.2" | "輸出貿易管理令 第4条"
  url: string;
  paragraphs: { label?: string; depth: number; text: string }[];
}

export interface RegLibrary {
  stamps: SourceStamp[];
  sections: RegSection[];
}

/** Lists the engine needs that are derived from regulation text at sync time. */
export interface EarDerived {
  unArmsEmbargo: string[]; // 746.1(b)(2)
  partnerCountries: { iso2: string; scope: string; cite: string }[]; // 746 Supp. 3
  russiaHts: { supp2: string[]; supp4: string[]; supp5: string[]; supp7: string[] }; // HTS-6 codes
  meuEccns: string[]; // 744 Supp. 2
  meuSupp2Destinations: string[]; // 744.21(a)(1)
  redFlags: { n: number; text: string }[]; // 732 Supp. 3
}

// ---- Japan (外為法) ----

export interface JpCountryLists {
  stamp: SourceStamp;
  groupA: string[]; // 別表第三 (iso2)
  unArmsEmbargo: string[]; // 別表第三の二
  concern: string[]; // 別表第四
  /** 別表第二の四 — third countries covered by the Russia-diversion approval requirement (第2条第1項第1号の8). */
  russiaDiversion: string[];
  /** 別表第三の三 raw text (items subject to 通常兵器 catch-all for 一般国 via 告示). */
  appendix3_3: string;
  raw: Record<string, string>;
}

/** HS-based catch-all scope derived from 輸出令別表第一16の項 and 貨物等省令第14条の2. */
export interface JpDerived {
  /** 16の項（1）: HS prefixes (4 or 6 digits) and excluded prefixes. */
  catchAll16_1: { include: string[]; exclude: string[] };
  /** 16の項（2）: HS chapters (2 digits). */
  catchAll16_2Chapters: string[];
}

/** Row of 輸出令 別表第一 (list-controlled items, 1〜16項). */
export interface JpAppendix1Row {
  kou: string; // "1" .. "16"
  sub: string; // "（一）" etc. or "" for whole 項
  label: string; // "8の項（1）"
  text: string;
}

export interface JpListControl {
  stamp: SourceStamp;
  appendix1: JpAppendix1Row[];
  /** 貨物等省令 articles chunked for retrieval. */
  ministerialArticles: { article: string; title: string; kou?: string; techKou?: string; text: string }[];
}

// ---- Screening ----

export type ScreeningListId =
  | "EL" | "MEU" | "UVL" | "DPL" | "SDN" | "SSI" | "ISN" | "DTC" | "CMIC" | "NS-MBS" | "PLC" | "CAP" | "METI-EUL"
  | "CN-ECL" | "CN-WL" | "CN-UEL" | "CN-AFSL";

export interface ScreeningEntry {
  id: string;
  list: ScreeningListId;
  name: string;
  altNames: string[];
  type?: string; // Entity | Individual | Vessel
  countries: string[]; // iso2 from addresses / nationality
  addresses: string[];
  programs: string[];
  licenseRequirement?: string;
  licensePolicy?: string;
  frNotice?: string;
  startDate?: string;
  remarks?: string;
  sourceUrl?: string;
  /** METI End User List specific: 懸念区分 (B/C/M/N/CW) */
  concern?: string[];
  /** Chinese lists: whether MOFCOM has suspended or stopped the measures for this designation. */
  cnStatus?: "active" | "suspended" | "stopped" | "removed";
  cnStatusUntil?: string;
}

export interface ScreeningDataset {
  stamps: SourceStamp[];
  entries: ScreeningEntry[];
}

export interface DataManifest {
  generatedAt: string;
  stamps: Record<string, SourceStamp>;
  counts: Record<string, number>;
}
