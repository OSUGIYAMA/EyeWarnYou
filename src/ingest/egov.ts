// Parsers for Japanese law XML from the e-Gov 法令API v2 (https://laws.e-gov.go.jp/api/2/).
import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import type { JpAppendix1Row, JpCountryLists, RegSection, SourceStamp } from "../shared/regs.ts";
import { resolveJaLawCountry } from "./countries.ts";

export const LAW_IDS = {
  yushutsurei: "324CO0000000378", // 輸出貿易管理令
  kamotsu: "403M50000400049", // 貨物等省令
  gaitameho: "324AC0000000228", // 外国為替及び外国貿易法
  gaitamerei: "355CO0000000260", // 外国為替令
  osoreWmd: "413M60000400249", // 輸出貨物が核兵器等の開発等のために用いられるおそれがある場合を定める省令
  osoreConventional: "420M60000400057", // 通常兵器 おそれ省令 (輸出令別表第一の一の項…)
} as const;

export interface EgovLaw {
  lawId: string;
  title: string;
  revisionId: string;
  enforcementDate: string;
  xml: string;
}

export async function fetchEgovLaw(lawId: string): Promise<EgovLaw> {
  const url = `https://laws.e-gov.go.jp/api/2/law_data/${lawId}?law_full_text_format=xml`;
  const res = await fetch(url, { headers: { "accept-encoding": "gzip", accept: "application/json" } });
  if (!res.ok) throw new Error(`e-Gov ${lawId}: HTTP ${res.status}`);
  const data = (await res.json()) as {
    revision_info: { law_title: string; law_revision_id: string; amendment_enforcement_date: string };
    law_full_text: string;
  };
  const xml = Buffer.from(data.law_full_text, "base64").toString("utf8");
  return {
    lawId,
    title: data.revision_info.law_title,
    revisionId: data.revision_info.law_revision_id,
    enforcementDate: data.revision_info.amendment_enforcement_date,
    xml,
  };
}

export function egovLawUrl(lawId: string): string {
  return `https://laws.e-gov.go.jp/law/${lawId}`;
}

const KANJI: Record<string, number> = { 〇: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

/** "一二" → 12, "十五" → 15, "一〇" → 10, "二" → 2. */
export function kanjiToNumber(s: string): number {
  const t = s.trim();
  if (/^\d+$/.test(t)) return Number(t);
  if (t.includes("十")) {
    const [tens, ones] = t.split("十");
    return (tens ? KANJI[tens] : 1) * 10 + (ones ? KANJI[ones] ?? 0 : 0);
  }
  let n = 0;
  for (const ch of t) {
    if (!(ch in KANJI)) return NaN;
    n = n * 10 + KANJI[ch];
  }
  return n;
}

/** "（十三の二）" → "13の2" ; "（一）" → "1". */
export function normalizeSub(sub: string): string {
  const inner = sub.replace(/[（）()]/g, "");
  return inner
    .split("の")
    .map((p) => {
      const n = kanjiToNumber(p);
      return Number.isNaN(n) ? p : String(n);
    })
    .join("の");
}

function load(xml: string) {
  return cheerio.load(xml, { xml: { xmlMode: true, decodeEntities: true } });
}

const squash = (s: string) => s.replace(/[\s　]+/g, " ").replace(/ ?([、。）」]) ?/g, "$1").trim();

function appendixTable($: cheerio.CheerioAPI, title: string) {
  return $("AppdxTable")
    .filter((_, el) => squash($(el).children("AppdxTableTitle").text()) === title)
    .first();
}

function sentences($: cheerio.CheerioAPI, el: cheerio.Cheerio<Element> | Element): string {
  return squash(
    $(el)
      .find("Sentence")
      .map((_, s) => $(s).text())
      .get()
      .join(""),
  );
}

// ---------------------------------------------------------------------------
// 輸出貿易管理令

export function parseYushutsurei(law: EgovLaw, stamp: SourceStamp): {
  countries: JpCountryLists;
  appendix1: JpAppendix1Row[];
  sections: RegSection[];
} {
  const $ = load(law.xml);

  const countryList = (title: string) => {
    const text = sentences($, appendixTable($, title)[0]);
    const names = text
      .replace(/^（[^）]*）/, "")
      .split(/[、，]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const iso = names.map((n) => {
      const code = resolveJaLawCountry(n);
      if (!code) throw new Error(`輸出令 ${title}: 国名を解決できません: ${n}`);
      return code;
    });
    return { iso, text };
  };
  const a3 = countryList("別表第三");
  const a3_2 = countryList("別表第三の二");
  const a4 = countryList("別表第四");
  const a2_4 = countryList("別表第二の四");
  const a3_3 = sentences($, appendixTable($, "別表第三の三")[0]);
  if (a3.iso.length < 20) throw new Error(`輸出令 別表第三: ${a3.iso.length} 件しか取得できません`);

  // 別表第一 — rows of [項, 貨物, 地域]
  const appendix1: JpAppendix1Row[] = [];
  appendixTable($, "別表第一")
    .find("TableRow")
    .each((_, row) => {
      const cols = $(row).children("TableColumn").toArray();
      if (cols.length < 2) return;
      const kou = normalizeSub(squash($(cols[0]).text()));
      if (!/^\d+(の\d+)?$/.test(kou) || kou === "0") return;
      const region = cols[2] ? sentences($, cols[2] as Element) : "";
      let lastSub = "";
      $(cols[1])
        .find("Sentence")
        .each((_, s) => {
          const text = squash($(s).text());
          const m = text.match(/^(（[^）]+）)\s*(.*)$/);
          // 16の項（一）enumerates numbered goods: "１ レーザー…", "２ 金属加工用…"
          const n = !m && lastSub ? text.match(/^([０-９\d]+)\s+(.*)$/) : null;
          let sub = m ? normalizeSub(m[1]) : "";
          let body = m ? m[2] : text;
          if (m) lastSub = sub;
          if (n) {
            const num = n[1].replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0));
            sub = `${lastSub}-${num}`;
            body = n[2];
          }
          const label = !sub ? `${kou}の項` : n ? `${kou}の項（${lastSub}）${sub.split("-")[1]}` : `${kou}の項（${sub}）`;
          appendix1.push({
            kou,
            sub,
            label,
            text: body + (region && region !== "全地域" ? `〔地域: ${region}〕` : ""),
          });
        });
    });
  if (appendix1.length < 100) throw new Error(`輸出令 別表第一: ${appendix1.length} 行しか取得できません`);

  const sections = parseArticles($, law, "輸出令");
  // Appendix tables as sections too, so they are citable.
  for (const t of ["別表第二の三", "別表第二の四", "別表第三", "別表第三の二", "別表第三の三", "別表第四"]) {
    sections.push({
      id: `jp:${law.lawId}:${t}`,
      source: "jp",
      part: "輸出令",
      title: t,
      cite: `輸出貿易管理令 ${t}`,
      url: egovLawUrl(law.lawId),
      paragraphs: [{ depth: 0, text: sentences($, appendixTable($, t)[0]) }],
    });
  }
  sections.push({
    id: `jp:${law.lawId}:別表第一`,
    source: "jp",
    part: "輸出令",
    title: "別表第一",
    cite: "輸出貿易管理令 別表第一",
    url: egovLawUrl(law.lawId),
    paragraphs: appendix1.map((r) => ({ label: r.label, depth: 1, text: r.text })),
  });

  return {
    countries: {
      stamp,
      groupA: a3.iso,
      unArmsEmbargo: a3_2.iso,
      concern: a4.iso,
      russiaDiversion: a2_4.iso,
      appendix3_3: a3_3,
      raw: { 別表第三: a3.text, 別表第三の二: a3_2.text, 別表第四: a4.text, 別表第二の四: a2_4.text },
    },
    appendix1,
    sections,
  };
}

// ---------------------------------------------------------------------------
// Generic article parser (MainProvision only)

export function parseArticles($: cheerio.CheerioAPI, law: EgovLaw, short: string): RegSection[] {
  const out: RegSection[] = [];
  const paragraphsOf = (container: cheerio.Cheerio<Element>): RegSection["paragraphs"] => {
    const paragraphs: RegSection["paragraphs"] = [];
    container.children("Paragraph").each((pi, p) => {
      const $p = $(p);
      const pnum = squash($p.children("ParagraphNum").text());
      const ptext = sentences($, $p.children("ParagraphSentence"));
      paragraphs.push({ label: pnum || (pi === 0 ? undefined : `${pi + 1}`), depth: 0, text: ptext });
      const walk = (el: cheerio.Cheerio<Element>, depth: number) => {
        el.children().each((_, child) => {
          const tag = (child as Element).tagName;
          if (!/^(Item|Subitem\d+)$/.test(tag)) return;
          const $c = $(child);
          const label = squash($c.children(`${tag}Title`).text());
          const text = sentences($, $c.children(`${tag}Sentence`));
          paragraphs.push({ label, depth, text });
          walk($c, depth + 1);
        });
      };
      walk($p, 1);
    });
    return paragraphs;
  };
  const main = $("MainProvision").first();
  const articles = main.find("Article");
  if (!articles.length) {
    // Single-provision ordinances (e.g. the おそれ省令) have paragraphs directly under MainProvision.
    out.push({
      id: `jp:${law.lawId}:main`,
      source: "jp",
      part: short,
      title: "本則",
      cite: law.title,
      url: egovLawUrl(law.lawId),
      paragraphs: paragraphsOf(main),
    });
  }
  articles.each((_, art) => {
    const $a = $(art);
    const num = $a.attr("Num") ?? "";
    const title = squash($a.children("ArticleTitle").text());
    const caption = squash($a.children("ArticleCaption").text()).replace(/^（|）$/g, "");
    out.push({
      id: `jp:${law.lawId}:${num}`,
      source: "jp",
      part: short,
      title: caption ? `${title}（${caption}）` : title,
      cite: `${law.title} ${title}`,
      url: egovLawUrl(law.lawId),
      paragraphs: paragraphsOf($a),
    });
  });
  // Appended tables (別表) of ordinances other than 輸出令 (which has its own handling)
  if (short !== "輸出令") {
    $("AppdxTable").each((i, t) => {
      const title = squash($(t).children("AppdxTableTitle").text()) || `別表${i + 1}`;
      const rows = $(t)
        .find("TableRow")
        .toArray()
        .map((r) =>
          $(r)
            .children("TableColumn")
            .toArray()
            .map((col) => sentences($, col as Element))
            .filter(Boolean)
            .join(" | "),
        )
        .filter(Boolean);
      const items = rows.length ? rows : [sentences($, t as Element)];
      out.push({
        id: `jp:${law.lawId}:${title}`,
        source: "jp",
        part: short,
        title,
        cite: `${law.title} ${title}`,
        url: egovLawUrl(law.lawId),
        paragraphs: items.map((text) => ({ depth: 1, text })),
      });
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 貨物等省令 — each article covers one 項 of 輸出令別表第一 (or 外為令別表 for technology).

export function parseKamotsu(law: EgovLaw): {
  sections: RegSection[];
  articles: { article: string; title: string; kou?: string; techKou?: string; text: string }[];
} {
  const $ = load(law.xml);
  const sections = parseArticles($, law, "貨物等省令");
  const articles = sections.map((s) => {
    const full = s.paragraphs.map((p) => (p.label ? `${p.label} ${p.text}` : p.text)).join("\n");
    const head = full.slice(0, 300);
    const goods = head.match(/別表第一の([〇一二三四五六七八九十]+(?:の[〇一二三四五六七八九十]+)?)の項/);
    const tech = head.match(/(?:外為令|外国為替令)[^\n]{0,25}?別表の([〇一二三四五六七八九十]+(?:の[〇一二三四五六七八九十]+)?)の項/);
    return {
      article: s.title,
      title: s.title,
      kou: goods ? normalizeSub(goods[1]) : undefined,
      techKou: tech ? normalizeSub(tech[1]) : undefined,
      text: full,
    };
  });
  return { sections, articles };
}
