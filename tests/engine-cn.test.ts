// China module scenarios, from MOFCOM announcements 2024 No. 46, 2025 Nos. 18/61/70, 2026 No. 1 and the Dual-Use Items Regulations.
import { describe, expect, it } from "vitest";
import { assessCn } from "../src/engine/cn/index.ts";
import { measureState, CN_MEASURES } from "../src/engine/cn/measures.ts";
import { cleanAnswers, data, item, kase, party } from "./helpers.ts";

const cn = (c: Parameters<typeof assessCn>[0], asOf = "2026-09-29") => assessCn(c, data().engine, { asOf });
const withCn = (materials: string[]) => ({ ...item(), cn: { listStatus: "unclassified" as const, cnCode: "", materials, cnControlledContentPct: undefined as number | undefined } });

describe("CN — nexus", () => {
  it("does not attach to a Japan → Germany shipment without China-origin content or Chinese-listed parties", () => {
    const c = kase({ destination: "DE", items: [item({ hsCode: "8471.30" })] });
    expect(cn(c).nexus.attaches).toBe(false);
  });
  it("attaches when an item contains China-origin Dy-NdFeB magnets", () => {
    const c = kase({ destination: "DE", items: [withCn(["ndfeb-tbdy"])], answers: cleanAnswers({ "cn.euc": "no" }) });
    const r = cn(c);
    expect(r.nexus.attaches).toBe(true);
    expect(r.items[0].findings.some((f) => f.id === "cn.mat.ndfeb-tbdy")).toBe(true);
  });
});

describe("CN — extraterritorial measures", () => {
  it("2026 No. 1: China-origin dual-use items for Japanese military use are prohibited", () => {
    const c = kase({ shipFrom: "JP", destination: "US", items: [withCn(["gallium"])], answers: cleanAnswers({ "cn.jpMilitary": "yes", "cn.euc": "no", "cn.usMilitary": "no" }) });
    expect(cn(c).outcome).toBe("prohibited");
  });
  it("2024 No. 46 para. 1: US military end use is prohibited", () => {
    const c = kase({ destination: "US", items: [withCn(["germanium"])], answers: cleanAnswers({ "cn.usMilitary": "yes", "cn.euc": "no" }) });
    expect(cn(c).outcome).toBe("prohibited");
  });
  it("an end-user commitment makes onward transfer subject to MOFCOM consent", () => {
    const c = kase({ destination: "DE", items: [withCn(["gallium"])], answers: cleanAnswers({ "cn.euc": "yes" }) });
    expect(cn(c).items[0].outcome).toBe("license_required");
  });
});

describe("CN — 2025 No. 61 (0.1% rule) timing", () => {
  const m61 = CN_MEASURES.find((m) => m.id === "2025-61")!;
  it("is suspended on 2026-09-29 and re-applies on the legal expiry date absent a formal extension", () => {
    expect(measureState(m61, "2026-09-29").active).toBe(false);
    expect(measureState(m61, "2026-11-10").active).toBe(true);
  });
  it("flags magnets with ≥0.1% China-origin content once the suspension lapses", () => {
    const it0 = withCn(["ndfeb-tbdy"]);
    it0.cn.cnControlledContentPct = 2;
    const c = kase({ destination: "DE", items: [it0], answers: cleanAnswers({ "cn.euc": "no" }) });
    expect(cn(c, "2026-09-29").items[0].outcome).toBe("no_license_required");
    expect(cn(c, "2026-11-10").items[0].outcome).toBe("license_required");
  });
});

describe("CN — exports from China", () => {
  it("in-force commodity measure (gallium) requires a MOFCOM licence for a Chinese subsidiary's export", () => {
    const c = kase({ shipFrom: "CN", destination: "JP", items: [withCn(["gallium"])], answers: cleanAnswers({ "cn.catchAll": "no", "cn.jpMilitary": "no" }) });
    expect(cn(c).items[0].outcome).toBe("license_required");
  });
  it("a party on the Watch List (e.g. TDK) is flagged", () => {
    const d = data();
    const hit = d.screening.search({ name: "TDK Corporation", country: "JP", lists: ["CN-WL"] })[0];
    expect(hit?.entry.list).toBe("CN-WL");
    const p = party("TDK Corporation", "JP", "consignee");
    const c = kase({
      shipFrom: "CN",
      destination: "JP",
      parties: [p],
      screenings: { [p.id]: { partyId: p.id, query: p.name, ranAt: "", dataAsOf: "", threshold: 85, hits: [{ entryId: hit.entry.id, list: "CN-WL", name: hit.entry.name, matchedName: hit.matchedName, score: hit.score, countries: ["JP"], disposition: "confirmed" }] } },
      items: [withCn(["dysprosium"])],
      answers: cleanAnswers({ "cn.catchAll": "no", "cn.jpMilitary": "no" }),
    });
    const r = cn(c);
    expect(r.findings.some((f) => f.id === "cn.watch")).toBe(true);
  });
});
