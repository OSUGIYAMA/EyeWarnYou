// Name normalization for restricted-party screening.
//
// Screening names are noisy: legal-form suffixes ("Co., Ltd.", "有限公司"), punctuation,
// diacritics, transliteration variants. We normalize to a token sequence where
// legal-form and filler tokens are removed, so "Huawei Technologies Co., Ltd." and
// "HUAWEI TECHNOLOGIES" compare equal.

const LEGAL_FORMS = new Set([
  "co", "company", "companies", "corp", "corporation", "inc", "incorporated", "ltd", "limited", "llc", "llp", "lp",
  "plc", "gmbh", "mbh", "ag", "sa", "sas", "sarl", "srl", "spa", "bv", "nv", "oy", "ab", "as", "aps", "kk", "kg",
  "pte", "pvt", "pty", "sdn", "bhd", "jsc", "ojsc", "cjsc", "pjsc", "ooo", "zao", "oao", "tov", "fze", "fzco", "fzc",
  "fz", "llc.", "est", "establishment", "sae", "jv", "the", "of", "and", "&", "group", "holding", "holdings",
  "intl", "international", "trading", "enterprise", "enterprises", "kabushiki", "kaisha", "gaisha", "yugen",
]);

// Filler tokens we drop only for *matching weight*, not for display.
const CJK_LEGAL = /(股份有限公司|有限责任公司|有限責任公司|有限公司|股份公司|集团|集團|公司|株式会社|有限会社|合同会社|（株）|\(株\)|㈱)/g;

const CJK_RE = /[぀-ヿ㐀-䶿一-鿿豈-﫿가-힯]/;

export function hasCjk(s: string): boolean {
  return CJK_RE.test(s);
}

export function foldAscii(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[ʼ’‘`´]/g, "'")
    .replace(/ß/g, "ss")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/đ/g, "d")
    .replace(/ł/g, "l");
}

export interface NormalizedName {
  tokens: string[]; // significant tokens (legal forms removed)
  all: string[]; // all tokens incl. legal forms
  key: string; // tokens joined — exact-match key
}

export function normalizeName(raw: string): NormalizedName {
  let s = raw.normalize("NFKC").toLowerCase();
  if (hasCjk(s)) {
    // CJK: strip legal forms, then character bigrams as tokens
    const core = s.replace(CJK_LEGAL, "").replace(/[\s\p{P}\p{S}]+/gu, "");
    const grams: string[] = [];
    const chars = [...core];
    if (chars.length === 1) grams.push(chars[0]);
    for (let i = 0; i < chars.length - 1; i++) grams.push(chars[i] + chars[i + 1]);
    return { tokens: grams, all: grams, key: core };
  }
  s = foldAscii(s)
    .replace(/\b(co|corp|inc|ltd|l\.l\.c|s\.a|n\.v|b\.v|s\.p\.a|s\.r\.l)\./g, "$1")
    .replace(/\bl\.l\.c\b/g, "llc")
    .replace(/[^a-z0-9&\s'-]/g, " ")
    .replace(/'/g, "")
    .replace(/-/g, " ");
  const all = s.split(/\s+/).filter(Boolean).map(stem);
  let tokens = all.filter((t) => !LEGAL_FORMS.has(t));
  if (!tokens.length) tokens = all; // e.g. "International Group" — keep something
  return { tokens, all, key: tokens.join(" ") };
}

/** Light plural folding so "technologies" ≈ "technology", "systems" ≈ "system". */
export function stem(t: string): string {
  if (t.length > 5 && t.endsWith("ies")) return `${t.slice(0, -3)}y`;
  if (t.length > 4 && t.endsWith("s") && !t.endsWith("ss") && !t.endsWith("us") && !t.endsWith("is")) return t.slice(0, -1);
  return t;
}

/** Optimal string alignment distance (Levenshtein + adjacent transposition as one edit). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const n = a.length;
  const m = b.length;
  let prev2 = new Array<number>(m + 1).fill(0);
  let prev = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    const cur = new Array<number>(m + 1);
    cur[0] = i;
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], prev2[j - 2] + 1);
    }
    prev2 = prev;
    prev = cur;
  }
  return prev[m];
}

/**
 * Token similarity used for fuzzy matching. Short tokens must match exactly; longer
 * tokens tolerate ~1 edit per 5 characters (typos, transliteration drift).
 */
export function tokenSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (Math.min(a.length, b.length) < 5) return 0;
  const ratio = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  if (ratio < 0.8) return 0;
  // Fuzzy matches never score like exact ones: average edit ratio and Jaro-Winkler, then discount.
  return ((ratio + jaroWinkler(a, b)) / 2) * 0.94;
}

/** Jaro-Winkler similarity in [0,1]. */
export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  const la = a.length;
  const lb = b.length;
  if (!la || !lb) return 0;
  const range = Math.max(0, Math.floor(Math.max(la, lb) / 2) - 1);
  const am = new Array<boolean>(la).fill(false);
  const bm = new Array<boolean>(lb).fill(false);
  let matches = 0;
  for (let i = 0; i < la; i++) {
    const lo = Math.max(0, i - range);
    const hi = Math.min(i + range + 1, lb);
    for (let j = lo; j < hi; j++) {
      if (bm[j] || a[i] !== b[j]) continue;
      am[i] = bm[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;
  let t = 0;
  let k = 0;
  for (let i = 0; i < la; i++) {
    if (!am[i]) continue;
    while (!bm[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  const m = matches;
  const jaro = (m / la + m / lb + (m - t / 2) / m) / 3;
  let prefix = 0;
  while (prefix < Math.min(4, la, lb) && a[prefix] === b[prefix]) prefix++;
  return jaro + prefix * 0.1 * (1 - jaro);
}

export function trigrams(token: string): string[] {
  const s = `  ${token} `;
  const out: string[] = [];
  for (let i = 0; i < s.length - 2; i++) out.push(s.slice(i, i + 3));
  return out;
}
