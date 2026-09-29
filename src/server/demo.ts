// Sample cases that exercise every regime and most rule families. Clearly labelled "[Sample]".
import type { Case, Item, Party } from "../shared/case.ts";
import { assessCase } from "../engine/index.ts";
import { createCase, getSettings, saveCase } from "./db.ts";
import { store } from "./store.ts";

const rid = () => Math.random().toString(36).slice(2, 10);
const no = "no" as const;

type ItemSeed = Omit<Partial<Item>, "us" | "jp" | "cn"> & { name: string; us?: Partial<Item["us"]>; jp?: Partial<Item["jp"]>; cn?: Partial<Item["cn"]> };

function item(p: ItemSeed): Item {
  return {
    id: rid(),
    kind: "commodity",
    quantity: 1,
    currency: "USD",
    countryOfOrigin: "",
    ...p,
    us: { origin: "unknown", usContentEccns: [], fdp: {}, eccn: "", paragraph: "", classification: "unclassified", controlOverrides: {}, ...p.us },
    jp: { listStatus: "unclassified", kou: "", catchAllScope: "unknown", appendix2_3: "unknown", ...p.jp },
    cn: { listStatus: "unclassified", cnCode: "", materials: [], ...p.cn },
  } as Item;
}
const party = (role: Party["role"], name: string, country: string, address = ""): Party => ({ id: rid(), role, name, country, address });

const baseAnswers = (extra: Record<string, "yes" | "no" | "unknown"> = {}) => {
  const a: Record<string, "yes" | "no" | "unknown"> = {
    "us.informed": no, "us.nuclear": no, "us.missile": no, "us.cbw": no, "us.meu": no, "us.milintel": no, "us.advcomp": no, "us.ruOilGas": no, "us.affiliate50": no,
    "jp.informWmd": no, "jp.informConv": no, "jp.wmdUse": no, "jp.wmdUser": no, "jp.convUse": no, "jp.convUser": no, "jp.designated": no,
  };
  for (let n = 1; n <= 29; n++) a[`us.redflag.${n}`] = no;
  return { ...a, ...extra };
};

export const SAMPLES: (Partial<Case> & { title: string })[] = [
  {
    title: "[Sample] US-origin MMIC amplifiers to a Shenzhen distributor",
    shipFrom: "JP",
    destination: "CN",
    contractRef: "PO-2026-0412",
    incoterms: "CIP",
    shipDate: "2026-10-20",
    endUseDescription: "Resale to domestic customers for 5G base-station power amplifiers.",
    items: [
      item({
        name: "GaN MMIC power amplifier, 2–6 GHz",
        manufacturer: "(US manufacturer)",
        model: "PA-2060",
        quantity: 200,
        unitValue: 180,
        hsCode: "8542.33",
        countryOfOrigin: "US",
        description: "Monolithic microwave integrated circuit amplifier, 2–6 GHz, saturated output 40 W.",
        us: { origin: "us_origin", eccn: "3A001", paragraph: "b.2", classification: "provisional", classificationBasis: "Manufacturer ECCN statement (to be confirmed)" },
        jp: { listStatus: "listed", kou: "7の項（1）", classificationBasis: "Supplier 該非判定書 (parameter sheet 7項)" },
      }),
    ],
    parties: [party("consignee", "Shenzhen Hengtai Electronics Trading Co., Ltd.", "CN", "Futian District, Shenzhen")],
    answers: baseAnswers({ "us.redflag.9": "unknown" }),
  },
  {
    title: "[Sample] 5-axis machining centre to an automotive supplier in Thailand",
    shipFrom: "JP",
    destination: "TH",
    contractRef: "SO-7781",
    incoterms: "FOB",
    shipDate: "2026-11-30",
    endUseDescription: "Machining of aluminium transmission housings.",
    items: [
      item({
        name: "5-axis vertical machining centre",
        manufacturer: "(Japanese manufacturer)",
        model: "VMC-5X",
        unitValue: 68_000_000,
        currency: "JPY",
        hsCode: "8457.10",
        countryOfOrigin: "JP",
        description: "Simultaneous 5-axis contouring, positioning accuracy 4 µm (ISO 230-2).",
        us: { origin: "foreign_no_us_content", fdp: { gate: "no" } },
        jp: { listStatus: "listed", kou: "6の項（2）", classificationBasis: "該非判定書 — 貨物等省令第5条第2号" },
      }),
    ],
    parties: [party("end_user", "Siam Precision Auto Parts Co., Ltd.", "TH", "Amata City, Chonburi")],
    answers: baseAnswers(),
  },
  {
    title: "[Sample] Rugged laptops to a distributor in Almaty",
    shipFrom: "JP",
    destination: "KZ",
    contractRef: "Quote Q-3390",
    incoterms: "EXW",
    shipDate: "2026-10-05",
    endUseDescription: "Resale — end users not disclosed.",
    items: [
      item({
        name: "Rugged notebook computer",
        manufacturer: "(Japanese OEM)",
        model: "RB-14",
        quantity: 150,
        unitValue: 1_900,
        hsCode: "8471.30",
        countryOfOrigin: "JP",
        description: "Mass-market encryption; US-origin CPU and wireless module.",
        us: { origin: "foreign_with_us_content", usContentValue: 520, usContentEccns: ["5A992.c"], fdp: { gate: "no" }, eccn: "5A992", paragraph: "c", classification: "confirmed", classificationBasis: "Mass-market encryption (Note 3 to Category 5, Part 2)" },
        jp: { listStatus: "not_listed", appendix2_3: "yes", classificationBasis: "非該当 — 9の項 mass-market exclusion" },
      }),
    ],
    parties: [party("consignee", "Almaty Tech Distribution LLP", "KZ"), party("forwarder", "Eurasia Freight Forwarding", "KZ")],
    answers: baseAnswers({ "us.redflag.1": "yes", "us.redflag.9": "yes", "jp.designated": "unknown" }),
    notes: "Customer declined to name end users; forwarder listed as final delivery address.",
  },
  {
    title: "[Sample] Servo motors with Dy-NdFeB magnets to a US aerospace contractor",
    shipFrom: "JP",
    destination: "US",
    contractRef: "PO 4500123",
    incoterms: "DAP",
    shipDate: "2026-12-01",
    endUseDescription: "Actuators for airframe flight-control test rigs.",
    items: [
      item({
        name: "Brushless servo motor, 400 W",
        manufacturer: "(Japanese manufacturer)",
        model: "SM-400D",
        quantity: 60,
        unitValue: 950,
        hsCode: "8501.52",
        countryOfOrigin: "JP",
        description: "Rotor with sintered NdFeB magnets containing dysprosium, magnets sourced from China.",
        us: { origin: "foreign_no_us_content", fdp: { gate: "no" } },
        jp: { listStatus: "not_listed", classificationBasis: "非該当" },
        cn: { listStatus: "unclassified", cnCode: "", materials: ["ndfeb-tbdy"], cnControlledContentPct: 3.5 },
      }),
    ],
    parties: [party("end_user", "Lockheed Martin Aeronautics", "US", "Fort Worth, Texas")],
    answers: baseAnswers({ "cn.usMilitary": "unknown", "cn.euc": "no" }),
  },
  {
    title: "[Sample] Chinese subsidiary: sintered magnets to a Watch-listed customer in Japan",
    shipFrom: "CN",
    destination: "JP",
    contractRef: "CN-SZ-2026-118",
    incoterms: "FCA",
    shipDate: "2026-10-15",
    endUseDescription: "Components for industrial sensors.",
    items: [
      item({
        name: "Sintered NdFeB magnet blocks (Dy-doped)",
        quantity: 20_000,
        unitValue: 1.8,
        hsCode: "8505.11",
        countryOfOrigin: "CN",
        description: "Grade N42SH, Dy content 2 wt%.",
        us: { origin: "foreign_no_us_content", fdp: { gate: "no" } },
        cn: { listStatus: "listed", cnCode: "1C905", materials: ["ndfeb-tbdy", "dysprosium"] },
      }),
    ],
    parties: [party("end_user", "TDK Corporation", "JP", "Chuo-ku, Tokyo")],
    answers: baseAnswers({ "cn.catchAll": "no", "cn.jpMilitary": "no" }),
  },
];

export function seedSamples(): string[] {
  const ids: string[] = [];
  const s = getSettings();
  for (const sample of SAMPLES) {
    const c = createCase(sample);
    // Screen parties the same way the UI does
    const asOf = store.data.screeningStamps.map((x) => x.asOf).sort().at(-1) ?? "";
    for (const p of c.parties) {
      const matches = store.data.screening.search({ name: p.name, country: p.country || undefined, threshold: s.screeningThreshold, limit: 10 });
      c.screenings[p.id] = {
        partyId: p.id,
        query: p.name,
        ranAt: new Date().toISOString(),
        dataAsOf: asOf,
        threshold: s.screeningThreshold,
        hits: matches.map((m) => ({
          entryId: m.entry.id,
          list: m.entry.list,
          name: m.entry.name,
          matchedName: m.matchedName,
          score: m.score,
          countries: m.entry.countries,
          disposition: m.score >= 99 && m.countryMatch !== "mismatch" ? ("confirmed" as const) : ("pending" as const),
          note: m.score >= 99 ? "Exact name and country match (sample data)" : undefined,
          by: m.score >= 99 ? "Sample" : undefined,
          at: m.score >= 99 ? new Date().toISOString() : undefined,
        })),
      };
    }
    const a = assessCase(c, store.data.engine, { fxPerUsd: s.fxPerUsd, bulkLicenses: s.bulkLicenses });
    saveCase(c, a.overall);
    ids.push(c.id);
  }
  return ids;
}
