// Datasets derived from regulation text, so the engine never hard-codes lists that BIS amends.
import type { EarDerived, JpDerived, JpListControl, RegLibrary } from "../shared/regs.ts";
import { resolveEarCountry } from "./countries.ts";

function section(lib: RegLibrary, id: string) {
  const s = lib.sections.find((x) => x.id === id);
  if (!s) throw new Error(`derive: section ${id} not found`);
  return s;
}

function htsCodes(lib: RegLibrary, id: string): string[] {
  const codes = new Set<string>();
  for (const p of section(lib, id).paragraphs) {
    const m = p.text.match(/^(\d{6})\s*\|/);
    if (m) codes.add(m[1]);
  }
  if (codes.size < 5) throw new Error(`derive: ${id} yielded only ${codes.size} HTS codes`);
  return [...codes];
}

function names(list: string): string[] {
  return list
    .replace(/\.$/, "")
    .split(/,\s*(?:and\s+|or\s+)?|\s+(?:and|or)\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function deriveEar(lib: RegLibrary): EarDerived {
  // 746.1(b)(2): "The countries subject to United Nations Security Council arms embargoes are: …"
  const unPara = section(lib, "746.1").paragraphs.find((p) => /countries subject to United Nations Security Council arms embargoes are/i.test(p.text));
  if (!unPara) throw new Error("derive: 746.1(b)(2) not found");
  const unList = unPara.text.replace(/^.*?embargoes are:\s*/i, "");
  const unArmsEmbargo = names(unList).map((n) => {
    const iso = resolveEarCountry(n);
    if (!iso) throw new Error(`derive: unresolved UN embargo country "${n}"`);
    return iso;
  });

  // 746 Supp. 3: partner countries excluded from certain Russia/Belarus/Iran requirements
  const partnerCountries: EarDerived["partnerCountries"] = [];
  for (const p of section(lib, "746 Supp. 3").paragraphs) {
    const cells = p.text.split("|").map((c) => c.trim());
    if (cells.length < 2 || /^Country$/i.test(cells[0])) continue;
    const iso = resolveEarCountry(cells[0]);
    if (iso) partnerCountries.push({ iso2: iso, scope: cells[1], cite: cells[2] ?? "" });
  }
  if (partnerCountries.length < 30) throw new Error(`derive: 746 Supp. 3 yielded ${partnerCountries.length} countries`);

  // 744 Supp. 2: ECCNs subject to the MEU license requirement of 744.21(a)(1)
  const meuEccns = new Set<string>();
  for (const p of section(lib, "744 Supp. 2").paragraphs) {
    const m = p.text.match(/^\([ivxl]+\)\s+(\d[A-E]\d{3})\b/);
    if (m) meuEccns.add(m[1]);
  }

  // 744.21(a)(1)/(2): destinations for the MEU rule
  const a1 = section(lib, "744.21").paragraphs.find((p) => /^\(1\) Any item subject to the EAR listed in supplement no\. 2/i.test(p.text))?.text ?? "";
  const meuDest = (a1.match(/military end use,' as defined in paragraph \(f\) of this section, in (.*?), or a /i)?.[1] ?? "")
    .replace(/the People's Republic of China \(China\)/, "China");
  const meuSupp2Destinations = names(meuDest)
    .map((n) => resolveEarCountry(n))
    .filter((x): x is string => !!x);

  // 732 Supp. 3 red flags (verbatim, numbered)
  const redFlags: EarDerived["redFlags"] = [];
  let inFlags = false;
  for (const p of section(lib, "732 Supp. 3").paragraphs) {
    if (/^Red Flags$/i.test(p.text.trim())) inFlags = true;
    if (!inFlags) continue;
    const m = p.text.match(/^(\d{1,2})\.\s+(.*)$/);
    if (m && Number(m[1]) === redFlags.length + 1) redFlags.push({ n: Number(m[1]), text: m[2] });
  }
  if (redFlags.length < 12) throw new Error(`derive: only ${redFlags.length} red flags parsed`);

  return {
    unArmsEmbargo,
    partnerCountries,
    russiaHts: {
      supp2: htsCodes(lib, "746 Supp. 2"),
      supp4: htsCodes(lib, "746 Supp. 4"),
      supp5: htsCodes(lib, "746 Supp. 5"),
      supp7: htsCodes(lib, "746 Supp. 7"),
    },
    meuEccns: [...meuEccns],
    meuSupp2Destinations,
    redFlags,
  };
}

// ---------------------------------------------------------------------------
// Japan

const KD: Record<string, string> = { 〇: "0", 一: "1", 二: "2", 三: "3", 四: "4", 五: "5", 六: "6", 七: "7", 八: "8", 九: "9" };
const kanjiDigits = (s: string) => [...s].map((ch) => KD[ch] ?? "").join("");

export function deriveJp(listControl: JpListControl): JpDerived {
  // 貨物等省令 第14条の2: "関税率表第八四・五六項…" (heading) / "第八五四二・九〇号" (subheading)
  const art = listControl.ministerialArticles.find((a) => a.kou === "16");
  if (!art) throw new Error("deriveJp: 貨物等省令 16の項 article not found");
  const include = new Set<string>();
  const exclude = new Set<string>();
  for (const line of art.text.split("\n")) {
    const body = line.replace(/^[一二三四五六七八九十]+\s+/, "");
    const excl = [...body.matchAll(/（第([〇一二三四五六七八九・]+)(?:項|号)を除く。）/g)].map((m) => kanjiDigits(m[1]));
    excl.forEach((e) => exclude.add(e));
    const cleaned = body.replace(/（[^）]*）/g, "");
    for (const m of cleaned.matchAll(/第([〇一二三四五六七八九・]+)(項|号)/g)) {
      const code = kanjiDigits(m[1]);
      if (code.length >= 4) include.add(code);
    }
  }
  if (include.size < 8) throw new Error(`deriveJp: only ${include.size} HS codes parsed for 16の項（1）`);

  // 別表第一 16の項（2）: "…別表第二五類から第四〇類まで、第五四類から第五九類まで、第六三類、第六八類から第九三類まで又は第九五類…"
  const row = listControl.appendix1.find((r) => r.kou === "16" && r.sub === "2");
  if (!row) throw new Error("deriveJp: 16の項（2） not found");
  const chapters = new Set<string>();
  for (const m of row.text.matchAll(/第([〇一二三四五六七八九]+)類(?:から第([〇一二三四五六七八九]+)類まで)?/g)) {
    const a = Number(kanjiDigits(m[1]));
    const b = m[2] ? Number(kanjiDigits(m[2])) : a;
    for (let ch = a; ch <= b; ch++) chapters.add(String(ch).padStart(2, "0"));
  }
  if (chapters.size < 30) throw new Error(`deriveJp: only ${chapters.size} chapters parsed for 16の項（2）`);

  return { catchAll16_1: { include: [...include], exclude: [...exclude] }, catchAll16_2Chapters: [...chapters] };
}
