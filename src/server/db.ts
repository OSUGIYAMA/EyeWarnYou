// Local SQLite store for cases, the product master, screening history, settings and the audit log.
// Everything stays on the machine running Kanmon.
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { customAlphabet } from "nanoid";
import { Case, type Case as CaseT } from "../shared/case.ts";

const VAR_DIR = process.env.KANMON_DATA_DIR ?? path.resolve(import.meta.dirname, "../../var");
fs.mkdirSync(VAR_DIR, { recursive: true });

export const db = new Database(process.env.KANMON_DB ?? path.join(VAR_DIR, "kanmon.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  ref TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  destination TEXT,
  outcome TEXT,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS screenings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor TEXT,
  query TEXT NOT NULL,
  country TEXT,
  hit_count INTEGER NOT NULL,
  top_score REAL,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor TEXT,
  entity TEXT NOT NULL,
  entity_id TEXT,
  action TEXT NOT NULL,
  detail TEXT
);
CREATE INDEX IF NOT EXISTS audit_entity ON audit(entity, entity_id);
CREATE INDEX IF NOT EXISTS cases_updated ON cases(updated_at);
`);

export const newId = customAlphabet("0123456789abcdefghijkmnpqrstuvwxyz", 12);

// ---------------------------------------------------------------------------
// Settings

export interface Settings {
  userName: string;
  company: string;
  fxPerUsd: Record<string, number>;
  fxAsOf: string;
  bulkLicenses: string[];
  screeningThreshold: number;
  aiModel: string;
  anthropicApiKey?: string; // never returned to the client
}

const DEFAULT_SETTINGS: Settings = {
  userName: "",
  company: "",
  fxPerUsd: { USD: 1, JPY: 150, EUR: 0.92, CNY: 7.2, GBP: 0.79, KRW: 1380, TWD: 32 },
  fxAsOf: "",
  bulkLicenses: [],
  screeningThreshold: 85,
  aiModel: "claude-opus-5",
};

export function getSettings(): Settings {
  const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  const s: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) s[r.key] = JSON.parse(r.value);
  if (!s.anthropicApiKey && process.env.ANTHROPIC_API_KEY) s.anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  return s as unknown as Settings;
}

export function updateSettings(patch: Partial<Settings>) {
  const stmt = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  const tx = db.transaction((p: Partial<Settings>) => {
    for (const [k, v] of Object.entries(p)) {
      if (v === undefined) continue;
      if (k === "anthropicApiKey" && v === "") {
        db.prepare("DELETE FROM settings WHERE key = ?").run(k);
        continue;
      }
      stmt.run(k, JSON.stringify(v));
    }
  });
  tx(patch);
}

export function publicSettings() {
  const { anthropicApiKey, ...rest } = getSettings();
  return { ...rest, aiConfigured: !!anthropicApiKey, aiKeySource: process.env.ANTHROPIC_API_KEY && !db.prepare("SELECT 1 FROM settings WHERE key='anthropicApiKey'").get() ? "env" : anthropicApiKey ? "settings" : null };
}

// ---------------------------------------------------------------------------
// Audit

export function audit(entity: string, entityId: string | null, action: string, detail?: unknown) {
  db.prepare("INSERT INTO audit (at, actor, entity, entity_id, action, detail) VALUES (?, ?, ?, ?, ?, ?)").run(
    new Date().toISOString(),
    getSettings().userName || null,
    entity,
    entityId,
    action,
    detail === undefined ? null : JSON.stringify(detail),
  );
}

export function auditLog(opts: { entity?: string; entityId?: string; limit?: number } = {}) {
  const where: string[] = [];
  const args: unknown[] = [];
  if (opts.entity) (where.push("entity = ?"), args.push(opts.entity));
  if (opts.entityId) (where.push("entity_id = ?"), args.push(opts.entityId));
  const rows = db
    .prepare(`SELECT * FROM audit ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY id DESC LIMIT ?`)
    .all(...args, opts.limit ?? 200) as { id: number; at: string; actor: string | null; entity: string; entity_id: string | null; action: string; detail: string | null }[];
  return rows.map((r) => ({ ...r, detail: r.detail ? JSON.parse(r.detail) : null }));
}

// ---------------------------------------------------------------------------
// Cases

function nextRef(): string {
  const year = new Date().getFullYear();
  const row = db.prepare("SELECT ref FROM cases WHERE ref LIKE ? ORDER BY ref DESC LIMIT 1").get(`KM-${year}-%`) as { ref: string } | undefined;
  const n = row ? Number(row.ref.split("-")[2]) + 1 : 1;
  return `KM-${year}-${String(n).padStart(4, "0")}`;
}

export function listCases() {
  return db
    .prepare("SELECT id, ref, title, status, destination, outcome, created_at, updated_at, data FROM cases ORDER BY updated_at DESC")
    .all()
    .map((r) => {
      const row = r as { data: string } & Record<string, string>;
      const c = JSON.parse(row.data) as CaseT;
      return {
        id: row.id,
        ref: row.ref,
        title: row.title,
        status: row.status,
        destination: row.destination,
        outcome: row.outcome,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        itemCount: c.items.length,
        partyCount: c.parties.length,
        createdBy: c.createdBy,
      };
    });
}

export function getCase(id: string): CaseT | null {
  const row = db.prepare("SELECT data FROM cases WHERE id = ?").get(id) as { data: string } | undefined;
  return row ? Case.parse(JSON.parse(row.data)) : null;
}

export function createCase(input: Partial<CaseT> & { title: string }): CaseT {
  const now = new Date().toISOString();
  const c = Case.parse({ ...input, id: newId(), ref: nextRef(), createdAt: now, updatedAt: now, createdBy: getSettings().userName, review: [{ at: now, by: getSettings().userName, action: "created" }] });
  db.prepare("INSERT INTO cases (id, ref, title, status, destination, outcome, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
    c.id, c.ref, c.title, c.status, c.destination, null, JSON.stringify(c), now, now,
  );
  audit("case", c.id, "created", { ref: c.ref, title: c.title });
  return c;
}

export function saveCase(c: CaseT, outcome?: string): CaseT {
  const next = Case.parse({ ...c, updatedAt: new Date().toISOString() });
  db.prepare("UPDATE cases SET title = ?, status = ?, destination = ?, outcome = COALESCE(?, outcome), data = ?, updated_at = ? WHERE id = ?").run(
    next.title, next.status, next.destination, outcome ?? null, JSON.stringify(next), next.updatedAt, next.id,
  );
  return next;
}

export function deleteCase(id: string) {
  db.prepare("DELETE FROM cases WHERE id = ?").run(id);
  audit("case", id, "deleted");
}

// ---------------------------------------------------------------------------
// Product master (classified items for reuse)

export function listProducts() {
  return db.prepare("SELECT id, data, updated_at FROM products ORDER BY updated_at DESC").all().map((r) => {
    const row = r as { id: string; data: string; updated_at: string };
    return { id: row.id, updatedAt: row.updated_at, ...JSON.parse(row.data) };
  });
}

export function upsertProduct(p: { id?: string; name: string } & Record<string, unknown>) {
  const id = p.id ?? newId();
  const now = new Date().toISOString();
  db.prepare("INSERT INTO products (id, name, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, data = excluded.data, updated_at = excluded.updated_at").run(
    id, p.name, JSON.stringify({ ...p, id }), now,
  );
  audit("product", id, p.id ? "updated" : "created", { name: p.name });
  return { ...p, id, updatedAt: now };
}

export function deleteProduct(id: string) {
  db.prepare("DELETE FROM products WHERE id = ?").run(id);
  audit("product", id, "deleted");
}

// ---------------------------------------------------------------------------
// Standalone screening history

export function logScreening(query: string, country: string | undefined, results: unknown[], topScore: number | undefined) {
  db.prepare("INSERT INTO screenings (at, actor, query, country, hit_count, top_score, data) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    new Date().toISOString(), getSettings().userName || null, query, country ?? null, results.length, topScore ?? null, JSON.stringify(results),
  );
}

export function screeningHistory(limit = 100) {
  return db.prepare("SELECT id, at, actor, query, country, hit_count, top_score FROM screenings ORDER BY id DESC LIMIT ?").all(limit);
}
