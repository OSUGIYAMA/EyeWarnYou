// Fetches every primary source, parses it into normalized snapshots under data/,
// and records what changed since the previous sync (the "regulatory updates" feed).
import fs from "node:fs";
import path from "node:path";
import type {
  Ccl,
  Country,
  CountryChart,
  CountryGroups,
  DataManifest,
  JpCountryLists,
  JpListControl,
  RegLibrary,
  ScreeningDataset,
  SourceStamp,
} from "../shared/regs.ts";
import { allIsoCodes, countryNames } from "./countries.ts";
import { cslStamp, fetchCsl, normalizeCsl } from "./csl.ts";
import {
  ecfrLatestDate,
  ecfrPartUrl,
  fetchEcfrPart,
  parseCcl,
  parseCountryChart,
  parseCountryGroups,
  parseSections,
} from "./ecfr.ts";
import { LAW_IDS, egovLawUrl, fetchEgovLaw, parseArticles, parseKamotsu, parseYushutsurei } from "./egov.ts";
import { fetchMetiEndUserList } from "./meti.ts";
import { fetchMofcomLists } from "./mofcom.ts";
import { diffSnapshots, type ChangeEntry } from "./diff.ts";
import { deriveEar, deriveJp } from "./derive.ts";
import * as cheerio from "cheerio";

export const DATA_DIR = path.resolve(import.meta.dirname, "../../data");
export const SNAP_DIR = path.join(DATA_DIR, "snapshots");
export const CACHE_DIR = path.join(DATA_DIR, "cache");

export const FILES = {
  manifest: "manifest.json",
  countries: "countries.json",
  chart: "ear-country-chart.json",
  groups: "ear-country-groups.json",
  ccl: "ear-ccl.json",
  earLibrary: "ear-library.json",
  earDerived: "ear-derived.json",
  jpCountries: "jp-countries.json",
  jpListControl: "jp-list-control.json",
  jpDerived: "jp-derived.json",
  jpLibrary: "jp-library.json",
  changelog: "changelog.json",
  jpEndUserList: "jp-end-user-list.json",
  cnLists: "cn-lists.json",
  screening: "screening.json", // in CACHE_DIR (large, volatile)
} as const;

/**
 * Bump when a parser changes how it reads the same source text. Diffs across a parser change
 * reflect EyeWarnYou, not the regulator, so they are not reported as regulatory updates.
 */
export const PARSER_VERSION = "2026.09.29-2";

const EAR_PARTS = ["730", "732", "734", "736", "738", "740", "742", "743", "744", "746", "748", "750", "758", "760", "762", "764", "772", "774"];

export type SyncTarget = "ear" | "jp" | "screening";
export interface SyncProgress {
  step: string;
  detail?: string;
  done?: number;
  total?: number;
}

function write(dir: string, file: string, data: unknown) {
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${file}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, path.join(dir, file));
}

export function readSnapshot<T>(file: string, dir = SNAP_DIR): T | null {
  const p = path.join(dir, file);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8")) as T;
}

export async function runSync(
  targets: SyncTarget[] = ["ear", "jp", "screening"],
  onProgress: (p: SyncProgress) => void = () => {},
): Promise<{ manifest: DataManifest; changes: ChangeEntry[] }> {
  const now = new Date().toISOString();
  const prevManifest = readSnapshot<DataManifest>(FILES.manifest);
  const manifest: DataManifest = prevManifest ?? { generatedAt: now, stamps: {}, counts: {} };
  const changes: ChangeEntry[] = [];
  const parserChanged = !!prevManifest && (prevManifest as DataManifest & { parserVersion?: string }).parserVersion !== PARSER_VERSION;
  if (parserChanged) onProgress({ step: "diff", detail: "Parser version changed — this sync re-baselines the snapshots; differences are not reported as regulatory updates" });

  let chart = readSnapshot<CountryChart>(FILES.chart);
  let groups = readSnapshot<CountryGroups>(FILES.groups);
  let jpCountries = readSnapshot<JpCountryLists>(FILES.jpCountries);

  // ---- US EAR (eCFR) ----
  if (targets.includes("ear")) {
    onProgress({ step: "ecfr", detail: "Resolving latest eCFR issue date" });
    const date = await ecfrLatestDate();
    const xml: Record<string, string> = {};
    for (const [i, part] of EAR_PARTS.entries()) {
      onProgress({ step: "ecfr", detail: `15 CFR Part ${part}`, done: i, total: EAR_PARTS.length });
      xml[part] = await fetchEcfrPart(part, date);
    }
    const stamp = (part: string, label: string): SourceStamp => ({
      source: `eCFR — 15 CFR ${label}`,
      url: ecfrPartUrl(part),
      asOf: date,
      fetchedAt: now,
    });
    onProgress({ step: "parse", detail: "Commerce Country Chart / Country Groups / CCL" });
    const newChart = parseCountryChart(xml["738"], stamp("738", "Part 738 Supp. No. 1 (Country Chart)"));
    const newGroups = parseCountryGroups(xml["740"], stamp("740", "Part 740 Supp. No. 1 (Country Groups)"));
    const ccl = parseCcl(xml["774"], stamp("774", "Part 774 Supp. No. 1 (Commerce Control List)"));

    const prevCcl = readSnapshot<Ccl>(FILES.ccl);
    changes.push(...diffSnapshots.chart(chart, newChart), ...diffSnapshots.groups(groups, newGroups), ...diffSnapshots.ccl(prevCcl, ccl));

    const library: RegLibrary = { stamps: [], sections: [] };
    for (const part of EAR_PARTS) {
      library.stamps.push(stamp(part, `Part ${part}`));
      library.sections.push(
        ...parseSections(xml[part], part, {
          // The CCL itself and the Entity List supplement are served from dedicated datasets.
          skipSupplements: part === "774" ? /^Supplement No\. 1 to Part 774/ : part === "744" ? /^Supplement No\. 4 to Part 744/ : undefined,
        }),
      );
    }
    chart = newChart;
    groups = newGroups;
    write(SNAP_DIR, FILES.chart, chart);
    write(SNAP_DIR, FILES.groups, groups);
    write(SNAP_DIR, FILES.ccl, ccl);
    write(SNAP_DIR, FILES.earLibrary, library);
    write(SNAP_DIR, FILES.earDerived, deriveEar(library));
    manifest.stamps.ear = stamp("774", "Parts 730–774");
    manifest.counts.eccns = ccl.eccns.length;
    manifest.counts.chartCountries = chart.rows.length;
    manifest.counts.earSections = library.sections.length;
  }

  // ---- Japan (e-Gov 法令API) ----
  if (targets.includes("jp")) {
    onProgress({ step: "egov", detail: "輸出貿易管理令" });
    const yushutsurei = await fetchEgovLaw(LAW_IDS.yushutsurei);
    onProgress({ step: "egov", detail: "貨物等省令" });
    const kamotsu = await fetchEgovLaw(LAW_IDS.kamotsu);
    const extraLaws = [LAW_IDS.gaitameho, LAW_IDS.gaitamerei, LAW_IDS.osoreWmd, LAW_IDS.osoreConventional];
    const extra = [];
    for (const id of extraLaws) {
      onProgress({ step: "egov", detail: id });
      extra.push(await fetchEgovLaw(id));
    }
    const lawStamp = (l: { title: string; lawId: string; enforcementDate: string }): SourceStamp => ({
      source: `e-Gov法令 — ${l.title}`,
      url: egovLawUrl(l.lawId),
      asOf: l.enforcementDate,
      fetchedAt: now,
    });
    const y = parseYushutsurei(yushutsurei, lawStamp(yushutsurei));
    const k = parseKamotsu(kamotsu);
    changes.push(...diffSnapshots.jpCountries(jpCountries, y.countries));
    jpCountries = y.countries;
    const listControl: JpListControl = { stamp: lawStamp(kamotsu), appendix1: y.appendix1, ministerialArticles: k.articles };
    const library: RegLibrary = {
      stamps: [lawStamp(yushutsurei), lawStamp(kamotsu), ...extra.map(lawStamp)],
      sections: [...y.sections, ...k.sections],
    };
    for (const law of extra) {
      const $ = cheerio.load(law.xml, { xml: { xmlMode: true, decodeEntities: true } });
      const short =
        law.lawId === LAW_IDS.gaitameho
          ? "外為法"
          : law.lawId === LAW_IDS.gaitamerei
            ? "外為令"
            : law.lawId === LAW_IDS.osoreWmd
              ? "核兵器等おそれ省令"
              : "通常兵器おそれ省令";
      library.sections.push(...parseArticles($, law, short));
    }
    write(SNAP_DIR, FILES.jpCountries, jpCountries);
    write(SNAP_DIR, FILES.jpListControl, listControl);
    write(SNAP_DIR, FILES.jpDerived, deriveJp(listControl));
    write(SNAP_DIR, FILES.jpLibrary, library);
    manifest.stamps.jp = lawStamp(yushutsurei);
    manifest.stamps.jpKamotsu = lawStamp(kamotsu);
    manifest.counts.jpAppendix1 = y.appendix1.length;
    manifest.counts.jpSections = library.sections.length;
  }

  // ---- Countries (merge of ISO names + names used in EAR tables and Japanese law) ----
  if (chart && groups) {
    const byIso = new Map<string, Country>();
    for (const iso2 of [...allIsoCodes(), "XK"]) byIso.set(iso2, { iso2, ...countryNames(iso2) });
    for (const r of chart.rows) {
      const c = byIso.get(r.iso2);
      if (c) c.earName = r.earName;
    }
    write(SNAP_DIR, FILES.countries, [...byIso.values()].sort((a, b) => a.en.localeCompare(b.en)));
  }

  // ---- Screening lists ----
  if (targets.includes("screening")) {
    onProgress({ step: "meti", detail: "外国ユーザーリスト (METI End User List)" });
    const prevEul = readSnapshot<ScreeningDataset>(FILES.jpEndUserList);
    try {
      const m = await fetchMetiEndUserList(now);
      const next: ScreeningDataset = { stamps: [m.stamp], entries: m.entries };
      changes.push(...diffSnapshots.screening(prevEul, next));
      write(SNAP_DIR, FILES.jpEndUserList, next);
      manifest.stamps.meti = m.stamp;
      manifest.counts.metiEntries = m.entries.length;
    } catch (e) {
      onProgress({ step: "meti", detail: `METI End User List unavailable (${(e as Error).message}); keeping the bundled revision` });
    }

    onProgress({ step: "mofcom", detail: "MOFCOM designations (China)" });
    const prevCn = readSnapshot<ScreeningDataset>(FILES.cnLists);
    try {
      const m = await fetchMofcomLists(now, (msg) => onProgress({ step: "mofcom", detail: msg }));
      const next: ScreeningDataset = { stamps: [m.stamp], entries: m.entries };
      changes.push(...diffSnapshots.screening(prevCn, next));
      write(SNAP_DIR, FILES.cnLists, next);
      manifest.stamps.mofcom = m.stamp;
      manifest.counts.cnEntries = m.entries.length;
      if (m.failures.length) onProgress({ step: "mofcom", detail: `Could not parse: ${m.failures.join("; ")}` });
    } catch (e) {
      onProgress({ step: "mofcom", detail: `MOFCOM lists unavailable (${(e as Error).message}); keeping the previous copy` });
    }

    onProgress({ step: "csl", detail: "Consolidated Screening List (trade.gov)" });
    const raw = await fetchCsl();
    const next: ScreeningDataset = { stamps: [cslStamp(now, raw.search_performed_at)], entries: normalizeCsl(raw) };
    const prev = readSnapshot<ScreeningDataset>(FILES.screening, CACHE_DIR);
    changes.push(...diffSnapshots.screening(prev, next));
    write(CACHE_DIR, FILES.screening, next);
    manifest.stamps.csl = next.stamps[0];
    manifest.counts.screeningEntries = next.entries.length;
  }

  manifest.generatedAt = now;
  (manifest as DataManifest & { parserVersion?: string }).parserVersion = PARSER_VERSION;
  write(SNAP_DIR, FILES.manifest, manifest);

  if (parserChanged) changes.length = 0;
  if (changes.length) {
    const log = readSnapshot<ChangeEntry[]>(FILES.changelog) ?? [];
    const stamped = changes.map((c) => ({ ...c, detectedAt: now }));
    write(SNAP_DIR, FILES.changelog, [...stamped, ...log].slice(0, 2000));
  }
  onProgress({ step: "done", detail: `${changes.length} changes detected` });
  return { manifest, changes };
}
