import { Case, Item, Party, type Case as CaseT, type Item as ItemT } from "../src/shared/case.ts";
import { loadData, type LoadedData } from "../src/data/load.ts";

let cached: LoadedData | null = null;
export function data(): LoadedData {
  cached ??= loadData();
  return cached;
}

type ItemInput = Omit<Partial<ItemT>, "us" | "jp" | "cn"> & { us?: Partial<ItemT["us"]>; jp?: Partial<ItemT["jp"]> };

export function item(p: ItemInput = {}): ItemT {
  return Item.parse({ id: p.id ?? "i1", name: p.name ?? "Test item", ...p, us: { ...p.us }, jp: { ...p.jp }, cn: {} });
}

export function party(name: string, country: string, role: Party["role"] = "end_user", id = "p1"): Party {
  return Party.parse({ id, role, name, country });
}

/** All end-use / red-flag questions answered "no" unless overridden. */
export function cleanAnswers(overrides: Record<string, "yes" | "no" | "unknown"> = {}): Record<string, "yes" | "no" | "unknown"> {
  const out: Record<string, "yes" | "no" | "unknown"> = {
    "us.informed": "no", "us.nuclear": "no", "us.missile": "no", "us.cbw": "no", "us.meu": "no", "us.milintel": "no",
    "us.advcomp": "no", "us.ruOilGas": "no", "us.affiliate50": "no",
    "jp.informWmd": "no", "jp.informConv": "no", "jp.wmdUse": "no", "jp.wmdUser": "no", "jp.convUse": "no", "jp.convUser": "no", "jp.designated": "no",
  };
  for (let n = 1; n <= 40; n++) out[`us.redflag.${n}`] = "no";
  return { ...out, ...overrides };
}

export function kase(p: Partial<CaseT> & { items: ItemT[] }): CaseT {
  const now = "2026-09-29T00:00:00.000Z";
  const parties = p.parties ?? [party("Acme Trading", p.destination ?? "DE")];
  const screenings = p.screenings ?? Object.fromEntries(parties.map((x) => [x.id, { partyId: x.id, query: x.name, ranAt: now, dataAsOf: "2026-09-24", threshold: 85, hits: [] }]));
  return Case.parse({
    id: "c1",
    ref: "EC-TEST",
    title: "Test",
    shipFrom: "JP",
    createdAt: now,
    updatedAt: now,
    answers: cleanAnswers(),
    ...p,
    parties,
    screenings,
  });
}
