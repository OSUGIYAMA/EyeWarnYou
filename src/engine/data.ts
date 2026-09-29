// In-memory view of the regulatory snapshots that the rules engine reads.
import type {
  Ccl,
  Country,
  CountryChart,
  CountryChartRow,
  CountryGroupId,
  CountryGroups,
  DataManifest,
  EarDerived,
  Eccn,
  JpCountryLists,
  JpDerived,
  JpListControl,
  ScreeningEntry,
} from "../shared/regs.ts";

export interface EngineData {
  ccl: Map<string, Eccn>;
  chart: Map<string, CountryChartRow>;
  chartFootnotes: Record<string, string>;
  groups: Record<string, CountryGroupId[]>;
  ear: EarDerived;
  jp: JpCountryLists;
  jpList: JpListControl;
  jpDerived: JpDerived;
  countries: Map<string, Country>;
  screening: (id: string) => ScreeningEntry | undefined;
  versions: Record<string, string>;
}

export function buildEngineData(src: {
  ccl: Ccl;
  chart: CountryChart;
  groups: CountryGroups;
  ear: EarDerived;
  jp: JpCountryLists;
  jpList: JpListControl;
  jpDerived: JpDerived;
  countries: Country[];
  manifest: DataManifest | null;
  screening?: (id: string) => ScreeningEntry | undefined;
}): EngineData {
  const versions: Record<string, string> = {
    ccl: src.ccl.stamp.asOf,
    countryChart: src.chart.stamp.asOf,
    countryGroups: src.groups.stamp.asOf,
    jpLaw: src.jp.stamp.asOf,
    jpList: src.jpList.stamp.asOf,
  };
  for (const [k, s] of Object.entries(src.manifest?.stamps ?? {})) if (k === "csl" || k === "meti") versions[k] = s.asOf;
  return {
    ccl: new Map(src.ccl.eccns.map((e) => [e.id, e])),
    chart: new Map(src.chart.rows.map((r) => [r.iso2, r])),
    chartFootnotes: src.chart.footnotes,
    groups: src.groups.membership,
    ear: src.ear,
    jp: src.jp,
    jpList: src.jpList,
    jpDerived: src.jpDerived,
    countries: new Map(src.countries.map((c) => [c.iso2, c])),
    screening: src.screening ?? (() => undefined),
    versions,
  };
}

export function inGroup(data: EngineData, iso2: string, ...groups: CountryGroupId[]): boolean {
  const g = data.groups[iso2] ?? [];
  return groups.some((x) => g.includes(x));
}

export function countryName(data: EngineData, iso2: string): string {
  return data.countries.get(iso2)?.en ?? iso2;
}

/** Resolve a country name as written in regulation prose ("China", "Macau", "the United Arab Emirates"). */
export function resolveProseCountry(data: EngineData, name: string): string | undefined {
  const n = name.trim().toLowerCase().replace(/^the\s+/, "");
  const alias: Record<string, string> = {
    china: "CN", "people's republic of china": "CN", prc: "CN", russia: "RU", "russian federation": "RU",
    macau: "MO", "united arab emirates": "AE", uae: "AE", "north korea": "KP", iran: "IR", syria: "SY",
    cuba: "CU", venezuela: "VE", belarus: "BY", burma: "MM", cambodia: "KH", nicaragua: "NI", canada: "CA",
    india: "IN", "hong kong": "HK",
  };
  if (alias[n]) return alias[n];
  for (const c of data.countries.values()) if (c.en.toLowerCase() === n || c.earName?.toLowerCase() === n) return c.iso2;
  return undefined;
}
