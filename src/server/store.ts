// Regulatory data held in memory, with full-text indexes for the CCL, the regulation
// library (EAR + Japanese law) and the Japanese control list. Reloaded after every sync.
import MiniSearch from "minisearch";
import { loadData, type LoadedData } from "../data/load.ts";
import type { Eccn, RegSection } from "../shared/regs.ts";

const CJK = /[぀-ヿ㐀-䶿一-鿿]/;

/** Latin words + CJK character bigrams, so Japanese law text is searchable without a morphological analyzer. */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const m of text.normalize("NFKC").toLowerCase().matchAll(/[぀-ヿ㐀-䶿一-鿿]+|[a-z0-9][a-z0-9.\-']*/g)) {
    const t = m[0];
    if (CJK.test(t)) {
      if (t.length === 1) out.push(t);
      for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
    } else {
      out.push(t.replace(/[.\-']+$/, ""));
      // also index ECCN-ish tokens without dots ("3a001.b.2" → "3a001")
      const eccn = t.match(/^\d[a-e]\d{3}/);
      if (eccn && eccn[0] !== t) out.push(eccn[0]);
    }
  }
  return out.filter(Boolean);
}

const STOP = new Set(["the", "of", "and", "or", "a", "an", "to", "in", "for", "by", "as", "with", "on", "that", "is", "are", "be", "any", "this", "not", "see", "ear", "controlled", "items"]);
const processTerm = (t: string) => (STOP.has(t) ? null : t);

export interface LibraryChunk {
  id: string; // `${sectionId}#${i}`
  sectionId: string;
  source: "ear" | "jp";
  cite: string;
  title: string;
  text: string;
}

class Store {
  data!: LoadedData;
  eccnIndex!: MiniSearch<{ id: string; heading: string; body: string; category: string }>;
  libIndex!: MiniSearch<LibraryChunk>;
  jpIndex!: MiniSearch<{ id: string; label: string; text: string; kind: string }>;
  sections = new Map<string, RegSection>();
  chunks = new Map<string, LibraryChunk>();
  loadedAt = "";

  load() {
    const data = loadData();
    const eccnIndex = new MiniSearch<{ id: string; heading: string; body: string; category: string }>({
      fields: ["id", "heading", "body"],
      storeFields: ["id", "heading", "category"],
      tokenize,
      processTerm,
      searchOptions: { boost: { id: 8, heading: 3 }, fuzzy: 0.15, prefix: true, combineWith: "OR" },
    });
    eccnIndex.addAll(
      data.ccl.eccns.map((e) => ({
        id: e.id,
        heading: e.heading,
        body: [e.relatedControls ?? "", ...e.paragraphs.map((p) => p.text), ...e.blocks.filter((b) => b.kind === "note").map((b) => (b.kind === "note" ? b.text : ""))].join(" \n"),
        category: e.category,
      })),
    );

    const sections = new Map<string, RegSection>();
    const chunks = new Map<string, LibraryChunk>();
    for (const s of [...data.earLibrary.sections, ...data.jpLibrary.sections]) {
      sections.set(s.id, s);
      let buf: string[] = [];
      let n = 0;
      const flush = () => {
        if (!buf.length) return;
        const id = `${s.id}#${n++}`;
        chunks.set(id, { id, sectionId: s.id, source: s.source, cite: s.cite, title: s.title, text: buf.join("\n") });
        buf = [];
      };
      for (const p of s.paragraphs) {
        const line = p.label && !p.text.startsWith(p.label) ? `${p.label} ${p.text}` : p.text;
        if (buf.join("\n").length + line.length > 1800) flush();
        buf.push(line);
      }
      flush();
    }
    const libIndex = new MiniSearch<LibraryChunk>({
      fields: ["title", "cite", "text"],
      storeFields: ["sectionId", "source", "cite", "title"],
      tokenize,
      processTerm,
      searchOptions: { boost: { title: 2, cite: 3 }, fuzzy: 0.1, prefix: true, combineWith: "OR" },
    });
    libIndex.addAll([...chunks.values()]);

    const jpIndex = new MiniSearch<{ id: string; label: string; text: string; kind: string }>({
      fields: ["label", "text"],
      storeFields: ["label", "text", "kind"],
      tokenize,
      processTerm,
      searchOptions: { boost: { label: 2 }, prefix: true, combineWith: "OR" },
    });
    jpIndex.addAll([
      ...data.jpList.appendix1.map((r, i) => ({ id: `a1:${i}`, label: r.label, text: r.text, kind: "appendix1" })),
      ...data.jpList.ministerialArticles.flatMap((a, i) =>
        a.text.split("\n").map((line, j) => ({ id: `ka:${i}:${j}`, label: `貨物等省令 ${a.title}${a.kou ? `（${a.kou}の項）` : a.techKou ? `（外為令別表 ${a.techKou}の項）` : ""}`, text: line, kind: "ministerial" })),
      ),
    ]);

    Object.assign(this, { data, eccnIndex, libIndex, jpIndex, sections, chunks, loadedAt: new Date().toISOString() });
    return this;
  }

  eccn(id: string): Eccn | undefined {
    return this.data.engine.ccl.get(id.toUpperCase().slice(0, 5));
  }
}

export const store = new Store();
