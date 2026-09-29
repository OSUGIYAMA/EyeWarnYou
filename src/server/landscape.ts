// Cross-jurisdiction list analytics: how US, Japanese and Chinese designations overlap and evolve.
// Computed in the background after each data load (matching thousands of names takes ~20 s).
import type { LoadedData } from "../data/load.ts";
import type { ScreeningListId } from "../shared/regs.ts";

export interface Series {
  key: string;
  label: string;
  values: number[];
}

export interface OverlapRow {
  id: string;
  label: string;
  sourceNote: string;
  n: number;
  anyHit: number;
  byList: Record<string, number>;
  examples: { name: string; matched: string; list: string; score: number }[];
}

export interface Landscape {
  computedAt: string;
  threshold: number;
  elByYear: { years: string[]; series: Series[] };
  cnByQuarter: { periods: string[]; series: Series[] };
  metiByCountry: { iso2: string; total: number; codes: Record<string, number> }[];
  overlap: OverlapRow[];
}

const EU = ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"];
const US_LISTS: ScreeningListId[] = ["EL", "SDN", "MEU", "DPL", "UVL"];

function bucketSeries<T>(items: T[], periodOf: (x: T) => string | null, groupOf: (x: T) => string, groups: { key: string; label: string }[]): { periods: string[]; series: Series[] } {
  const periods = [...new Set(items.map(periodOf).filter((p): p is string => !!p))].sort();
  const series = groups.map((g) => ({ ...g, values: periods.map(() => 0) }));
  for (const it of items) {
    const p = periodOf(it);
    if (!p) continue;
    const g = series.find((s) => s.key === groupOf(it)) ?? series[series.length - 1];
    g.values[periods.indexOf(p)]++;
  }
  return { periods, series };
}

const yieldToLoop = () => new Promise<void>((r) => setImmediate(r));

async function overlapRow(data: LoadedData, id: string, label: string, sourceNote: string, sources: LoadedData["screening"]["entries"], targets: ScreeningListId[], threshold: number): Promise<OverlapRow> {
  const byList: Record<string, number> = {};
  const examples: OverlapRow["examples"] = [];
  let anyHit = 0;
  let i = 0;
  for (const e of sources) {
    if (++i % 25 === 0) await yieldToLoop(); // keep the server responsive
    const res = data.screening.search({ name: e.name, country: e.countries[0], lists: targets, threshold, limit: 8 }).filter((m) => m.entry.id !== e.id);
    if (!res.length) continue;
    anyHit++;
    for (const l of new Set(res.map((m) => m.entry.list))) byList[l] = (byList[l] ?? 0) + 1;
    if (examples.length < 6) examples.push({ name: e.name, matched: res[0].matchedName, list: res[0].entry.list, score: res[0].score });
  }
  return { id, label, sourceNote, n: sources.length, anyHit, byList, examples };
}

export async function computeLandscape(data: LoadedData, threshold = 92): Promise<Landscape> {
  const all = data.screening.entries;
  const el = all.filter((e) => e.list === "EL");
  const elGroup = (e: (typeof el)[number]) => (e.countries.includes("CN") || e.countries.includes("HK") ? "CN" : e.countries.includes("RU") ? "RU" : e.countries.includes("IR") ? "IR" : e.countries.includes("AE") ? "AE" : e.countries.includes("PK") ? "PK" : "OTHER");
  const elByYear = bucketSeries(el, (e) => e.startDate?.slice(0, 4) ?? null, elGroup, [
    { key: "CN", label: "China & Hong Kong" },
    { key: "RU", label: "Russia" },
    { key: "IR", label: "Iran" },
    { key: "AE", label: "United Arab Emirates" },
    { key: "PK", label: "Pakistan" },
    { key: "OTHER", label: "Other" },
  ]);

  const cn = all.filter((e) => e.list.startsWith("CN-"));
  const q = (d?: string) => (d ? `${d.slice(0, 4)} Q${Math.floor((Number(d.slice(5, 7)) - 1) / 3) + 1}` : null);
  const cnGroup = (e: (typeof cn)[number]) => (e.countries.includes("US") ? "US" : e.countries.includes("JP") ? "JP" : e.countries.some((c) => EU.includes(c)) || /EU entities/.test(e.programs[0] ?? "") ? "EU" : e.countries.includes("TW") ? "TW" : "OTHER");
  const cnByQuarter = bucketSeries(cn, (e) => q(e.startDate), cnGroup, [
    { key: "US", label: "United States" },
    { key: "JP", label: "Japan" },
    { key: "EU", label: "European Union" },
    { key: "TW", label: "Taiwan" },
    { key: "OTHER", label: "Other / unspecified" },
  ]);

  const meti = all.filter((e) => e.list === "METI-EUL");
  const byCountry = new Map<string, { iso2: string; total: number; codes: Record<string, number> }>();
  for (const e of meti) {
    const iso = e.countries[0] ?? "—";
    const row = byCountry.get(iso) ?? { iso2: iso, total: 0, codes: {} };
    row.total++;
    for (const c of e.concern ?? []) row.codes[c] = (row.codes[c] ?? 0) + 1;
    byCountry.set(iso, row);
  }

  const inCountry = (list: ScreeningListId, isos: string[]) => all.filter((e) => e.list === list && e.countries.some((c) => isos.includes(c)));
  const overlap = [
    await overlapRow(data, "meti-us", "METI End User List", "all entries", meti, US_LISTS, threshold),
    await overlapRow(data, "el-cn-meti", "US Entity List — China & Hong Kong", "entries with a Chinese or Hong Kong address", inCountry("EL", ["CN", "HK"]), ["METI-EUL"], threshold),
    await overlapRow(data, "el-ru-meti", "US Entity List — Russia", "entries with a Russian address", inCountry("EL", ["RU"]), ["METI-EUL"], threshold),
    await overlapRow(data, "el-ir-meti", "US Entity List — Iran", "entries with an Iranian address", inCountry("EL", ["IR"]), ["METI-EUL"], threshold),
    await overlapRow(data, "cn-jp-us", "Chinese lists — Japanese entities", "MOFCOM Control List and Watch List designations of Japanese entities", all.filter((e) => e.list.startsWith("CN-") && e.countries.includes("JP")), [...US_LISTS, "METI-EUL"], threshold),
  ];

  return {
    computedAt: new Date().toISOString(),
    threshold,
    elByYear: { years: elByYear.periods, series: elByYear.series },
    cnByQuarter: { periods: cnByQuarter.periods, series: cnByQuarter.series },
    metiByCountry: [...byCountry.values()].sort((a, b) => b.total - a.total),
    overlap,
  };
}

let cache: { key: string; value: Landscape | null; running: Promise<void> | null } = { key: "", value: null, running: null };

/** Returns the cached landscape for this data load, starting the computation if needed. */
export function landscape(data: LoadedData, loadedAt: string): Landscape | null {
  if (cache.key !== loadedAt) cache = { key: loadedAt, value: null, running: null };
  if (!cache.value && !cache.running) {
    const key = loadedAt;
    cache.running = computeLandscape(data)
      .then((v) => {
        if (cache.key === key) cache.value = v;
      })
      .catch((e) => console.warn(`Landscape computation failed: ${(e as Error).message}`))
      .finally(() => {
        if (cache.key === key) cache.running = null;
      });
  }
  return cache.value;
}
