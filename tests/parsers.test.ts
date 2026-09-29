// Parser and matcher unit tests on real source phrasing.
import { describe, expect, it } from "vitest";
import { extractParagraphRefs, parseControlRow, parseLicenseException } from "../src/ingest/ecfr.ts";
import { kanjiToNumber, normalizeSub } from "../src/ingest/egov.ts";
import { parseAnnex } from "../src/ingest/mofcom.ts";
import { levenshtein, normalizeName, tokenSimilarity } from "../src/engine/screening/normalize.ts";
import { controlApplies, paragraphRelation } from "../src/engine/us/ccl.ts";

describe("CCL control rows", () => {
  it("keeps only references that belong to the entry", () => {
    const row = parseControlRow(
      "NP applies to pulse discharge capacitors in 3A001.e.2 and superconducting solenoidal electromagnets in 3A001.e.3 that meet or exceed the technical parameters in 3A201.a and 3A201.b, respectively; and 3A001.z.3",
      "NP Column 1.",
      "3A001",
    );
    expect(row.paragraphs).toEqual(["e.2", "e.3", "z.3"]);
    expect(row.mode).toBe("only");
    expect(row.columns).toEqual(["NP1"]);
  });

  it("recognises 'entire entry except'", () => {
    const row = parseControlRow("RS applies to entire entry, except 8A620.y", "RS Column 1", "8A620");
    expect(row.mode).toBe("except");
    expect(row.paragraphs).toEqual(["y"]);
  });

  it("marks end-use carve-outs as conditional", () => {
    const row = parseControlRow("NS applies to “MMIC” amplifiers in 3A001.b.2 and discrete microwave transistors in 3A001.b.3, except those 3A001.b.2 and b.3 items being exported or reexported for use in civil telecommunications applications", "NS Column 1.", "3A001");
    expect(row.conditional).toBe(true);
    expect(row.paragraphs).toContain("b.2");
  });

  it("recovers a chart column merged into the scope cell (source anomaly, 1C350)", () => {
    const row = parseControlRow("CB applies to entire entry CB Column 2.", "", "1C350");
    expect(row.columns).toEqual(["CB2"]);
    expect(row.mode).toBe("entire");
  });

  it("treats prose chart cells as special", () => {
    const row = parseControlRow("RS applies to 3A090.b", "To or within the United Arab Emirates or destinations specified in Country Groups D:1, D:4, and D:5 of supplement no. 1 to part 740 of the EAR, excluding any destination also specified in Country Groups A:5 or A:6.", "3A090");
    expect(row.special).toBe(true);
    expect(row.columns).toEqual([]);
  });

  it("parses LVS values and partial availability", () => {
    expect(parseLicenseException("LVS", "$5000")).toMatchObject({ status: "value", valueLimit: 5000 });
    expect(parseLicenseException("LVS", "Yes: $500 for “components,” N/A for systems and equipment.")).toMatchObject({ status: "partial", valueLimit: 500 });
    expect(parseLicenseException("GBS", "N/A")).toMatchObject({ status: "no" });
  });

  it("ignores Latin abbreviations when extracting refs", () => {
    expect(extractParagraphRefs("applies to 5A002.a, e.g. items in 5A002.a.1", "5A002")).toEqual(["a", "a.1"]);
  });
});

describe("paragraph applicability", () => {
  it("relates item paragraphs to scope references", () => {
    expect(paragraphRelation("b.2.a", "b.2")).toBe("within");
    expect(paragraphRelation("b", "b.2")).toBe("contains");
    expect(paragraphRelation("a.1", "b.2")).toBe("none");
  });
  it("asks when the item is classified less precisely than the scope", () => {
    const row = parseControlRow("MT applies to 3A001.a.1.a", "MT Column 1", "3A001");
    expect(controlApplies(row, "a.1").applies).toBe("maybe");
    expect(controlApplies(row, "a.1.a").applies).toBe("yes");
    expect(controlApplies(row, "b.1").applies).toBe("no");
    expect(controlApplies(row, "b.1", true).applies).toBe("yes");
  });
});

describe("Japanese law helpers", () => {
  it("converts kanji numerals", () => {
    expect(kanjiToNumber("一二")).toBe(12);
    expect(kanjiToNumber("十五")).toBe(15);
    expect(kanjiToNumber("一〇")).toBe(10);
    expect(normalizeSub("（十三の二）")).toBe("13の2");
  });
});

describe("MOFCOM annex parsing", () => {
  it("parses numbered annex lines", () => {
    expect(parseAnnex(["1. 斯巴鲁株式会社（SUBARU Corporation）", "12. TDK株式会社（TDK Corporation）"])).toEqual([
      { zh: "斯巴鲁株式会社", en: "SUBARU Corporation" },
      { zh: "TDK株式会社", en: "TDK Corporation" },
    ]);
  });
  it("falls back to prose designations", () => {
    const r = parseAnnex(["决定将参与对台湾地区军售的洛克希德·马丁导弹与火控公司（Lockheed Martin Missiles and Fire Control）、雷神导弹系统公司（Raytheon Missile Systems）列入不可靠实体清单，并采取以下处理措施："]);
    expect(r.map((x) => x.en)).toEqual(["Lockheed Martin Missiles and Fire Control", "Raytheon Missile Systems"]);
  });
  it("parses Latin-only lists", () => {
    const r = parseAnnex(["中方决定将韩华海洋株式会社5家美国相关子公司Hanwha Shipping LLC、Hanwha Philly Shipyard Inc.和HS USA Holdings Corp.列入反制清单"]);
    expect(r.map((x) => x.en)).toEqual(["Hanwha Shipping LLC", "Hanwha Philly Shipyard Inc.", "HS USA Holdings Corp."]);
  });
});

describe("screening normalization", () => {
  it("drops legal forms and folds plurals", () => {
    expect(normalizeName("Huawei Technologies Co., Ltd.").key).toBe("huawei technology");
    expect(normalizeName("HUAWEI TECHNOLOGY").key).toBe("huawei technology");
    expect(normalizeName("Kabushiki Kaisha Toshiba").key).toBe("toshiba");
  });
  it("tokenizes CJK names as bigrams without legal forms", () => {
    expect(normalizeName("华为技术有限公司").tokens).toEqual(["华为", "为技", "技术"]);
  });
  it("counts a transposition as one edit and never scores fuzzy as exact", () => {
    expect(levenshtein("hikvision", "hikvisoin")).toBe(1);
    expect(tokenSimilarity("hikvision", "hikvisoin")).toBeGreaterThan(0.85);
    expect(tokenSimilarity("hikvision", "hikvisoin")).toBeLessThan(1);
    expect(tokenSimilarity("sony", "sona")).toBe(0);
  });
});
