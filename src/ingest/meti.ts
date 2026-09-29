// METI End User List (外国ユーザーリスト).
// Published as Excel on https://www.meti.go.jp/policy/anpo/law00.html (section 「キャッチオール規制（16の項）関係」).
// Layout (2025-09-29 revision): sheet 「ユーザーリスト」, columns
//   A No. | B 国名、地域名 (JP\nEN) | C 企業名、組織名 | D 別名 (・-prefixed, newline separated) | E 懸念区分 (JP\nB,C,M,N) | F 通常兵器 (CW)
import ExcelJS from "exceljs";
import type { ScreeningEntry, SourceStamp } from "../shared/regs.ts";
import { resolveEarCountry, resolveJaLawCountry } from "./countries.ts";

const INDEX_URL = "https://www.meti.go.jp/policy/anpo/law00.html";
const KNOWN_LATEST = { url: "https://www.meti.go.jp/policy/anpo/20250929_4.xlsx", published: "2025-09-29", effective: "2025-10-09" };
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

/** Find the newest End User List workbook linked from METI's index page. */
async function discover(): Promise<{ url: string; published: string }> {
  try {
    const res = await fetch(INDEX_URL, { headers: { "user-agent": UA, "accept-language": "ja" } });
    if (res.ok) {
      const html = await res.text();
      const links = [...html.matchAll(/href="([^"]*?(\d{8})_\d+\.xlsx)"/g)]
        .filter((m) => /ユーザー|user/i.test(html.slice(Math.max(0, (m.index ?? 0) - 400), (m.index ?? 0) + 200)))
        .map((m) => ({ url: new URL(m[1], INDEX_URL).toString(), date: m[2] }))
        .sort((a, b) => b.date.localeCompare(a.date));
      if (links[0]) return { url: links[0].url, published: `${links[0].date.slice(0, 4)}-${links[0].date.slice(4, 6)}-${links[0].date.slice(6, 8)}` };
    }
  } catch {
    // fall through to the last known revision
  }
  return { url: KNOWN_LATEST.url, published: KNOWN_LATEST.published };
}

export async function fetchMetiEndUserList(fetchedAt: string): Promise<{ entries: ScreeningEntry[]; stamp: SourceStamp }> {
  const { url, published } = await discover();
  const res = await fetch(url, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`METI End User List download failed: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const entries = await parseMetiEndUserList(buf, url);
  return {
    entries,
    stamp: { source: "METI 外国ユーザーリスト (End User List)", url, asOf: published, fetchedAt },
  };
}

const cellText = (v: ExcelJS.CellValue): string => {
  if (v == null) return "";
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("result" in v) return String(v.result ?? "");
    if ("text" in v) return String(v.text);
  }
  return String(v);
};

export async function parseMetiEndUserList(buf: Buffer | ArrayBuffer, sourceUrl = KNOWN_LATEST.url): Promise<ScreeningEntry[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as ArrayBuffer);
  const ws = wb.worksheets.find((w) => /ユーザー/.test(w.name)) ?? wb.worksheets[0];
  const out: ScreeningEntry[] = [];
  ws.eachRow((row, i) => {
    if (i === 1) return;
    const no = cellText(row.getCell(1).value).trim();
    const country = cellText(row.getCell(2).value).normalize("NFKC");
    const name = cellText(row.getCell(3).value).normalize("NFKC").trim();
    if (!name) return;
    const aliases = cellText(row.getCell(4).value)
      .normalize("NFKC")
      .split(/\n/)
      .map((s) => s.replace(/^[・･\s]+/, "").trim())
      .filter(Boolean);
    const wmd = cellText(row.getCell(5).value).normalize("NFKC");
    const cw = cellText(row.getCell(6).value).normalize("NFKC");
    const codes = new Set<string>();
    for (const m of wmd.matchAll(/\b([BCMN])\b|([BCMN])(?=[,、\s]|$)/g)) codes.add(m[1] ?? m[2]);
    if (/CW/.test(cw)) codes.add("CW");
    const [ja = "", en = ""] = country.split(/\n/).map((s) => s.trim());
    const iso = resolveJaLawCountry(ja) ?? resolveEarCountry(en) ?? resolveEarCountry(en.replace(/^(Islamic Republic of|Republic of|Democratic People's Republic of|People's Republic of|State of|Kingdom of|Arab Republic of|Syrian Arab Republic)\s*/i, ""));
    out.push({
      id: `METI-EUL:${no || i - 1}`,
      list: "METI-EUL",
      name,
      altNames: aliases,
      type: "Entity",
      countries: iso ? [iso] : [],
      addresses: en ? [en] : [],
      programs: [...codes].map((c) => ({ B: "Biological", C: "Chemical", M: "Missile", N: "Nuclear", CW: "Conventional weapons" })[c] ?? c),
      concern: [...codes],
      sourceUrl,
    });
  });
  if (out.length < 300) throw new Error(`METI End User List: only ${out.length} rows parsed`);
  return out;
}
