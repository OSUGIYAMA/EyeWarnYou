// Reproducible evaluation of the data pipeline and the screening matcher.
//   npm run evaluate            → prints a report and writes docs/evaluation-results.json
// Results are deterministic (seeded) so they can be compared across versions.
import fs from "node:fs";
import path from "node:path";
import { loadData } from "../src/data/load.ts";
import { interpretChartText } from "../src/engine/us/ccl.ts";
import { normalizeName } from "../src/engine/screening/normalize.ts";

const data = loadData();
const out: Record<string, unknown> = { generatedAt: new Date().toISOString(), dataVersions: data.engine.versions };

// ---------------------------------------------------------------------------
// 1. CCL license-requirement coverage

const rows = data.ccl.eccns.flatMap((e) => e.controls.map((c) => ({ eccn: e.id, c })));
const columnOnly = rows.filter((r) => r.c.columns.length && !r.c.special).length;
const columnPlusText = rows.filter((r) => r.c.columns.length && r.c.special).length;
const textual = rows.filter((r) => !r.c.columns.length);
const probe = ["CN", "RU", "DE", "IN", "AE", "MO", "KP", "IQ", "CA"];
const interpreted = textual.filter((r) => probe.every((d) => interpretChartText(r.c.chart, d, data.engine) !== undefined));
const unrecognized = textual.filter((r) => probe.some((d) => interpretChartText(r.c.chart, d, data.engine) === undefined));
out.ccl = {
  eccns: data.ccl.eccns.length,
  controlRows: rows.length,
  columnOnly,
  columnPlusText,
  textual: textual.length,
  textualInterpreted: interpreted.length,
  textualForReview: unrecognized.length,
  scopeModes: rows.reduce<Record<string, number>>((m, r) => ((m[r.c.mode + (r.c.conditional ? "+conditional" : "")] = (m[r.c.mode + (r.c.conditional ? "+conditional" : "")] ?? 0) + 1), m), {}),
  reviewExamples: unrecognized.slice(0, 12).map((r) => `${r.eccn} ${r.c.reason}: ${r.c.chart.slice(0, 120)}`),
};

// ---------------------------------------------------------------------------
// 2. Screening benchmark

let seed = 20260929;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T>(a: T[]) => a[Math.floor(rand() * a.length)];

const LEGAL = /\b(co\.?,?\s*ltd\.?|company limited|limited|ltd\.?|inc\.?|incorporated|corporation|corp\.?|llc|gmbh|jsc|ojsc|pjsc|ooo|plc|s\.a\.|ag)\b\.?/gi;
function variants(name: string): { kind: string; q: string }[] {
  const base = name.replace(/\s+/g, " ").trim();
  const v: { kind: string; q: string }[] = [{ kind: "exact", q: base }];
  const noLegal = base.replace(LEGAL, "").replace(/[,.\s]+$/, "").replace(/\s{2,}/g, " ").trim();
  if (noLegal && noLegal !== base) v.push({ kind: "legal form dropped", q: noLegal });
  v.push({ kind: "upper case", q: base.toUpperCase() });
  const words = noLegal.split(" ");
  const longIdx = words.map((w, i) => [w, i] as const).filter(([w]) => w.length >= 7);
  if (longIdx.length) {
    const [w, i] = pick(longIdx);
    const j = 2 + Math.floor(rand() * (w.length - 4));
    const typo = w.slice(0, j) + w[j + 1] + w[j] + w.slice(j + 2); // adjacent transposition
    const ws = [...words];
    ws[i] = typo;
    v.push({ kind: "one typo", q: ws.join(" ") });
  }
  if (words.length >= 3) {
    const ws = [...words];
    [ws[0], ws[1]] = [ws[1], ws[0]];
    v.push({ kind: "word order", q: ws.join(" ") });
  }
  return v;
}

const pool = data.screening.entries.filter((e) => ["EL", "MEU", "DPL", "UVL", "METI-EUL", "CN-ECL", "CN-WL"].includes(e.list) && normalizeName(e.name).tokens.length >= 2);
const sample: typeof pool = [];
while (sample.length < 400) {
  const e = pick(pool);
  if (!sample.includes(e)) sample.push(e);
}
const byKind: Record<string, { n: number; hit: number; top1: number }> = {};
for (const e of sample) {
  for (const { kind, q } of variants(e.name)) {
    const res = data.screening.search({ name: q, threshold: 85, limit: 10 });
    const k = (byKind[kind] ??= { n: 0, hit: 0, top1: 0 });
    k.n++;
    const idx = res.findIndex((m) => m.entry.id === e.id);
    if (idx >= 0) k.hit++;
    if (idx === 0 || (idx > 0 && res[0].score === res[idx].score)) k.top1++;
  }
}

// Negatives: large companies that are not on the US lists as named here (checked against US lists only).
const NEGATIVES = [
  "Toyota Motor Corporation", "Sony Group Corporation", "Panasonic Holdings Corporation", "Canon Inc.", "Nikon Corporation", "Fujifilm Holdings Corporation",
  "Honda Motor Co., Ltd.", "Nissan Motor Co., Ltd.", "Denso Corporation", "Murata Manufacturing Co., Ltd.", "Kyocera Corporation", "Tokyo Electron Limited",
  "Shin-Etsu Chemical Co., Ltd.", "Keyence Corporation", "Fanuc Corporation", "Daikin Industries, Ltd.", "Olympus Corporation", "Ricoh Company, Ltd.",
  "Yamaha Corporation", "Bridgestone Corporation", "Asahi Kasei Corporation", "Toray Industries, Inc.", "Omron Corporation", "Shimadzu Corporation",
  "Siemens AG", "Robert Bosch GmbH", "BASF SE", "Airbus SE", "Nokia Oyj", "Ericsson AB", "ASML Holding N.V.", "Philips N.V.", "Schneider Electric SE",
  "Samsung Electronics Co., Ltd.", "LG Electronics Inc.", "SK Hynix Inc.", "Hyundai Motor Company", "TSMC", "MediaTek Inc.", "Foxconn Technology Group",
  "Infosys Limited", "Tata Motors Limited", "Wipro Limited", "Petrobras", "Embraer S.A.", "Nestle S.A.", "Novartis AG", "Roche Holding AG",
  "Apple Inc.", "Microsoft Corporation", "Intel Corporation", "Texas Instruments Incorporated", "Caterpillar Inc.", "Boeing Company", "General Electric Company",
  "Siam Cement Group", "PTT Public Company Limited", "Vingroup JSC", "Petronas", "Singapore Airlines Limited", "Qantas Airways Limited", "BHP Group Limited",
];
const US_LISTS = ["EL", "MEU", "UVL", "DPL", "SDN", "SSI", "ISN", "DTC", "CMIC", "NS-MBS", "PLC", "CAP"] as never[];
const negHits = NEGATIVES.map((n) => ({ name: n, hits: data.screening.search({ name: n, threshold: 85, lists: US_LISTS, limit: 3 }).map((m) => `${m.score} ${m.entry.list} ${m.matchedName}`) }));

out.screening = {
  entries: data.screening.entries.length,
  benchmark: { sampledEntries: sample.length, threshold: 85, byVariant: byKind },
  negatives: { n: NEGATIVES.length, withAnyHit: negHits.filter((x) => x.hits.length).length, examples: negHits.filter((x) => x.hits.length) },
};

// ---------------------------------------------------------------------------

const file = path.resolve(import.meta.dirname, "../docs/evaluation-results.json");
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`);

const c = out.ccl as Record<string, number>;
console.log(`CCL: ${c.eccns} ECCNs, ${c.controlRows} control rows`);
console.log(`  resolved to Country Chart columns: ${c.columnOnly} (+${c.columnPlusText} with additional text)`);
console.log(`  textual requirements: ${c.textual} — interpreted ${c.textualInterpreted}, sent to review ${c.textualForReview}`);
console.log(`Screening benchmark (threshold 85, ${sample.length} listed entities):`);
for (const [k, v] of Object.entries(byKind)) console.log(`  ${k.padEnd(20)} recall ${((v.hit / v.n) * 100).toFixed(1)}%  top-1 ${((v.top1 / v.n) * 100).toFixed(1)}%  (n=${v.n})`);
console.log(`Negatives: ${negHits.filter((x) => x.hits.length).length}/${NEGATIVES.length} large non-listed companies produced a US-list hit ≥85`);
for (const x of negHits.filter((y) => y.hits.length)) console.log(`  ${x.name}: ${x.hits.join(" | ")}`);
