// Parsers for eCFR Title 15 XML (Export Administration Regulations).
// Source: https://www.ecfr.gov/api/versioner/v1/full/{date}/title-15.xml?part={part}
import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";
import {
  CHART_COLUMNS,
  COUNTRY_GROUP_IDS,
  type Ccl,
  type CclBlock,
  type ChartColumn,
  type CountryChart,
  type CountryGroupId,
  type CountryGroups,
  type Eccn,
  type EccnControl,
  type EccnLicenseException,
  type RegSection,
  type SourceStamp,
} from "../shared/regs.ts";
import { resolveEarCountry } from "./countries.ts";

const UA = "Kanmon export-control workbench (+https://github.com/OSUGIYAMA/export-control-ai-assistant)";

export async function ecfrLatestDate(): Promise<string> {
  const res = await fetch("https://www.ecfr.gov/api/versioner/v1/titles.json", {
    headers: { "user-agent": UA, "accept-encoding": "gzip" },
  });
  if (!res.ok) throw new Error(`eCFR titles.json ${res.status}`);
  const data = (await res.json()) as { titles: { number: number; latest_issue_date: string }[] };
  const t15 = data.titles.find((t) => t.number === 15);
  if (!t15) throw new Error("eCFR: title 15 not found");
  return t15.latest_issue_date;
}

export async function fetchEcfrPart(part: string, date: string): Promise<string> {
  const url = `https://www.ecfr.gov/api/versioner/v1/full/${date}/title-15.xml?part=${part}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { "user-agent": UA, "accept-encoding": "gzip" } });
    if (res.ok) return res.text();
    if (attempt === 2) throw new Error(`eCFR part ${part}: HTTP ${res.status}`);
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  throw new Error("unreachable");
}

export function ecfrPartUrl(part: string): string {
  return `https://www.ecfr.gov/current/title-15/subtitle-B/chapter-VII/subchapter-C/part-${part}`;
}

// ---------------------------------------------------------------------------
// text helpers

export function clean(s: string): string {
  return s
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:)])/g, "$1")
    .replace(/\(\s+/g, "(")
    .trim();
}

function textOf($: cheerio.CheerioAPI, el: AnyNode): string {
  const $el = $(el).clone();
  $el.find("br").replaceWith(" ");
  // superscript footnote markers become " [n]" only where meaningful; callers decide
  return clean($el.text());
}

function load(xml: string) {
  return cheerio.load(xml, { xml: { xmlMode: true, decodeEntities: true } });
}

function supplement($: cheerio.CheerioAPI, headStartsWith: string) {
  const div = $("DIV9")
    .filter((_, el) => clean($(el).children("HEAD").first().text()).startsWith(headStartsWith))
    .first();
  if (!div.length) throw new Error(`eCFR: supplement not found: ${headStartsWith}`);
  return div;
}

// ---------------------------------------------------------------------------
// Country Chart — Supplement No. 1 to Part 738

export function parseCountryChart(xml: string, stamp: SourceStamp): CountryChart {
  const $ = load(xml);
  const supp = supplement($, "Supplement No. 1 to Part 738");
  const table = supp.find("TABLE").first();
  const headerCells = table
    .find("THEAD TR")
    .last()
    .find("TH")
    .map((_, th) => clean($(th).text()).replace(/\s+/g, ""))
    .get();
  const columns = headerCells as ChartColumn[];
  for (const c of columns) if (!CHART_COLUMNS.includes(c)) throw new Error(`Country Chart: unknown column ${c}`);

  const rows: CountryChart["rows"] = [];
  const unresolved: string[] = [];
  table.find("TBODY TR").each((_, tr) => {
    const tds = $(tr).children("TD");
    const first = tds.first();
    const footnotes = first
      .find("sup, SU")
      .map((_, s) => Number(clean($(s).text())))
      .get()
      .filter((n) => Number.isFinite(n));
    const nameEl = first.clone();
    nameEl.find("sup, SU").remove();
    const earName = clean(nameEl.text());
    if (!earName) return;
    const iso2 = resolveEarCountry(earName);
    if (!iso2) {
      unresolved.push(earName);
      return;
    }
    const x: ChartColumn[] = [];
    tds.slice(1).each((i, td) => {
      if (/X/i.test(clean($(td).text()))) x.push(columns[i]);
    });
    rows.push({ iso2, earName, footnotes, x });
  });
  if (unresolved.length) throw new Error(`Country Chart: unresolved country names: ${unresolved.join(", ")}`);

  const footnotes: Record<string, string> = {};
  table.find("TFOOT TD").each((_, td) => {
    const n = clean($(td).find("sup, SU").first().text());
    const body = $(td).clone();
    body.find("sup, SU").first().remove();
    if (n) footnotes[n] = clean(body.text());
  });
  if (rows.length < 150) throw new Error(`Country Chart: only ${rows.length} rows parsed`);
  return { stamp, rows, footnotes };
}

// ---------------------------------------------------------------------------
// Country Groups — Supplement No. 1 to Part 740

export function parseCountryGroups(xml: string, stamp: SourceStamp): CountryGroups {
  const $ = load(xml);
  const supp = supplement($, "Supplement No. 1 to Part 740");
  const membership: Record<string, Set<CountryGroupId>> = {};
  const add = (iso2: string, g: CountryGroupId) => (membership[iso2] ??= new Set()).add(g);
  const unresolved: string[] = [];
  const labels = {} as Record<CountryGroupId, string>;

  supp.find("TABLE").each((_, table) => {
    const heads = $(table)
      .find("THEAD TH")
      .map((_, th) => {
        const t = $(th).clone();
        t.find("sup, SU").remove();
        return textOf($, t[0]);
      })
      .get();
    const groupIds: (CountryGroupId | null)[] = heads.slice(1).map((h) => {
      const m = h.match(/\[([A-E]):\s*(\d)\]/);
      if (!m) return null;
      const id = `${m[1]}:${m[2]}` as CountryGroupId;
      labels[id] = clean(h.replace(/\[[^\]]+\]/, "")) || id;
      return id;
    });
    $(table)
      .find("TBODY TR")
      .each((_, tr) => {
        const tds = $(tr).children("TD");
        const nameEl = tds.first().clone();
        nameEl.find("sup, SU").remove();
        const name = clean(nameEl.text());
        if (!name) return;
        const iso2 = resolveEarCountry(name);
        if (!iso2) return void unresolved.push(name);
        tds.slice(1).each((i, td) => {
          const g = groupIds[i];
          if (g && /X/i.test(clean($(td).text()))) add(iso2, g);
        });
      });
  });

  // Country Group B is a list (<HD1>Country Group B—Countries</HD1><SCOL2><LI>…) in eCFR.
  const bHead = supp
    .children("HD1")
    .filter((_, el) => /^Country Group B\s*[—-]\s*Countries/.test(textOf($, el)))
    .first();
  if (!bHead.length) throw new Error("Country Groups: Group B heading not found");
  bHead
    .nextUntil("HD1")
    .find("LI")
    .addBack("LI")
    .each((_, li) => {
      const name = textOf($, li);
      const iso2 = resolveEarCountry(name);
      if (!iso2) return void unresolved.push(name);
      add(iso2, "B");
    });
  labels["B"] = "Country Group B";
  if (unresolved.length) throw new Error(`Country Groups: unresolved names: ${[...new Set(unresolved)].join(", ")}`);
  const bCount = Object.values(membership).filter((s) => s.has("B")).length;
  if (bCount < 120) throw new Error(`Country Groups: Group B parsed only ${bCount} countries`);

  const notes = supp
    .find("TFOOT TD")
    .map((_, td) => textOf($, td))
    .get();
  const out: Record<string, CountryGroupId[]> = {};
  for (const [iso2, set] of Object.entries(membership)) {
    out[iso2] = COUNTRY_GROUP_IDS.filter((g) => set.has(g));
  }
  return { stamp, labels, membership: out, notes };
}

// ---------------------------------------------------------------------------
// Commerce Control List — Supplement No. 1 to Part 774

const ECCN_RE = /^(\d[A-E]\d{3})\b\s*(.*)$/s;
const PARA_RE = /^([a-z]{1,2}(?:\.(?:\d{1,2}|[a-z]{1,2}))*)\.\s+(.*)$/s;

export function parseCcl(xml: string, stamp: SourceStamp): Ccl {
  const $ = load(xml);
  const supp = supplement($, "Supplement No. 1 to Part 774");
  const eccns: Eccn[] = [];
  const categories: Ccl["categories"] = [];
  let category = "";
  let categoryTitle = "";
  let group = "";
  let groupTitle = "";
  let cur: Eccn | null = null;
  let section: "head" | "lr" | "le" | "sta" | "items" = "head";

  const finish = () => {
    if (cur) eccns.push(cur);
    cur = null;
  };

  for (const el of supp.children().toArray()) {
    const tag = (el as Element).tagName;
    if (tag === "HEAD" || tag === "CITA") continue;
    const text = textOf($, el);

    if (tag === "HD1" || tag === "HD2" || tag === "HD3") {
      const cat = text.match(/^Category (\d)\s*[—-]\s*(.*)$/);
      if (cat) {
        finish();
        category = cat[1];
        categoryTitle = cat[2];
        if (!categories.find((c) => c.id === category)) categories.push({ id: category, title: categoryTitle });
        continue;
      }
      const grp = text.match(/^([A-E])\.\s+(.*)$/);
      if (grp && !cur?.paragraphs.length) {
        finish();
        group = grp[1];
        groupTitle = grp[2];
        continue;
      }
      if (grp) {
        finish();
        group = grp[1];
        groupTitle = grp[2];
        continue;
      }
      if (cur) {
        if (/^List Based License Exceptions/i.test(text)) section = "le";
        else if (/^List of Items Controlled/i.test(text)) section = "items";
        else if (/^Special Conditions for STA/i.test(text)) section = "sta";
        cur.blocks.push({ kind: "heading", text });
      }
      continue;
    }

    // ECCN heading: <FP-2><B>3A090 ...</B> (occasionally FP-1)
    if ((tag === "FP-2" || tag === "FP-1") && $(el).children().first().is("B")) {
      const m = text.match(ECCN_RE);
      if (m && m[1][0] === category && m[1][1] === group) {
        finish();
        const heading = clean(m[2]).replace(/\.$/, "");
        cur = {
          id: m[1],
          category,
          categoryTitle,
          group,
          groupTitle,
          heading,
          reserved: /^\[Reserved\]/i.test(heading),
          reasonForControl: [],
          controls: [],
          licenseExceptions: [],
          paragraphs: [],
          blocks: [],
          series600: /^\d[A-E]6\d\d$/.test(m[1]),
          series515: /^\d[A-E]515$/.test(m[1]),
          itar: /subject to the ITAR/i.test(heading) && !/\(see List of Items Controlled\)/i.test(heading),
        };
        section = "head";
        continue;
      }
    }

    if (!cur) continue;
    const c: Eccn = cur;

    // Section markers appear as HD1, or as FP-1 wrapping <E T="04|05">.
    if (/^License Requirements$/i.test(text)) {
      section = "lr";
      c.blocks.push({ kind: "heading", text: "License Requirements" });
      continue;
    }
    if (/^List Based License Exceptions/i.test(text)) {
      section = "le";
      c.blocks.push({ kind: "heading", text: "List Based License Exceptions" });
      continue;
    }
    if (/^List of Items Controlled$/i.test(text)) {
      section = "items";
      c.blocks.push({ kind: "heading", text: "List of Items Controlled" });
      continue;
    }
    if (/^Special Conditions for STA$/i.test(text)) {
      section = "sta";
      c.blocks.push({ kind: "heading", text });
      continue;
    }

    // Table (License Requirements controls, or tables inside items)
    if (tag === "DIV" || tag === "GPOTABLE") {
      const rows = $(el)
        .find("TR")
        .toArray()
        .map((tr) =>
          $(tr)
            .children("TD, TH")
            .toArray()
            .map((td) => textOf($, td)),
        )
        .filter((r) => r.some(Boolean));
      if ((section === "lr" || section === "head") && !c.controls.length && rows.length && /^Control/i.test(rows[0][0] ?? "")) {
        for (const r of rows.slice(1)) if (r[0]) c.controls.push(parseControlRow(r[0], r[1] ?? "", c.id));
      }
      c.blocks.push({ kind: "table", rows });
      continue;
    }

    if (tag === "NOTE") {
      const title = clean($(el).children("HED").first().text()) || undefined;
      const body = $(el)
        .children()
        .not("HED")
        .toArray()
        .map((p) => textOf($, p))
        .filter(Boolean)
        .join("\n");
      c.blocks.push({ kind: "note", title, text: body });
      continue;
    }

    // Text-form controls: "Control(s): SL and AT apply to entire entry. A license is required for all destinations…"
    const textControls = text.match(/^Control\(s\):?\s*(.*)$/s);
    if (textControls && !c.controls.length) {
      const body = textControls[1];
      const codes = (body.match(/^((?:[A-Z]{2,3})(?:\s*(?:,|and)\s*[A-Z]{2,3})*)\s+appl/) ?? [])[1]?.split(/\s*(?:,|and)\s*/) ?? [];
      const firstSentence = body.split(/(?<=\.)\s/)[0] ?? body;
      for (const code of codes.length ? codes : ["?"]) {
        const ctl = parseControlRow(`${code} ${firstSentence.replace(/^[A-Z ,and]+?(appl(?:y|ies))/, "$1")}`, body, c.id);
        c.controls.push({ ...ctl, special: true });
      }
      c.blocks.push({ kind: "field", label: "Control(s)", text: body });
      section = "lr";
      continue;
    }

    // Field: <FP-1><I>Label:</I> value
    const firstI = $(el).children("I, E").first();
    const labelText = firstI.length ? clean(firstI.text()) : "";
    const startsWithLabel = labelText && text.startsWith(labelText) && /:$/.test(labelText);
    if ((tag === "FP-1" || tag === "FP" || tag === "FP-2" || tag === "P") && startsWithLabel) {
      const label = labelText.replace(/:$/, "");
      const value = clean(text.slice(labelText.length));
      c.blocks.push({ kind: "field", label, text: value });
      if (/^Reason for Control/i.test(label)) {
        section = "lr";
        c.reasonForControl = value.split(/,\s*|\s+and\s+/).map((s) => s.trim()).filter((s) => /^[A-Z]{2,3}$/.test(s));
      } else if (section === "le" && label.length <= 12 && /^[A-Z/]+$/.test(label)) {
        c.licenseExceptions.push(parseLicenseException(label, value));
      } else if (/^Related Controls/i.test(label)) c.relatedControls = value;
      else if (/^Related Definitions/i.test(label)) c.relatedDefinitions = value;
      else if (/^Unit/i.test(label)) c.unit = value;
      if (/^Items$/i.test(label)) section = "items";
      continue;
    }

    if (tag === "P" || tag === "FP" || tag === "FP-1" || tag === "FP-2") {
      if (!text) continue;
      // Continuation line of a multi-line license exception value (e.g. LVS on 5A002).
      if (section === "le" && c.licenseExceptions.length) {
        const le = c.licenseExceptions[c.licenseExceptions.length - 1];
        Object.assign(le, parseLicenseException(le.code, `${le.text} ${text}`));
        const last = c.blocks[c.blocks.length - 1];
        if (last?.kind === "field") last.text = le.text;
        continue;
      }
      const pm = section === "items" ? text.match(PARA_RE) : null;
      if (pm) {
        const ref = pm[1];
        const depth = ref.split(".").length;
        c.paragraphs.push({ ref, text: clean(pm[2]), depth });
        c.blocks.push({ kind: "para", ref, depth, text: clean(pm[2]) });
      } else {
        c.blocks.push({ kind: "para", depth: 0, text });
      }
    }
  }
  finish();

  if (eccns.length < 550) throw new Error(`CCL: only ${eccns.length} ECCNs parsed`);
  return { stamp, categories, eccns };
}

export function parseControlRow(scopeRaw: string, chartRaw: string, eccnId = ""): EccnControl {
  const scope = clean(scopeRaw);
  const chart = clean(chartRaw);
  const reasonMatch = scope.match(/^([A-Z]{2,3})\b/);
  const reason = reasonMatch ? reasonMatch[1] : "?";
  const columns = new Set<ChartColumn>();
  for (const m of chart.matchAll(/\b(CB|NP|NS|MT|RS|FC|CC|AT)\s+Column\s+(\d)/g)) {
    const col = `${m[1]}${m[2]}` as ChartColumn;
    if (CHART_COLUMNS.includes(col)) columns.add(col);
  }
  const body = scope.replace(/^[A-Z]{2,3}(?:\s*(?:,|and)\s*[A-Z]{2,3})*\s+(?:applies|apply)\s+(?:to\s+)?/i, "");
  let mode: EccnControl["mode"];
  let paragraphs: string[] = [];
  let conditional = false;
  if (/^(the\s+)?entire entry\.?$/i.test(body) || !body || body === scope && /entire entry/i.test(scope) && !/except/i.test(scope)) {
    mode = "entire";
  } else if (/^(the\s+)?entire entry,?\s+except/i.test(body)) {
    mode = "except";
    paragraphs = extractParagraphRefs(body.replace(/^(the\s+)?entire entry,?\s+except/i, ""), eccnId);
    conditional = paragraphs.length === 0;
  } else {
    mode = "only";
    paragraphs = extractParagraphRefs(body, eccnId);
    conditional = /\b(when|if|unless|provided|except|usable|designed or modified|for use in)\b/i.test(body) || paragraphs.length === 0;
  }
  // A chart cell is "simple" when it is only column references (e.g. "NS Column 2.").
  const residue = chart
    .replace(/\b(CB|NP|NS|MT|RS|FC|CC|AT)\s+Column\s+\d/g, "")
    .replace(/[\s.,;]|\band\b|\bor\b/gi, "");
  const special = columns.size === 0 || residue.length > 0;
  return { reason, scope, chart, columns: [...columns], mode, paragraphs, conditional, special };
}

/**
 * Pull paragraph references like "3A001.a.1.a", ".b", "b.3" out of a scope phrase.
 * References qualified with a different ECCN (e.g. "3A201.b" inside 3A001) are ignored.
 */
export function extractParagraphRefs(text: string, eccnId = ""): string[] {
  const refs = new Set<string>();
  const re = /(\b\d[A-E]\d{3})?(\.)?\b([a-z]{1,2}(?:\.(?:\d{1,2}|[a-z]{1,2}))*)\b(?![-'’])/g;
  let lastEccn = eccnId;
  for (const m of text.matchAll(re)) {
    const [, prefix, dot, ref] = m;
    if (prefix) lastEccn = prefix;
    if (prefix && eccnId && prefix !== eccnId) continue;
    if (!prefix && lastEccn !== eccnId) continue;
    const dotted = ref.includes(".");
    // bare words ("to", "in", "a") are only refs when written with a leading dot or ECCN
    if (!dotted && !dot && !prefix) continue;
    if (!/^[a-z]{1,2}(\.|$)/.test(ref)) continue;
    if (dotted && /^(e\.g|i\.e)/.test(ref)) continue;
    refs.add(ref);
  }
  return [...refs];
}

export function parseLicenseException(code: string, text: string): EccnLicenseException {
  const t = clean(text);
  const dollars = t.match(/\$\s?([\d,]+)/);
  const valueLimit = dollars ? Number(dollars[1].replace(/,/g, "")) : undefined;
  let status: EccnLicenseException["status"];
  if (/^N\/A\b\.?$/i.test(t) || /^No\.?$/i.test(t)) status = "no";
  else if (/^N\/A\b/i.test(t) && !/\byes\b/i.test(t) && !dollars) status = "no";
  else if (/^Yes\.?$/i.test(t)) status = "yes";
  else if (/^\$\s?[\d,]+\.?$/.test(t)) status = "value";
  else status = "partial";
  return valueLimit !== undefined ? { code, text: t, status, valueLimit } : { code, text: t, status };
}

// ---------------------------------------------------------------------------
// Sections (for the regulation library and retrieval)

export function parseSections(xml: string, part: string, opts: { skipSupplements?: RegExp } = {}): RegSection[] {
  const $ = load(xml);
  const out: RegSection[] = [];
  $("DIV8, DIV9").each((_, div) => {
    const head = clean($(div).children("HEAD").first().text());
    if (!head) return;
    const isSupp = (div as Element).tagName === "DIV9";
    if (isSupp && opts.skipSupplements?.test(head)) return;
    let id: string;
    let title: string;
    if (isSupp) {
      const m = head.match(/^Supplement No\.\s*(\d+)\s+to Part\s+(\d+)\s*[—-]?\s*(.*)$/i);
      id = m ? `${m[2]} Supp. ${m[1]}` : head;
      title = m ? m[3] || head : head;
    } else {
      const m = head.match(/^§\s*([\d.]+[a-z]?)\s+(.*)$/);
      if (!m) return;
      id = m[1];
      title = m[2].replace(/\.$/, "");
    }
    const paragraphs: RegSection["paragraphs"] = [];
    $(div)
      .children()
      .not("HEAD, CITA, AUTH, SOURCE, DIV8, DIV9")
      .each((_, el) => {
        const tag = (el as Element).tagName;
        if (tag === "DIV" || tag === "GPOTABLE") {
          $(el)
            .find("TR")
            .each((_, tr) => {
              const row = $(tr)
                .children("TD, TH")
                .toArray()
                .map((c) => textOf($, c))
                .filter(Boolean)
                .join(" | ");
              if (row) paragraphs.push({ depth: 1, text: row });
            });
          return;
        }
        const t = textOf($, el);
        if (!t) return;
        const lm = t.match(/^((?:\([a-z0-9ivx]+\))+)\s*/i);
        const label = lm ? lm[1] : undefined;
        const depth = label ? (label.match(/\(/g) ?? []).length : 0;
        paragraphs.push({ label, depth, text: t });
      });
    const cite = isSupp ? `15 CFR ${id.replace(" Supp. ", " Supp. No. ")}` : `15 CFR ${id}`;
    const url = isSupp
      ? `${ecfrPartUrl(part)}#${encodeURIComponent(head.split(/[—-]/)[0].trim().toLowerCase().replace(/\s+/g, "-").replace(/\./g, ""))}`
      : `https://www.ecfr.gov/current/title-15/section-${id}`;
    out.push({ id, source: "ear", part, title, cite, url, paragraphs });
  });
  return out;
}
