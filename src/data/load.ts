// Loads the regulatory snapshots from disk into the engine's in-memory form.
import fs from "node:fs";
import path from "node:path";
import type {
  Ccl,
  Country,
  CountryChart,
  CountryGroups,
  DataManifest,
  EarDerived,
  JpCountryLists,
  JpDerived,
  JpListControl,
  RegLibrary,
  ScreeningDataset,
} from "../shared/regs.ts";
import { buildEngineData, type EngineData } from "../engine/data.ts";
import { ScreeningIndex } from "../engine/screening/index.ts";

export const DATA_DIR = path.resolve(import.meta.dirname, "../../data");
export const SNAP_DIR = path.join(DATA_DIR, "snapshots");
export const CACHE_DIR = path.join(DATA_DIR, "cache");

const read = <T>(file: string, dir = SNAP_DIR): T | null => {
  const p = path.join(dir, file);
  return fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, "utf8")) as T) : null;
};
const must = <T>(file: string): T => {
  const v = read<T>(file);
  if (!v) throw new Error(`Missing data/snapshots/${file} — run \`npm run sync\``);
  return v;
};

export interface LoadedData {
  engine: EngineData;
  screening: ScreeningIndex;
  screeningStamps: ScreeningDataset["stamps"];
  ccl: Ccl;
  earLibrary: RegLibrary;
  jpLibrary: RegLibrary;
  jpList: JpListControl;
  chart: CountryChart;
  groups: CountryGroups;
  countries: Country[];
  manifest: DataManifest | null;
}

export function loadData(): LoadedData {
  const ccl = must<Ccl>("ear-ccl.json");
  const chart = must<CountryChart>("ear-country-chart.json");
  const groups = must<CountryGroups>("ear-country-groups.json");
  const ear = must<EarDerived>("ear-derived.json");
  const jp = must<JpCountryLists>("jp-countries.json");
  const jpList = must<JpListControl>("jp-list-control.json");
  const jpDerived = must<JpDerived>("jp-derived.json");
  const countries = must<Country[]>("countries.json");
  const manifest = read<DataManifest>("manifest.json");
  const eul = read<ScreeningDataset>("jp-end-user-list.json");
  const cn = read<ScreeningDataset>("cn-lists.json");
  const csl = read<ScreeningDataset>("screening.json", CACHE_DIR);
  const entries = [...(csl?.entries ?? []), ...(eul?.entries ?? []), ...(cn?.entries ?? [])];
  const screening = new ScreeningIndex(entries);
  const engine = buildEngineData({ ccl, chart, groups, ear, jp, jpList, jpDerived, countries, manifest, screening: (id) => screening.get(id) });
  return {
    engine,
    screening,
    screeningStamps: [...(csl?.stamps ?? []), ...(eul?.stamps ?? []), ...(cn?.stamps ?? [])],
    ccl,
    earLibrary: must<RegLibrary>("ear-library.json"),
    jpLibrary: must<RegLibrary>("jp-library.json"),
    jpList,
    chart,
    groups,
    countries,
    manifest,
  };
}
