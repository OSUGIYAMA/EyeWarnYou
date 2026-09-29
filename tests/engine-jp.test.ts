// Japan FEFTA scenarios, derived from 輸出令 第1条・第2条・第4条, 別表第一/第三/第三の二/第三の三/第四,
// 貨物等省令 第14条の2 and the two おそれ省令.
import { describe, expect, it } from "vitest";
import { assessJp, catchAllScopeFromHs } from "../src/engine/jp/index.ts";
import { DEFAULT_FX } from "../src/engine/index.ts";
import { cleanAnswers, data, item, kase, party } from "./helpers.ts";

const jp = (c: Parameters<typeof assessJp>[0]) => assessJp(c, data().engine, { fxPerUsd: DEFAULT_FX });

describe("JP — catch-all scope from HS code (貨物等省令第14条の2)", () => {
  it.each([
    ["8542.31", "16-1"], // integrated circuits
    ["8542.90", "16-2"], // parts of ICs are excluded from 16の項（1）
    ["8456.11", "16-1"], // machine tools
    ["9030.20", "16-1"], // oscilloscopes
    ["8471.30", "16-2"], // computers — Chapter 84, not designated
    ["0901.11", "out_of_scope"], // coffee
    ["6109.10", "out_of_scope"], // T-shirts (Chapter 61)
  ])("HS %s → %s", (hs, expected) => {
    expect(catchAllScopeFromHs(hs, data().engine)).toBe(expected);
  });
});

describe("JP — list control", () => {
  it("listed item requires a license even to Group A; small-value exception is a candidate under ¥1,000,000", () => {
    const c = kase({ destination: "KR", items: [item({ unitValue: 500_000, currency: "JPY", jp: { listStatus: "listed", kou: "7の項（1）" } })] });
    const r = jp(c);
    expect(r.items[0].outcome).toBe("exception_available");
    expect(r.items[0].exceptions[0].code).toBe("少額特例");
  });

  it("15の項 goods use the ¥50,000 threshold (別表第三の三)", () => {
    const c = kase({ destination: "KR", items: [item({ unitValue: 60_000, currency: "JPY", jp: { listStatus: "listed", kou: "15の項（1）" } })] });
    expect(jp(c).items[0].outcome).toBe("license_required");
  });

  it("small-value exception is never available to countries of concern (別表第四)", () => {
    const c = kase({ destination: "IR", items: [item({ unitValue: 10_000, currency: "JPY", jp: { listStatus: "listed", kou: "7の項（1）" } })] });
    expect(jp(c).items[0].exceptions).toHaveLength(0);
  });

  it("1の項 (arms) has no exceptions", () => {
    const c = kase({ destination: "US", items: [item({ unitValue: 1000, currency: "JPY", jp: { listStatus: "listed", kou: "1の項（1）" } })] });
    expect(jp(c).items[0].outcome).toBe("license_required");
  });
});

describe("JP — catch-all", () => {
  it("non-listed IC (16の項（1）) to China with no concerns → no license", () => {
    const c = kase({ destination: "CN", items: [item({ hsCode: "8542.31", jp: { listStatus: "not_listed" } })] });
    expect(jp(c).items[0].outcome).toBe("no_license_required");
  });

  it("16の項（1）to a general destination with a military end user → conventional catch-all license", () => {
    const c = kase({ destination: "CN", items: [item({ hsCode: "8542.31", jp: { listStatus: "not_listed" } })], answers: cleanAnswers({ "jp.convUser": "yes", "jp.convClear": "no" }) });
    expect(jp(c).items[0].outcome).toBe("license_required");
  });

  it("16の項（2）to a general destination: conventional end-user requirement does not apply", () => {
    const c = kase({ destination: "CN", items: [item({ hsCode: "8471.30", jp: { listStatus: "not_listed" } })], answers: cleanAnswers({ "jp.convUser": "yes", "jp.convClear": "no" }) });
    expect(jp(c).items[0].outcome).toBe("no_license_required");
  });

  it("16の項（2）to a UN arms-embargo destination (Libya): conventional end-user requirement applies", () => {
    const c = kase({ destination: "LY", items: [item({ hsCode: "8471.30", jp: { listStatus: "not_listed" } })], answers: cleanAnswers({ "jp.convUser": "yes", "jp.convClear": "no" }) });
    expect(jp(c).items[0].outcome).toBe("license_required");
  });

  it("明らかガイドライン ⑲: 'clearly unrelated' cannot clear a 16の項（1）export to a UN arms-embargo destination", () => {
    const c = kase({ destination: "LY", items: [item({ hsCode: "8542.31", jp: { listStatus: "not_listed" } })], answers: cleanAnswers({ "jp.convUser": "yes", "jp.convClear": "yes" }) });
    expect(jp(c).items[0].outcome).toBe("license_required");
  });

  it("Group A: catch-all objective requirements do not apply, but a METI notification does", () => {
    const base = { destination: "DE", items: [item({ hsCode: "8542.31", jp: { listStatus: "not_listed" as const } })] };
    expect(jp(kase({ ...base, answers: cleanAnswers({ "jp.convUser": "yes" }) })).items[0].outcome).toBe("no_license_required");
    expect(jp(kase({ ...base, answers: cleanAnswers({ "jp.informConv": "yes" }) })).items[0].outcome).toBe("license_required");
  });

  it("a confirmed METI End User List party triggers the WMD end-user requirement", () => {
    const d = data();
    const eul = d.screening.entries.find((e) => e.list === "METI-EUL" && e.countries[0] === "PK" && e.concern?.includes("N"))!;
    const p = party(eul.name, "PK");
    const c = kase({
      destination: "PK",
      parties: [p],
      screenings: { [p.id]: { partyId: p.id, query: p.name, ranAt: "", dataAsOf: "", threshold: 85, hits: [{ entryId: eul.id, list: "METI-EUL", name: eul.name, matchedName: eul.name, score: 100, countries: ["PK"], disposition: "confirmed" }] } },
      items: [item({ hsCode: "8471.30", jp: { listStatus: "not_listed" } })],
      answers: cleanAnswers({ "jp.wmdClear": "no" }),
    });
    expect(jp(c).items[0].outcome).toBe("license_required");
  });

  it("missing HS code leaves the catch-all undetermined", () => {
    const c = kase({ destination: "CN", items: [item({ jp: { listStatus: "not_listed" } })] });
    expect(jp(c).items[0].outcome).toBe("incomplete");
  });
});

describe("JP — export approval regimes", () => {
  it("listed goods to Russia need export approval (別表第二の三 第1号)", () => {
    const c = kase({ destination: "RU", items: [item({ jp: { listStatus: "listed", kou: "7の項（1）" } })] });
    const r = jp(c);
    expect(r.items[0].findings.some((f) => f.id.startsWith("jp.approval"))).toBe(true);
  });

  it("non-listed goods to Russia require a 別表第二の三 determination", () => {
    const c = kase({ destination: "RU", items: [item({ hsCode: "8471.30", jp: { listStatus: "not_listed" } })] });
    expect(jp(c).items[0].outcome).toBe("incomplete");
  });

  it("North Korea is prohibited", () => {
    const c = kase({ destination: "KP", items: [item({ hsCode: "0901.11", jp: { listStatus: "not_listed" } })] });
    expect(jp(c).outcome).toBe("prohibited");
  });

  it("FEFTA does not attach to shipments from outside Japan", () => {
    const c = kase({ shipFrom: "SG", destination: "CN", items: [item({ jp: { listStatus: "listed", kou: "7の項（1）" } })] });
    expect(jp(c).nexus.attaches).toBe(false);
  });
});
