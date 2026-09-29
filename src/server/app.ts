// HTTP API. All routes live under /api; the built web app is served from dist/web in production.
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { Case, CaseInput, Disposition, Item, Party, type Case as CaseT } from "../shared/case.ts";
import { assessCase } from "../engine/index.ts";
import { allQuestions } from "../engine/questions.ts";
import { FDP_GATE, relevantFdpRules } from "../engine/us/fdp.ts";
import { POLICY_STATUS } from "../engine/us/status.ts";
import { exposure, timeline } from "../engine/timeline.ts";
import { CN_MATERIALS, CN_MEASURES, measureState } from "../engine/cn/measures.ts";
import { catchAllScopeFromHs } from "../engine/jp/index.ts";
import { evaluateControls } from "../engine/us/ccl.ts";
import { runSync, readSnapshot, type SyncProgress } from "../ingest/sync.ts";
import type { ChangeEntry } from "../ingest/diff.ts";
import { DEFAULT_THRESHOLD } from "../engine/screening/index.ts";
import {
  audit,
  auditLog,
  createCase,
  deleteCase,
  deleteProduct,
  getCase,
  getSettings,
  listCases,
  listProducts,
  logScreening,
  newId,
  publicSettings,
  saveCase,
  screeningHistory,
  updateSettings,
  upsertProduct,
} from "./db.ts";
import { store } from "./store.ts";
import { aiRoutes } from "./ai/routes.ts";
import { seedSamples } from "./demo.ts";
import { landscape } from "./landscape.ts";

export const app = new Hono().basePath("/api");

app.onError((err, c) => {
  if (err instanceof z.ZodError) return c.json({ error: "Invalid request", issues: err.issues }, 400);
  console.error(err);
  return c.json({ error: err.message }, 500);
});

const evaluate = (c: CaseT) => {
  const s = getSettings();
  return assessCase(c, store.data.engine, { fxPerUsd: s.fxPerUsd, bulkLicenses: s.bulkLicenses });
};

// ---------------------------------------------------------------------------
// Meta & reference data

app.get("/meta", (c) => {
  const d = store.data;
  return c.json({
    manifest: d.manifest,
    loadedAt: store.loadedAt,
    stamps: { ccl: d.ccl.stamp, chart: d.chart.stamp, groups: d.groups.stamp, jp: d.engine.jp.stamp, jpList: d.jpList.stamp, screening: d.screeningStamps },
    counts: { eccns: d.ccl.eccns.length, screening: d.screening.entries.length, sections: store.sections.size },
    policyStatus: POLICY_STATUS,
    settings: publicSettings(),
  });
});

app.get("/countries", (c) => {
  const d = store.data;
  return c.json(
    d.countries
      .filter((x) => d.engine.chart.has(x.iso2) || d.engine.groups[x.iso2] || ["JP", "US", "HK", "MO", "TW", "PS"].includes(x.iso2))
      .map((x) => ({
        ...x,
        groups: d.engine.groups[x.iso2] ?? [],
        chart: d.engine.chart.get(x.iso2)?.x ?? [],
        jp: {
          groupA: d.engine.jp.groupA.includes(x.iso2),
          unArmsEmbargo: d.engine.jp.unArmsEmbargo.includes(x.iso2),
          concern: d.engine.jp.concern.includes(x.iso2),
          russiaDiversion: d.engine.jp.russiaDiversion.includes(x.iso2),
        },
        unArmsEmbargoUS: d.engine.ear.unArmsEmbargo.includes(x.iso2),
      })),
  );
});

app.get("/chart", (c) => c.json({ stamp: store.data.chart.stamp, rows: store.data.chart.rows, footnotes: store.data.chart.footnotes }));
app.get("/groups", (c) => c.json(store.data.groups));

app.get("/ccl", (c) => {
  const q = c.req.query("q")?.trim();
  const d = store.data;
  if (!q) {
    return c.json({
      categories: d.ccl.categories,
      eccns: d.ccl.eccns.map((e) => ({ id: e.id, heading: e.heading, category: e.category, group: e.group, reasons: [...new Set(e.controls.map((x) => x.reason))], reserved: e.reserved, itar: e.itar })),
    });
  }
  const direct = /^\d[A-E]\d{3}/i.test(q) ? store.eccn(q) : undefined;
  const hits = store.eccnIndex.search(q).slice(0, 40);
  const results = hits.map((h) => ({ id: h.id as string, heading: h.heading as string, category: h.category as string, score: h.score, terms: h.terms }));
  if (direct && !results.find((r) => r.id === direct.id)) results.unshift({ id: direct.id, heading: direct.heading, category: direct.category, score: 999, terms: [] });
  return c.json({ results });
});

app.get("/ccl/:id", (c) => {
  const e = store.eccn(c.req.param("id"));
  if (!e) return c.json({ error: "ECCN not found" }, 404);
  const meu = store.data.engine.ear.meuEccns.includes(e.id);
  return c.json({ ...e, meuSupp2: meu, stamp: store.data.ccl.stamp });
});

/** Destination check for one ECCN: which reasons for control apply and whether the chart marks the destination. */
app.get("/ccl/:id/check", (c) => {
  const e = store.eccn(c.req.param("id"));
  const dest = (c.req.query("dest") ?? "").toUpperCase();
  if (!e || !dest) return c.json({ error: "ECCN and destination required" }, 400);
  const evals = evaluateControls(e, c.req.query("para") ?? "", {}, dest, store.data.engine);
  return c.json({
    dest,
    groups: store.data.engine.groups[dest] ?? [],
    rows: evals.map((ev) => ({ index: ev.index, reason: ev.control.reason, scope: ev.control.scope, chart: ev.control.chart, applies: ev.applies, appliesWhy: ev.appliesWhy, licenseRequired: ev.licenseRequired, cells: ev.cells, note: ev.note, policy: ev.policy })),
  });
});

app.get("/library/search", (c) => {
  const q = c.req.query("q")?.trim() ?? "";
  const source = c.req.query("source");
  if (!q) return c.json({ results: [] });
  const perSection = new Map<string, number>();
  const hits = store.libIndex
    .search(q, { filter: (r) => !source || r.source === source })
    .filter((h) => {
      const sid = h.sectionId as string;
      const n = perSection.get(sid) ?? 0;
      perSection.set(sid, n + 1);
      return n < 2;
    })
    .slice(0, 30);
  return c.json({
    results: hits.map((h) => {
      const chunk = store.chunks.get(h.id as string)!;
      return { id: h.id, sectionId: chunk.sectionId, source: chunk.source, cite: chunk.cite, title: chunk.title, snippet: snippet(chunk.text, h.terms), score: h.score };
    }),
  });
});

app.get("/library/sections", (c) => {
  const source = c.req.query("source");
  const out = [...store.sections.values()]
    .filter((s) => !source || s.source === source)
    .map((s) => ({ id: s.id, source: s.source, part: s.part, title: s.title, cite: s.cite }));
  return c.json(out);
});

app.get("/library/section", (c) => {
  const id = c.req.query("id") ?? "";
  const s = store.sections.get(id);
  if (!s) return c.json({ error: "Section not found" }, 404);
  return c.json(s);
});

app.get("/jp/list", (c) => {
  const q = c.req.query("q")?.trim();
  const d = store.data;
  if (!q) return c.json({ appendix1: d.jpList.appendix1, stamp: d.jpList.stamp, lists: d.engine.jp, derived: d.engine.jpDerived });
  const hits = store.jpIndex.search(q).slice(0, 40);
  return c.json({ results: hits.map((h) => ({ id: h.id, label: h.label, text: h.text, kind: h.kind, score: h.score })) });
});

app.get("/hs/:code", (c) => {
  const code = c.req.param("code");
  const d = store.data.engine;
  const h = code.replace(/\D/g, "");
  return c.json({
    code: h,
    jpCatchAll: catchAllScopeFromHs(h, d),
    russia: {
      supp2: d.ear.russiaHts.supp2.some((x) => h.startsWith(x)),
      supp4: d.ear.russiaHts.supp4.some((x) => h.startsWith(x)),
      supp5: d.ear.russiaHts.supp5.some((x) => h.startsWith(x)),
      supp7: d.ear.russiaHts.supp7.some((x) => h.startsWith(x)),
    },
  });
});

app.get("/updates", (c) => c.json(readSnapshot<ChangeEntry[]>("changelog.json") ?? []));

/** Supply-chain exposure: China-origin controlled materials and Chinese-list parties across products and open cases. */
app.get("/exposure", (c) => {
  const asOf = c.req.query("asOf") ?? new Date().toISOString().slice(0, 10);
  const products = listProducts() as (import("../shared/case.ts").Item & { id: string })[];
  const cases = listCases()
    .map((x) => getCase(x.id))
    .filter((x): x is CaseT => !!x && x.status !== "rejected");
  const materials = CN_MATERIALS.map((m) => {
    const measure = CN_MEASURES.find((x) => x.id === m.measure)!;
    const st = measureState(measure, asOf);
    return {
      ...m,
      measure: { id: measure.id, title: measure.title, announcement: measure.announcement, url: measure.url, status: measure.status, legalUntil: measure.legalUntil, politicalUntil: measure.politicalUntil },
      active: st.active,
      note: st.note,
      products: products.filter((p) => p.cn?.materials?.includes(m.id)).map((p) => ({ id: p.id, name: p.name })),
      caseItems: cases.flatMap((k) => k.items.filter((i) => i.cn.materials.includes(m.id)).map((i) => ({ caseId: k.id, ref: k.ref, item: i.name, destination: k.destination }))),
    };
  });
  const origins: Record<string, number> = {};
  for (const i of [...products, ...cases.flatMap((k) => k.items)]) if (i.countryOfOrigin) origins[i.countryOfOrigin] = (origins[i.countryOfOrigin] ?? 0) + 1;
  const cnParties = cases.flatMap((k) =>
    k.parties.flatMap((p) =>
      (k.screenings[p.id]?.hits ?? [])
        .filter((h) => h.list.startsWith("CN-") && h.disposition !== "cleared")
        .map((h) => ({ caseId: k.id, ref: k.ref, party: p.name, list: h.list, matched: h.matchedName, score: h.score, disposition: h.disposition })),
    ),
  );
  const cnListCounts: Record<string, Record<string, number>> = {};
  for (const e of store.data.screening.entries.filter((x) => x.list.startsWith("CN-"))) {
    const k = e.countries[0] ?? "—";
    (cnListCounts[e.list] ??= {})[k] = (cnListCounts[e.list]?.[k] ?? 0) + 1;
  }
  return c.json({ asOf, materials, origins, cnParties, cnListCounts, productCount: products.length, caseCount: cases.length });
});

/** Cross-jurisdiction list analytics (computed in the background after each data load). */
app.get("/landscape", (c) => {
  const l = landscape(store.data, store.loadedAt);
  return l ? c.json({ status: "ready", ...l }) : c.json({ status: "computing" }, 202);
});

/** Dated regulatory events across jurisdictions, with the open cases each one touches. */
app.get("/timeline", (c) => {
  const cases = listCases()
    .map((x) => getCase(x.id))
    .filter((x): x is CaseT => !!x);
  const exp = exposure(cases);
  return c.json({
    today: new Date().toISOString().slice(0, 10),
    events: timeline().map(({ affects: _a, ...e }) => ({ ...e, exposed: exp[e.id] ?? [] })),
    measures: CN_MEASURES,
  });
});

// ---------------------------------------------------------------------------
// Screening

const ScreenBody = z.object({
  name: z.string().min(1),
  country: z.string().optional(),
  lists: z.array(z.string()).optional(),
  threshold: z.number().min(50).max(100).optional(),
  log: z.boolean().optional(),
});

function screen(body: z.infer<typeof ScreenBody>) {
  const threshold = body.threshold ?? getSettings().screeningThreshold ?? DEFAULT_THRESHOLD;
  const matches = store.data.screening.search({ name: body.name, country: body.country || undefined, lists: body.lists as never, threshold, limit: 25 });
  return { threshold, matches: matches.map((m) => ({ ...m, entry: m.entry })) };
}

app.post("/screen", async (c) => {
  const body = ScreenBody.parse(await c.req.json());
  const r = screen(body);
  if (body.log !== false) logScreening(body.name, body.country, r.matches.map((m) => ({ id: m.entry.id, list: m.entry.list, name: m.matchedName, score: m.score })), r.matches[0]?.score);
  return c.json({ ...r, stamps: store.data.screeningStamps });
});

app.post("/screen/batch", async (c) => {
  const body = z.object({ rows: z.array(z.object({ name: z.string(), country: z.string().optional() })).max(5000), threshold: z.number().optional() }).parse(await c.req.json());
  const results = body.rows.map((row) => {
    const r = screen({ name: row.name, country: row.country, threshold: body.threshold });
    return { ...row, hits: r.matches.slice(0, 5).map((m) => ({ id: m.entry.id, list: m.entry.list, name: m.matchedName, score: m.score, countries: m.entry.countries })) };
  });
  audit("screening", null, "batch", { rows: body.rows.length, withHits: results.filter((r) => r.hits.length).length });
  return c.json({ results, stamps: store.data.screeningStamps });
});

app.get("/screen/history", (c) => c.json(screeningHistory()));
app.get("/screen/entry/:id", (c) => {
  const e = store.data.screening.get(decodeURIComponent(c.req.param("id")));
  return e ? c.json(e) : c.json({ error: "Not found" }, 404);
});

// ---------------------------------------------------------------------------
// Cases

app.get("/cases", (c) => c.json(listCases()));

app.post("/cases", async (c) => {
  const input = CaseInput.parse(await c.req.json());
  const created = createCase(input);
  const a = evaluate(created);
  return c.json({ case: saveCase(created, a.overall), assessment: a }, 201);
});

function caseView(k: CaseT) {
  const d = store.data.engine;
  const assessment = evaluate(k);
  const questions = allQuestions(d)
    .filter((q) => q.relevant(k, d))
    .map((q) => ({ id: q.id, jurisdiction: q.jurisdiction, group: q.group, text: q.text, help: q.help, cite: q.cite, answer: k.answers[q.id] ?? "unknown" }));
  const fdp = Object.fromEntries(k.items.map((i) => [i.id, { gate: FDP_GATE, rules: relevantFdpRules(k, i, d).map(({ relevant: _r, ...rest }) => rest) }]));
  return { case: k, assessment, questions, fdp };
}

app.get("/cases/:id", (c) => {
  const k = getCase(c.req.param("id"));
  if (!k) return c.json({ error: "Case not found" }, 404);
  return c.json(caseView(k));
});

app.put("/cases/:id", async (c) => {
  const k = getCase(c.req.param("id"));
  if (!k) return c.json({ error: "Case not found" }, 404);
  const patch = Case.partial().parse(await c.req.json());
  const merged = Case.parse({ ...k, ...patch, id: k.id, ref: k.ref, createdAt: k.createdAt, review: k.review });
  // Party renamed / removed → drop stale screening
  for (const p of merged.parties) {
    const scr = merged.screenings[p.id];
    if (scr && scr.query !== p.name) delete merged.screenings[p.id];
  }
  for (const pid of Object.keys(merged.screenings)) if (!merged.parties.find((p) => p.id === pid)) delete merged.screenings[pid];
  const a = evaluate(merged);
  const saved = saveCase(merged, a.overall);
  audit("case", k.id, "updated", { fields: Object.keys(patch) });
  return c.json(caseView(saved));
});

app.delete("/cases/:id", (c) => {
  deleteCase(c.req.param("id"));
  return c.json({ ok: true });
});

app.post("/cases/:id/duplicate", (c) => {
  const k = getCase(c.req.param("id"));
  if (!k) return c.json({ error: "Case not found" }, 404);
  const { id: _id, ref: _ref, review: _rv, createdAt: _ca, updatedAt: _ua, ...rest } = k;
  const copy = createCase({ ...rest, title: `${k.title} (copy)`, status: "draft", screenings: {} });
  return c.json(caseView(saveCase(copy, evaluate(copy).overall)), 201);
});

/** Screen every party on the case and store hits (existing dispositions are preserved). */
app.post("/cases/:id/screen", (c) => {
  const k = getCase(c.req.param("id"));
  if (!k) return c.json({ error: "Case not found" }, 404);
  const threshold = getSettings().screeningThreshold ?? DEFAULT_THRESHOLD;
  const now = new Date().toISOString();
  const asOf = store.data.screeningStamps.map((s) => s.asOf).sort().at(-1) ?? "";
  for (const p of k.parties) {
    const prev = k.screenings[p.id];
    const matches = store.data.screening.search({ name: p.name, country: p.country || undefined, threshold, limit: 15 });
    k.screenings[p.id] = {
      partyId: p.id,
      query: p.name,
      ranAt: now,
      dataAsOf: asOf,
      threshold,
      hits: matches.map((m) => {
        const old = prev?.hits.find((h) => h.entryId === m.entry.id);
        return old ?? { entryId: m.entry.id, list: m.entry.list, name: m.entry.name, matchedName: m.matchedName, score: m.score, countries: m.entry.countries, disposition: "pending" as const };
      }),
    };
  }
  const saved = saveCase(k, evaluate(k).overall);
  audit("case", k.id, "screened", { parties: k.parties.length, hits: Object.values(k.screenings).reduce((n, s) => n + s.hits.length, 0) });
  return c.json(caseView(saved));
});

app.post("/cases/:id/disposition", async (c) => {
  const k = getCase(c.req.param("id"));
  if (!k) return c.json({ error: "Case not found" }, 404);
  const body = z.object({ partyId: z.string(), entryId: z.string(), disposition: Disposition, note: z.string().optional() }).parse(await c.req.json());
  const hit = k.screenings[body.partyId]?.hits.find((h) => h.entryId === body.entryId);
  if (!hit) return c.json({ error: "Hit not found" }, 404);
  Object.assign(hit, { disposition: body.disposition, note: body.note, by: getSettings().userName, at: new Date().toISOString() });
  const saved = saveCase(k, evaluate(k).overall);
  audit("case", k.id, `hit.${body.disposition}`, { party: body.partyId, entry: body.entryId, name: hit.matchedName, note: body.note });
  return c.json(caseView(saved));
});

app.post("/cases/:id/review", async (c) => {
  const k = getCase(c.req.param("id"));
  if (!k) return c.json({ error: "Case not found" }, 404);
  const body = z.object({ action: z.enum(["submitted", "approved", "rejected", "on_hold", "reopened", "comment"]), note: z.string().optional() }).parse(await c.req.json());
  const a = evaluate(k);
  if (body.action === "approved" && (a.overall === "incomplete" || a.overall === "prohibited"))
    return c.json({ error: `Cannot approve while the assessment is ${a.overall.replace("_", " ")}` }, 409);
  const status = { submitted: "in_review", approved: "approved", rejected: "rejected", on_hold: "on_hold", reopened: "draft", comment: k.status }[body.action] as CaseT["status"];
  k.review.push({ at: new Date().toISOString(), by: getSettings().userName, action: body.action, note: body.note, outcome: a.overall, dataVersions: a.dataVersions });
  k.status = status;
  const saved = saveCase(k, a.overall);
  audit("case", k.id, `review.${body.action}`, { note: body.note, outcome: a.overall });
  return c.json(caseView(saved));
});

app.get("/cases/:id/audit", (c) => c.json(auditLog({ entity: "case", entityId: c.req.param("id") })));

// ---------------------------------------------------------------------------
// Product master

app.get("/products", (c) => c.json(listProducts()));
app.post("/products", async (c) => {
  const body = Item.omit({ id: true }).extend({ id: z.string().optional() }).parse(await c.req.json());
  return c.json(upsertProduct({ ...body, name: body.name }));
});
app.delete("/products/:id", (c) => {
  deleteProduct(c.req.param("id"));
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Settings, audit, sync

app.get("/settings", (c) => c.json(publicSettings()));
app.put("/settings", async (c) => {
  const body = z
    .object({
      userName: z.string().optional(),
      company: z.string().optional(),
      fxPerUsd: z.record(z.string(), z.number().positive()).optional(),
      fxAsOf: z.string().optional(),
      bulkLicenses: z.array(z.string()).optional(),
      screeningThreshold: z.number().min(60).max(100).optional(),
      aiModel: z.string().optional(),
      anthropicApiKey: z.string().optional(),
    })
    .parse(await c.req.json());
  updateSettings(body);
  audit("settings", null, "updated", { fields: Object.keys(body).map((k) => (k === "anthropicApiKey" ? "anthropicApiKey(redacted)" : k)) });
  return c.json(publicSettings());
});

app.get("/audit", (c) => c.json(auditLog({ limit: Number(c.req.query("limit") ?? 300) })));

let syncing = false;
app.post("/sync", (c) =>
  streamSSE(c, async (stream) => {
    if (syncing) {
      await stream.writeSSE({ event: "error", data: JSON.stringify({ message: "A sync is already running" }) });
      return;
    }
    syncing = true;
    try {
      const targets = (c.req.query("targets")?.split(",").filter(Boolean) ?? ["ear", "jp", "screening"]) as ("ear" | "jp" | "screening")[];
      const { changes } = await runSync(targets, (p: SyncProgress) => void stream.writeSSE({ event: "progress", data: JSON.stringify(p) }));
      store.load();
      audit("data", null, "synced", { targets, changes: changes.length });
      await stream.writeSSE({ event: "done", data: JSON.stringify({ changes }) });
    } catch (e) {
      await stream.writeSSE({ event: "error", data: JSON.stringify({ message: (e as Error).message }) });
    } finally {
      syncing = false;
    }
  }),
);

app.post("/demo", (c) => {
  const ids = seedSamples();
  audit("data", null, "sample-cases", { count: ids.length });
  return c.json({ ids });
});

app.route("/ai", aiRoutes);

// ---------------------------------------------------------------------------

export function snippet(text: string, terms: string[], len = 280): string {
  const lower = text.toLowerCase();
  let at = -1;
  for (const t of terms) {
    const i = lower.indexOf(t.toLowerCase());
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  const start = Math.max(0, at - 80);
  const s = text.slice(start, start + len).replace(/\s+/g, " ");
  return (start > 0 ? "… " : "") + s + (start + len < text.length ? " …" : "");
}

export { newId, Party };
