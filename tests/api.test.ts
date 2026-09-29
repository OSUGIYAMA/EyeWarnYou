// End-to-end API test against a throwaway database: create → screen → disposition → review.
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kanmon-test-"));
process.env.KANMON_DB = path.join(dir, "test.db");

let app: typeof import("../src/server/app.ts").app;

beforeAll(async () => {
  const { store } = await import("../src/server/store.ts");
  store.load();
  app = (await import("../src/server/app.ts")).app;
});

const json = (body: unknown) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("API", () => {
  let id = "";

  it("creates a case and returns an assessment", async () => {
    const res = await app.request("/api/cases", json({ title: "API test", shipFrom: "JP", destination: "CN", parties: [{ id: "p1", role: "end_user", name: "Hangzhou Hikvision Digital Technology Co., Ltd.", country: "CN" }] }));
    expect(res.status).toBe(201);
    const body = await res.json();
    id = body.case.id;
    expect(body.case.ref).toMatch(/^KM-\d{4}-\d{4}$/);
    expect(body.assessment.overall).toBe("incomplete");
  });

  it("screens parties and stores hits as pending", async () => {
    const res = await app.request(`/api/cases/${id}/screen`, { method: "POST" });
    const body = await res.json();
    const hits = body.case.screenings.p1.hits;
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h: { disposition: string }) => h.disposition === "pending")).toBe(true);
  });

  it("records a disposition and re-assesses", async () => {
    const view = await (await app.request(`/api/cases/${id}`)).json();
    const el = view.case.screenings.p1.hits.find((h: { list: string }) => h.list === "EL");
    const res = await app.request(`/api/cases/${id}/disposition`, json({ partyId: "p1", entryId: el.entryId, disposition: "confirmed", note: "Same entity" }));
    const body = await res.json();
    expect(body.assessment.jurisdictions.find((j: { jurisdiction: string }) => j.jurisdiction === "US").findings.some((f: { id: string }) => f.id.startsWith("us.el."))).toBe(true);
  });

  it("refuses to approve an incomplete case", async () => {
    const res = await app.request(`/api/cases/${id}/review`, json({ action: "approved" }));
    expect(res.status).toBe(409);
  });

  it("serves reference data, the timeline and exposure", async () => {
    expect((await (await app.request("/api/ccl/3A001")).json()).id).toBe("3A001");
    const check = await (await app.request("/api/ccl/3A001/check?dest=CN&para=a.2")).json();
    expect(check.rows.some((r: { licenseRequired: string; applies: string }) => r.applies === "yes" && r.licenseRequired === "yes")).toBe(true);
    const tl = await (await app.request("/api/timeline")).json();
    expect(tl.events.length).toBeGreaterThan(5);
    const ex = await (await app.request("/api/exposure")).json();
    expect(ex.materials.length).toBeGreaterThan(10);
    const hs = await (await app.request("/api/hs/854231")).json();
    expect(hs.jpCatchAll).toBe("16-1");
  });

  it("reports AI as not configured without a key", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await app.request("/api/ai/classify", json({ name: "x" }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("ai_not_configured");
  });
});
