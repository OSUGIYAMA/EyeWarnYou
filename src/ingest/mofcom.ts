// China: MOFCOM designations (Export Control Control List 出口管制管控名单, Watch List 关注名单,
// Unreliable Entity List 不可靠实体清单, countermeasure orders 反制清单), fetched from the primary
// announcement pages. China publishes no machine-readable list; each announcement carries an annex
// of "n. 中文名（English name）" lines, which we parse. Status changes (suspensions / stops) are
// announced separately by MOFCOM and recorded here with their source.
import type { ScreeningEntry, ScreeningListId, SourceStamp } from "../shared/regs.ts";

export interface MofcomNotice {
  id: string;
  list: Extract<ScreeningListId, "CN-ECL" | "CN-WL" | "CN-UEL" | "CN-AFSL">;
  title: string;
  date: string;
  url: string;
  country?: string; // ISO2 when the whole notice targets one country
  status?: { state: "suspended" | "stopped" | "removed"; from: string; until?: string; source: string };
}

const SUSPENSION_KL = "https://www.mofcom.gov.cn/xwfb/xwfyrth/art/2025/art_7e09fc75390f4a078466b56ac9d6503a.html";
const UEL_KL = "https://www.mofcom.gov.cn/xwfb/xwfyrth/art/2025/art_3cd57285290044edb3036563bc4c7352.html";
const AUG_2025 = "https://www.mofcom.gov.cn/xwfb/xwfyrth/art/2025/art_2d1e85ffaebf4ed9913f35f2afb5c436.html";

export const MOFCOM_NOTICES: MofcomNotice[] = [
  // Export Control Control List (ECL Art. 18; Dual-Use Regulations Arts. 28–30)
  { id: "MOFCOM-2025-1", list: "CN-ECL", title: "商务部公告2025年第1号 — 28 US entities", date: "2025-01-02", country: "US", url: "https://www.mofcom.gov.cn/zcfb/blgg/gg/2025nswbgg/art/2025/art_9b966e20a6934cc6b4fa2cf777626854.html" },
  { id: "MOFCOM-2025-13", list: "CN-ECL", title: "商务部公告2025年第13号 — 15 US entities", date: "2025-03-04", country: "US", url: "https://www.mofcom.gov.cn/zcfb/blgg/gg/2025/art/2025/art_67b1b070edcb42e2ad9b8860c15f3b12.html", status: { state: "stopped", from: "2025-11-10", source: SUSPENSION_KL } },
  { id: "MOFCOM-2025-21", list: "CN-ECL", title: "商务部公告2025年第21号 — 16 US entities", date: "2025-04-04", country: "US", url: "https://www.mofcom.gov.cn/zcfb/blgg/gg/2025/art/2025/art_e1772b9dcc6c4337aa61f1f8847d0a61.html", status: { state: "suspended", from: "2025-11-10", until: "2026-11-10", source: SUSPENSION_KL } },
  { id: "MOFCOM-2025-22", list: "CN-ECL", title: "商务部公告2025年第22号 — 12 US entities", date: "2025-04-09", country: "US", url: "https://www.mofcom.gov.cn/zcfb/blgg/gg/2025/art/2025/art_a3535a90814b4d33bf9dc2878c65c9e0.html", status: { state: "stopped", from: "2025-08-12", source: AUG_2025 } },
  { id: "MOFCOM-2025-TW", list: "CN-ECL", title: "商务部公告（2025-07-09）— 8 Taiwan entities", date: "2025-07-09", country: "TW", url: "https://www.mofcom.gov.cn/zcfb/blgg/gg/2025/art/2025/art_bc099a251426466f8fa650f9216c064d.html" },
  { id: "MOFCOM-2025-0925", list: "CN-ECL", title: "商务部公告（2025-09-25）— 3 US entities", date: "2025-09-25", country: "US", url: "https://www.mofcom.gov.cn/zcfb/blgg/gg/2025/art/2025/art_250b2a4fdbd04ed19f626a5ce931492c.html" },
  { id: "MOFCOM-2026-11", list: "CN-ECL", title: "商务部公告2026年第11号 — 20 Japanese entities", date: "2026-02-24", country: "JP", url: "https://www.mofcom.gov.cn/zwgk/zcfb/art/2026/art_b5159a773124428a9813884015d1b8b3.html" },
  { id: "MOFCOM-2026-20", list: "CN-ECL", title: "商务部公告2026年第20号 — 7 EU entities", date: "2026-04-24", url: "https://www.mofcom.gov.cn/zcfb/blgg/gg/2026/art/2026/art_d909592ea44b40148f244cb233773d4f.html" },
  { id: "MOFCOM-2026-23", list: "CN-ECL", title: "商务部公告2026年第23号 — 10 US entities", date: "2026-06-22", country: "US", url: "https://www.mofcom.gov.cn/zwgk/zcfb/art/2026/art_dfa9cc5c1e004d7fbb86f83d249e7986.html" },
  { id: "MOFCOM-2026-27", list: "CN-ECL", title: "商务部公告2026年第27号 — 20 Japanese entities", date: "2026-06-29", country: "JP", url: "https://www.mofcom.gov.cn/zwgk/zcfb/art/2026/art_df87be1437044874a35f85cf6e076f3d.html" },
  { id: "MOFCOM-2026-30", list: "CN-ECL", title: "商务部公告2026年第30号 — 14 EU entities", date: "2026-07-24", url: "https://www.mofcom.gov.cn/zcfb/blgg/gg/2026/art/2026/art_452eed7fd22c431fbd3d7a8b9fad6d93.html" },
  // Watch List (Dual-Use Regulations Art. 26)
  { id: "MOFCOM-2026-12", list: "CN-WL", title: "商务部公告2026年第12号 — 20 Japanese entities", date: "2026-02-24", country: "JP", url: "https://www.mofcom.gov.cn/zwgk/zcfb/art/2026/art_bac18400512d408a8d4c2f964e36ac11.html" },
  { id: "MOFCOM-2026-28", list: "CN-WL", title: "商务部公告2026年第28号 — 20 Japanese entities", date: "2026-06-29", country: "JP", url: "https://www.mofcom.gov.cn/zcfb/blgg/gg/2026/art/2026/art_1a0adf5de9b84cd091992669d59e10d4.html" },
  // Unreliable Entity List (MOFCOM Order 2020 No. 4)
  { id: "UEL-2025-1", list: "CN-UEL", title: "不可靠实体清单工作机制公告〔2025〕1号 — 10 US entities", date: "2025-01-02", country: "US", url: "https://www.mofcom.gov.cn/zcfb/blgg/gg/2025nswbgg/art/2025/art_6d2af2148a554e58854998d6b0770625.html" },
  { id: "UEL-2025-2", list: "CN-UEL", title: "不可靠实体清单工作机制公告〔2025〕2号 — 7 US entities", date: "2025-01-14", country: "US", url: "https://www.mofcom.gov.cn/zcfb/blgg/gg/2025/art/2025/art_4d8f19badfca417b9293f8479181706b.html" },
  { id: "UEL-2025-3", list: "CN-UEL", title: "不可靠实体清单工作机制公告〔2025〕3号 — 4 US entities", date: "2025-01-15", country: "US", url: "https://www.mofcom.gov.cn/zcfb/blgg/gg/2025/art/2025/art_a4e1d7ae955d409780b01fa4a08a1331.html" },
  { id: "UEL-2025-0204", list: "CN-UEL", title: "不可靠实体清单工作机制公告（2025-02-04）", date: "2025-02-04", country: "US", url: "https://www.mofcom.gov.cn/zwgk/zcfb/art/2025/art_ab15d2258dda4e93b8ad1ec4776d37c3.html" },
  { id: "UEL-2025-5", list: "CN-UEL", title: "不可靠实体清单工作机制公告〔2025〕5号", date: "2025-03-04", country: "US", url: "https://www.mofcom.gov.cn/zcfb/blgg/gg/2025/art/2025/art_fe1f402f866f4216b1e835770df96f8c.html", status: { state: "stopped", from: "2025-11-10", source: UEL_KL } },
  { id: "UEL-2025-6", list: "CN-UEL", title: "不可靠实体清单工作机制公告〔2025〕6号", date: "2025-03-04", country: "US", url: "https://www.mofcom.gov.cn/zcfb/blgg/gg/2025/art/2025/art_5476ce842c764bd09fa530b97ebf96bb.html", status: { state: "stopped", from: "2025-11-10", source: UEL_KL } },
  { id: "UEL-2025-7", list: "CN-UEL", title: "不可靠实体清单工作机制公告〔2025〕7号 — 11 US entities", date: "2025-04-04", country: "US", url: "https://www.mofcom.gov.cn/zwgk/zcfb/art/2025/art_e4f474d3aeba4672913db1042d845d78.html", status: { state: "suspended", from: "2025-11-10", until: "2026-11-10", source: UEL_KL } },
  { id: "UEL-2025-8", list: "CN-UEL", title: "不可靠实体清单工作机制公告〔2025〕8号", date: "2025-04-09", country: "US", url: "https://aqygzj.mofcom.gov.cn/flzc/gzjgfxwj/art/2025/art_81fd0e00d5aa4be39db90f2c183c809a.html", status: { state: "stopped", from: "2025-08-12", source: AUG_2025 } },
  { id: "UEL-2025-0925", list: "CN-UEL", title: "不可靠实体清单工作机制公告（2025-09-25）", date: "2025-09-25", country: "US", url: "https://aqygzj.mofcom.gov.cn/flzc/gzjgfxwj/art/2025/art_f7201e9ac9864599bd43ed65a3257577.html" },
  { id: "UEL-2025-1009", list: "CN-UEL", title: "不可靠实体清单工作机制公告（2025-10-09）— 14 entities incl. TechInsights Japan KK", date: "2025-10-09", url: "https://www.mofcom.gov.cn/zcfb/blgg/gg/2025/art/2025/art_fa5c991e926144e8a13de34fe1b8e00a.html" },
  // Countermeasures (Anti-Foreign Sanctions Law) — MOFCOM orders
  { id: "ORDER-2025-6", list: "CN-AFSL", title: "商务部令2025年第6号 — Hanwha Ocean US subsidiaries", date: "2025-10-14", country: "US", url: "https://aqygzj.mofcom.gov.cn/flzc/gzjgfxwj/art/2025/art_ff624c30d2734ed9b3d0916a23ed1c45.html", status: { state: "suspended", from: "2025-11-10", until: "2026-11-10", source: "https://aqygzj.mofcom.gov.cn/flzc/gzjgfxwj/art/2025/art_d52352ad387d4d9eac9ce684f12e777b.html" } },
  { id: "ORDER-2026-2", list: "CN-AFSL", title: "商务部令2026年第2号 — incl. Responsible Business Alliance", date: "2026-08-05", country: "US", url: "https://aqygzj.mofcom.gov.cn/flzc/gzjgfxwj/art/2026/art_4028b8300fa24a0399f7da26e4939b20.html" },
  { id: "ORDER-2026-0805b", list: "CN-AFSL", title: "商务部决定（2026-08-05）— Compliance Testing LLC", date: "2026-08-05", country: "US", url: "https://aqygzj.mofcom.gov.cn/flzc/gzjgfxwj/art/2026/art_97d99d522e6944439ae31884c928ee31.html" },
];

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

export function htmlToLines(html: string): string[] {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|tr|div|li|td|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|&#xa0;|&#160;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split(/\n/)
    .map((l) => l.replace(/[\s　]+/g, " ").trim())
    .filter(Boolean);
}

/** Parse annex lines like "12. TDK株式会社（TDK Corporation）" or "1、洛克希德·马丁公司（Lockheed Martin Corporation）". */
export function parseAnnex(lines: string[]): { zh: string; en: string }[] {
  const out: { zh: string; en: string }[] = [];
  for (const l of lines) {
    const m = l.match(/^(\d{1,3})\s*[.．、]\s*(.+?)\s*[（(]\s*([A-Za-z0-9][^（）()]*(?:\([^)]*\)[^（）()]*)*)\s*[）)]\s*[。；;,.]?$/);
    if (m) out.push({ zh: m[2].trim(), en: m[3].trim() });
  }
  if (out.length) return out;
  // Prose designations: "…决定将A公司（A Corp）、B公司（B Inc.)…列入不可靠实体清单" or
  // "…子公司Hanwha Shipping LLC、Hanwha Philly Shipyard Inc.和HS USA Holdings Corp.列入反制清单"
  for (const l of lines) {
    const at = l.search(/列入(不可靠实体清单|反制清单|出口管制管控名单|关注名单)/);
    if (at < 0) continue;
    const head = l.slice(0, at);
    const seg = head.slice(Math.max(head.lastIndexOf("决定将"), head.lastIndexOf("将")) + 1);
    const pairs = [...seg.matchAll(/(?:^|[、，,和])\s*([^、，,（(]{2,60}?)\s*[（(]\s*([A-Za-z][^（）()]{1,160}?)\s*[）)]/g)];
    if (pairs.length) {
      for (const p of pairs) out.push({ zh: p[1].replace(/^(参与[^的]*的|等)/, "").trim(), en: p[2].trim() });
      continue;
    }
    const latin = seg
      .replace(/^.*?(子公司|实体|企业)/, "")
      .split(/[、，,]|和(?=[A-Z])/)
      .map((x) => x.trim())
      .filter((x) => /^[A-Z][A-Za-z0-9&.,' -]{2,}$/.test(x));
    for (const en of latin) out.push({ zh: "", en });
  }
  return out;
}

export async function fetchMofcomLists(fetchedAt: string, onProgress?: (msg: string) => void): Promise<{ entries: ScreeningEntry[]; stamp: SourceStamp; failures: string[] }> {
  const entries: ScreeningEntry[] = [];
  const failures: string[] = [];
  let latest = "";
  for (const n of MOFCOM_NOTICES) {
    onProgress?.(n.title);
    try {
      const res = await fetch(n.url, { headers: { "user-agent": UA, "accept-language": "zh-CN,zh;q=0.9" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const annex = parseAnnex(htmlToLines(await res.text()));
      if (!annex.length) throw new Error("no annex entries found");
      annex.forEach((a, i) =>
        entries.push({
          id: `${n.list}:${n.id}:${i + 1}`,
          list: n.list,
          name: a.en,
          altNames: a.zh ? [a.zh] : [],
          type: "Entity",
          countries: n.country ? [n.country] : [],
          addresses: [],
          programs: [n.title],
          startDate: n.date,
          sourceUrl: n.url,
          remarks: n.status ? `Measures ${n.status.state}${n.status.until ? ` until ${n.status.until}` : ""} (from ${n.status.from}; ${n.status.source})` : undefined,
          cnStatus: n.status?.state ?? "active",
          cnStatusUntil: n.status?.until,
        }),
      );
      if (n.date > latest) latest = n.date;
    } catch (e) {
      failures.push(`${n.id}: ${(e as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  if (entries.length < 50) throw new Error(`MOFCOM lists: only ${entries.length} entries parsed (${failures.join("; ")})`);
  return {
    entries,
    failures,
    stamp: { source: "MOFCOM designations (出口管制管控名单 / 关注名单 / 不可靠实体清单 / 反制)", url: "https://aqygzj.mofcom.gov.cn/", asOf: latest, fetchedAt },
  };
}
