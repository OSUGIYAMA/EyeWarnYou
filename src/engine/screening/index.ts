// Restricted-party screening index.
//
// Scoring is an IDF-weighted, fuzzy token alignment (F1 of weighted recall/precision),
// so that rare, distinctive tokens ("Huawei", "Rostec") dominate and generic ones
// ("technology", "china") barely move the score. Country agreement nudges the score.
import type { ScreeningEntry, ScreeningListId } from "../../shared/regs.ts";
import { normalizeName, trigrams, hasCjk, tokenSimilarity } from "./normalize.ts";

interface NameRecord {
  entry: number;
  display: string;
  tokens: string[];
  key: string;
  cjk: boolean;
}

export interface ScreeningQuery {
  name: string;
  country?: string;
  lists?: ScreeningListId[];
  threshold?: number; // 0–100
  limit?: number;
}

export interface ScreeningMatch {
  entry: ScreeningEntry;
  matchedName: string;
  score: number; // final, after country adjustment
  nameScore: number; // before country adjustment
  countryMatch: "match" | "mismatch" | "unknown";
  matchedTokens: string[];
}

const COMMON_DF = 1500;
export const DEFAULT_THRESHOLD = 85;

export class ScreeningIndex {
  readonly entries: ScreeningEntry[];
  private names: NameRecord[] = [];
  private postings = new Map<string, number[]>();
  private df = new Map<string, number>();
  private gramIndex = new Map<string, string[]>();
  private byId = new Map<string, ScreeningEntry>();

  constructor(entries: ScreeningEntry[]) {
    this.entries = entries;
    entries.forEach((e, i) => {
      this.byId.set(e.id, e);
      const seen = new Set<string>();
      for (const display of [e.name, ...e.altNames]) {
        const n = normalizeName(display);
        if (!n.tokens.length || seen.has(n.key)) continue;
        seen.add(n.key);
        const rec: NameRecord = { entry: i, display, tokens: n.tokens, key: n.key, cjk: hasCjk(display) };
        const id = this.names.push(rec) - 1;
        for (const t of new Set(n.tokens)) {
          let p = this.postings.get(t);
          if (!p) this.postings.set(t, (p = []));
          p.push(id);
        }
      }
    });
    for (const [t, p] of this.postings) {
      this.df.set(t, p.length);
      if (t.length >= 4 && !hasCjk(t)) {
        for (const g of trigrams(t)) {
          let arr = this.gramIndex.get(g);
          if (!arr) this.gramIndex.set(g, (arr = []));
          arr.push(t);
        }
      }
    }
  }

  get(id: string): ScreeningEntry | undefined {
    return this.byId.get(id);
  }

  private idf(t: string): number {
    const n = this.names.length;
    return Math.log((n + 1) / ((this.df.get(t) ?? 0) + 1)) + 1;
  }

  /** Vocabulary tokens similar to `q` (for fuzzy candidate generation). */
  private similarTokens(q: string): { token: string; sim: number }[] {
    if (q.length < 5 || hasCjk(q)) return [];
    const grams = trigrams(q);
    const counts = new Map<string, number>();
    for (const g of grams) for (const t of this.gramIndex.get(g) ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
    const out: { token: string; sim: number }[] = [];
    for (const [t, c] of counts) {
      if (t === q || c < grams.length * 0.45) continue;
      const sim = tokenSimilarity(q, t);
      if (sim > 0) out.push({ token: t, sim });
    }
    return out.sort((a, b) => b.sim - a.sim).slice(0, 12);
  }

  search(query: ScreeningQuery): ScreeningMatch[] {
    const threshold = query.threshold ?? DEFAULT_THRESHOLD;
    const q = normalizeName(query.name);
    if (!q.tokens.length) return [];
    const lists = query.lists ? new Set(query.lists) : null;

    // Candidate generation from exact + fuzzy postings; skip very common tokens unless nothing else.
    const expansions = q.tokens.map((t) => [{ token: t, sim: 1 }, ...this.similarTokens(t)]);
    const candidates = new Set<number>();
    const collect = (allowCommon: boolean) => {
      for (const exp of expansions)
        for (const { token } of exp) {
          const p = this.postings.get(token);
          if (!p) continue;
          if (!allowCommon && p.length > COMMON_DF) continue;
          for (const id of p) candidates.add(id);
        }
    };
    collect(false);
    if (!candidates.size) collect(true);

    const best = new Map<number, ScreeningMatch>();
    for (const id of candidates) {
      const rec = this.names[id];
      const entry = this.entries[rec.entry];
      if (lists && !lists.has(entry.list)) continue;
      const { score, matched } = this.scoreName(q.tokens, q.key, rec);
      if (score <= 0) continue;
      let final = score;
      let countryMatch: ScreeningMatch["countryMatch"] = "unknown";
      if (query.country && entry.countries.length) {
        if (entry.countries.includes(query.country)) {
          countryMatch = "match";
          final = Math.min(100, final + 3);
        } else {
          countryMatch = "mismatch";
          final = final - 7;
        }
      }
      if (final < threshold) continue;
      const prev = best.get(rec.entry);
      if (!prev || prev.score < final)
        best.set(rec.entry, { entry, matchedName: rec.display, score: round(final), nameScore: round(score), countryMatch, matchedTokens: matched });
    }
    return [...best.values()].sort((a, b) => b.score - a.score).slice(0, query.limit ?? 25);
  }

  private scoreName(qTokens: string[], qKey: string, rec: NameRecord): { score: number; matched: string[] } {
    if (qKey === rec.key) return { score: 100, matched: [...qTokens] };
    const sim = (a: string, b: string) => (rec.cjk ? (a === b ? 1 : 0) : tokenSimilarity(a, b));
    let rNum = 0;
    let rDen = 0;
    const matched: string[] = [];
    for (const qt of qTokens) {
      const w = this.idf(qt);
      let bestSim = 0;
      for (const rt of rec.tokens) bestSim = Math.max(bestSim, sim(qt, rt));
      rNum += w * bestSim;
      rDen += w;
      if (bestSim > 0) matched.push(qt);
    }
    let pNum = 0;
    let pDen = 0;
    for (const rt of rec.tokens) {
      const w = this.idf(rt);
      let bestSim = 0;
      for (const qt of qTokens) bestSim = Math.max(bestSim, sim(qt, rt));
      pNum += w * bestSim;
      pDen += w;
    }
    const recall = rDen ? rNum / rDen : 0;
    const precision = pDen ? pNum / pDen : 0;
    if (!recall || !precision) return { score: 0, matched };
    // Recall matters more (missing a listed party is worse than a false positive).
    const beta2 = 2; // F-beta with beta = sqrt(2)
    const f = ((1 + beta2) * precision * recall) / (beta2 * precision + recall);
    return { score: f * 100, matched };
  }
}

const round = (n: number) => Math.round(n * 10) / 10;
