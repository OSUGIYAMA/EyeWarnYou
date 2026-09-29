// US EAR scenarios. Expected outcomes are derived by hand from the regulation text
// (Country Chart, ECCN entries, Part 734/740/744/746) — see comments on each case.
import { describe, expect, it } from "vitest";
import { assessUs } from "../src/engine/us/index.ts";
import { DEFAULT_FX } from "../src/engine/index.ts";
import { cleanAnswers, data, item, kase, party } from "./helpers.ts";

const us = (c: Parameters<typeof assessUs>[0], asOf = "2026-09-29") => assessUs(c, data().engine, { asOf, fxPerUsd: DEFAULT_FX });
const noFdp = { gate: "no" as const };

describe("US — jurisdiction (Part 734)", () => {
  it("foreign-made item with 20% US content to China is below the 25% de minimis level (§734.4(d))", () => {
    const c = kase({ destination: "CN", items: [item({ unitValue: 1000, us: { origin: "foreign_with_us_content", usContentValue: 200, fdp: noFdp } })] });
    const r = us(c);
    expect(r.nexus.attaches).toBe(false);
    expect(r.outcome).toBe("not_applicable");
  });

  it("12% US content to Iran exceeds the 10% level for Country Group E:1 (§734.4(c))", () => {
    const c = kase({ destination: "IR", items: [item({ unitValue: 1000, us: { origin: "foreign_with_us_content", usContentValue: 120, fdp: noFdp, eccn: "EAR99" } })] });
    const r = us(c);
    expect(r.nexus.attaches).toBe(true);
    const dm = r.items[0].findings.find((f) => f.id === "deminimis");
    expect(dm?.evidence).toMatchObject({ kind: "deminimis", threshold: 10 });
  });

  it("US-origin 9A515 content has no de minimis level to Country Group D:5 (§734.4(a)(6)(i))", () => {
    const c = kase({ destination: "CN", items: [item({ unitValue: 1000, us: { origin: "foreign_with_us_content", usContentValue: 5, usContentEccns: ["9A515.a"], fdp: noFdp } })] });
    const r = us(c);
    expect(r.nexus.attaches).toBe(true);
  });

  it("unanswered FDP gate leaves jurisdiction undetermined", () => {
    const c = kase({ destination: "DE", items: [item({ us: { origin: "foreign_no_us_content" } })] });
    expect(us(c).nexus.attaches).toBe("unknown");
  });
});

describe("US — CCL × Country Chart", () => {
  it("3A001.a.2 (NS2 only) to Germany: no X in NS2 → NLR", () => {
    const c = kase({ destination: "DE", items: [item({ us: { origin: "us_origin", eccn: "3A001", paragraph: "a.2" } })] });
    const r = us(c);
    expect(r.items[0].outcome).toBe("no_license_required");
  });

  it("3A001.a.2 to Brazil: NS2 X → license required; LVS ($1,500) and GBS surface as candidates (Group B, NS-only)", () => {
    const c = kase({ destination: "BR", items: [item({ unitValue: 900, currency: "USD", us: { origin: "us_origin", eccn: "3A001", paragraph: "a.2" } })] });
    const r = us(c);
    expect(r.items[0].outcome).toBe("exception_available");
    const codes = r.items[0].exceptions.map((e) => e.code);
    expect(codes).toContain("LVS");
    expect(codes).toContain("GBS");
  });

  it("LVS is not offered when the value exceeds the ECCN limit", () => {
    const c = kase({ destination: "BR", items: [item({ unitValue: 5000, us: { origin: "us_origin", eccn: "3A001", paragraph: "a.2" } })] });
    const codes = us(c).items[0].exceptions.map((e) => e.code);
    expect(codes).not.toContain("LVS");
  });

  it("3A001.b.2 MMIC: the NS1 row is conditional (civil telecom carve-out) and must be confirmed", () => {
    const c = kase({ destination: "KR", items: [item({ us: { origin: "us_origin", eccn: "3A001", paragraph: "b.2" } })] });
    const r = us(c);
    expect(r.items[0].findings.some((f) => f.id === "ccl.0.scope" && f.status === "incomplete")).toBe(true);
  });

  it("3A001.b.2 to South Korea with NS1/RS1 confirmed → license required, STA candidate (A:5)", () => {
    const c = kase({ destination: "KR", items: [item({ us: { origin: "us_origin", eccn: "3A001", paragraph: "b.2", controlOverrides: { "0": true, "2": true } } })] });
    const r = us(c);
    expect(r.items[0].exceptions.map((e) => e.code)).toContain("STA");
    expect(r.items[0].outcome).toBe("exception_available");
  });

  it("5A992.c mass-market encryption to Germany: AT only → NLR", () => {
    const c = kase({ destination: "DE", items: [item({ us: { origin: "us_origin", eccn: "5A992", paragraph: "c" } })] });
    expect(us(c).items[0].outcome).toBe("no_license_required");
  });

  it("3A991 (AT only) to China → NLR, but MEU knowledge brings it under §744.21 (Supp. No. 2 item)", () => {
    const base = { destination: "CN", items: [item({ us: { origin: "us_origin", eccn: "3A991", paragraph: "a" } })] };
    expect(us(kase(base)).items[0].outcome).toBe("no_license_required");
    const withMeu = kase({ ...base, answers: cleanAnswers({ "us.meu": "yes" }) });
    const r = us(withMeu);
    expect(r.items[0].outcome).toBe("license_required");
    expect(r.items[0].findings.some((f) => f.id === "eu.meu.item")).toBe(true);
  });
});

describe("US — Part 746 destinations", () => {
  it("EAR99 to Cuba requires a license (§746.2)", () => {
    const c = kase({ destination: "CU", items: [item({ us: { origin: "us_origin", eccn: "EAR99" } })] });
    expect(us(c).items[0].outcome).toBe("license_required");
  });

  it("EAR99 laptops (HTS 847130) to Russia are listed in Supp. No. 4 to Part 746", () => {
    const c = kase({ destination: "RU", items: [item({ hsCode: "8471.30", us: { origin: "us_origin", eccn: "EAR99" } })] });
    const r = us(c);
    expect(r.items[0].outcome).toBe("license_required");
    expect(r.items[0].findings.some((f) => f.id === "dest.746.8(a)(5)")).toBe(true);
  });

  it("any CCL item to Russia requires a license, even AT-only (§746.8(a)(1))", () => {
    const c = kase({ destination: "RU", items: [item({ us: { origin: "us_origin", eccn: "5A992", paragraph: "c" } })] });
    expect(us(c).items[0].outcome).toBe("license_required");
  });

  it("EAR99 food to North Korea is excepted from §746.4 but the item stays subject to party / end-use checks", () => {
    const c = kase({ destination: "KP", items: [item({ hsCode: "1006.30", us: { origin: "us_origin", eccn: "EAR99" } })] });
    const r = us(c);
    expect(r.items[0].findings.some((f) => f.id === "dest.746.4.food")).toBe(true);
  });
});

describe("US — parties", () => {
  it("a confirmed Entity List party requires a license for EAR99 items (§744.11)", () => {
    const d = data();
    const hit = d.screening.search({ name: "Huawei Technologies Co., Ltd.", country: "CN", lists: ["EL"] })[0];
    expect(hit).toBeDefined();
    const p = party("Huawei Technologies Co., Ltd.", "CN");
    const c = kase({
      destination: "CN",
      parties: [p],
      screenings: { [p.id]: { partyId: p.id, query: p.name, ranAt: "", dataAsOf: "", threshold: 85, hits: [{ entryId: hit.entry.id, list: "EL", name: hit.entry.name, matchedName: hit.matchedName, score: hit.score, countries: ["CN"], disposition: "confirmed" }] } },
      items: [item({ us: { origin: "us_origin", eccn: "EAR99" } })],
    });
    const r = us(c);
    expect(r.items[0].outcome).toBe("license_required");
    expect(r.findings.some((f) => f.id.startsWith("us.el."))).toBe(true);
  });

  it("a confirmed Denied Persons List party makes the transaction prohibited (GP4)", () => {
    const d = data();
    const dpl = d.screening.entries.find((e) => e.list === "DPL")!;
    const p = party(dpl.name, dpl.countries[0] ?? "CN");
    const c = kase({
      destination: dpl.countries[0] ?? "CN",
      parties: [p],
      screenings: { [p.id]: { partyId: p.id, query: p.name, ranAt: "", dataAsOf: "", threshold: 85, hits: [{ entryId: dpl.id, list: "DPL", name: dpl.name, matchedName: dpl.name, score: 100, countries: dpl.countries, disposition: "confirmed" }] } },
      items: [item({ us: { origin: "us_origin", eccn: "EAR99" } })],
    });
    expect(us(c).outcome).toBe("prohibited");
  });

  it("pending screening matches keep the assessment incomplete", () => {
    const p = party("Some Co", "CN");
    const c = kase({
      destination: "CN",
      parties: [p],
      screenings: { [p.id]: { partyId: p.id, query: p.name, ranAt: "", dataAsOf: "", threshold: 85, hits: [{ entryId: "EL:x", list: "EL", name: "x", matchedName: "x", score: 90, countries: [], disposition: "pending" }] } },
      items: [item({ us: { origin: "us_origin", eccn: "EAR99" } })],
    });
    expect(us(c).outcome).toBe("incomplete");
  });
});

describe("US — Affiliates Rule timing", () => {
  it("is reported as stayed before 2026-11-10 and asks about ownership from that date", () => {
    const c = kase({ destination: "DE", items: [item({ us: { origin: "us_origin", eccn: "EAR99" } })], answers: cleanAnswers({ "us.affiliate50": "unknown" }) });
    expect(us(c, "2026-10-01").findings.some((f) => f.id === "us.affiliate.stayed")).toBe(true);
    const later = us(c, "2026-11-10");
    expect(later.findings.some((f) => f.id === "us.affiliate.q")).toBe(true);
    expect(later.outcome).toBe("incomplete");
  });
});

describe("US — regressions", () => {
  it("advanced-computing exceptions limited to 3A001.z do not surface for 3A001.b.2", () => {
    const c = kase({ destination: "KR", items: [item({ us: { origin: "us_origin", eccn: "3A001", paragraph: "b.2", controlOverrides: { "0": true, "2": true } } })] });
    const codes = us(c).items[0].exceptions.map((e) => e.code);
    expect(codes).not.toContain("NAC/ACA");
    expect(codes).not.toContain("AIA");
  });

  it("a red flag keeps the case incomplete until the inquiry is recorded as resolved", () => {
    const base = { destination: "DE", items: [item({ us: { origin: "us_origin", eccn: "EAR99" } })] };
    expect(us(kase({ ...base, answers: cleanAnswers({ "us.redflag.9": "yes" }) })).outcome).toBe("incomplete");
    expect(us(kase({ ...base, answers: cleanAnswers({ "us.redflag.9": "yes", "us.redflagsResolved": "yes" }) })).outcome).toBe("no_license_required");
  });
});

describe("US — prose CCL requirements", () => {
  it("3A090.b to China: RS requirement from the Country-Group formula; NAC/ACA surfaces, LVS/GBS do not", () => {
    const c = kase({ destination: "CN", items: [item({ unitValue: 100, us: { origin: "us_origin", eccn: "3A090", paragraph: "b" } })] });
    const r = us(c).items[0];
    expect(r.findings.some((f) => f.status === "block" && /RS/.test(f.title))).toBe(true);
    const codes = r.exceptions.map((e) => e.code);
    expect(codes).toContain("NAC/ACA");
    expect(codes).not.toContain("LVS");
  });
  it("3A090.a to Germany: AI Diffusion worldwide wording not enforced → no RS requirement", () => {
    const c = kase({ destination: "DE", items: [item({ us: { origin: "us_origin", eccn: "3A090", paragraph: "a" } })] });
    const r = us(c).items[0];
    expect(r.findings.some((f) => f.status === "block" && /RS/.test(f.title))).toBe(false);
  });
});
