// Dated regulatory events across jurisdictions, and which open cases each one touches.
// Complements the automatic diff feed: the diff tells you what changed in the text;
// the timeline tells you what is scheduled to change and whether your transactions are exposed.
import type { Case } from "../shared/case.ts";
import type { Jurisdiction } from "../shared/assessment.ts";
import { CN_MEASURES } from "./cn/measures.ts";
import { POLICY_STATUS } from "./us/status.ts";

export interface TimelineEvent {
  id: string;
  date: string;
  jurisdiction: Jurisdiction | "EU" | "UK" | "KR" | "TW";
  kind: "takes_effect" | "suspension_ends" | "suspended" | "designation" | "list_revision" | "not_enforced";
  title: string;
  detail: string;
  certainty: "legal" | "announced" | "political";
  sources: { label: string; url: string }[];
  /** Which cases the event can change, with a one-line reason. */
  affects?: (c: Case) => string | null;
}

const CN_MAGNETS = ["smco-magnet", "ndfeb-tbdy"];
const shipsOnOrAfter = (c: Case, date: string) => !c.shipDate || c.shipDate >= date;

export function timeline(): TimelineEvent[] {
  const aff = POLICY_STATUS.find((p) => p.id === "affiliates-rule")!;
  const m = (id: string) => CN_MEASURES.find((x) => x.id === id)!;
  const events: TimelineEvent[] = [
    {
      id: "us-affiliates",
      date: aff.effectiveFrom!,
      jurisdiction: "US",
      kind: "suspension_ends",
      title: "US Affiliates Rule (50% ownership) re-applies",
      detail: aff.summary,
      certainty: "legal",
      sources: aff.sources,
      affects: (c) => (shipsOnOrAfter(c, aff.effectiveFrom!) && c.parties.length ? "Ships on/after the date — confirm ownership of every party" : null),
    },
    {
      id: "us-ai-diffusion",
      date: "2025-05-13",
      jurisdiction: "US",
      kind: "not_enforced",
      title: "AI Diffusion Rule: BIS announces non-enforcement",
      detail: POLICY_STATUS.find((p) => p.id === "ai-diffusion")!.summary,
      certainty: "announced",
      sources: POLICY_STATUS.find((p) => p.id === "ai-diffusion")!.sources,
      affects: (c) => (c.items.some((i) => /^(3A090|4A090|4E091)/.test(i.us.eccn) || /z\./.test(i.us.paragraph)) ? "Advanced-computing items — worldwide text on the books but not enforced" : null),
    },
    {
      id: "us-uae-a5",
      date: "2026-07-10",
      jurisdiction: "US",
      kind: "takes_effect",
      title: "United Arab Emirates moved into Country Group A:5 (out of D:3 / D:4)",
      detail: "License Exception STA in the UAE is limited to approved entities listed in Supp. No. 8 to Part 740 (91 FR 43034).",
      certainty: "legal",
      sources: [{ label: "91 FR 43034", url: "https://www.federalregister.gov" }],
      affects: (c) => (c.destination === "AE" ? "Destination is the UAE" : null),
    },
    {
      id: "us-firearms-2026-11-20",
      date: "2026-11-20",
      jurisdiction: "US",
      kind: "takes_effect",
      title: "BIS firearms / silencer amendments take effect",
      detail: "Published at 91 FR 46252; the CCL text changes on this date. Kanmon's CCL snapshot will pick it up on the first sync after it is codified.",
      certainty: "legal",
      sources: [{ label: "91 FR 46252", url: "https://www.federalregister.gov" }],
      affects: (c) => (c.items.some((i) => /^0A5/.test(i.us.eccn)) ? "Items in 0A5xx" : null),
    },
    {
      id: "cn-oct2025-suspension",
      date: m("2025-61").legalUntil!,
      jurisdiction: "CN",
      kind: "suspension_ends",
      title: "China: suspension of the October 2025 package ends (2025 Nos. 55–58, 61, 62)",
      detail: "Legal text (MOFCOM/GACC 2025 No. 70) suspends the rare-earth, battery and superhard-material measures and the extraterritorial 0.1% rule until 2026-11-10. On 2026-09-28 MOFCOM said both sides agreed to extend the Kuala Lumpur arrangement to 2027-01-10; no amending announcement has been published.",
      certainty: "legal",
      sources: [{ label: "MOFCOM/GACC 2025 No. 70", url: "https://www.mofcom.gov.cn/zwgk/zcfb/art/2025/art_b1ec77dd3f0d4762952904df7cdaadec.html" }],
      affects: (c) => {
        const magnets = c.items.some((i) => i.cn.materials.some((x) => CN_MAGNETS.includes(x)));
        const batt = c.items.some((i) => i.cn.materials.includes("li-battery") || i.cn.materials.includes("holmium"));
        return shipsOnOrAfter(c, "2026-11-10") && (magnets || batt) ? (magnets ? "Contains China-origin rare-earth magnets (0.1% rule)" : "Contains items in the suspended battery / rare-earth measures") : null;
      },
    },
    {
      id: "cn-kl-extension",
      date: "2027-01-10",
      jurisdiction: "CN",
      kind: "suspension_ends",
      title: "China: politically agreed end of the Kuala Lumpur arrangement extension",
      detail: "Date announced by MOFCOM on 2026-09-28 as the extended term of the US–China arrangement. Treat as indicative until a legal instrument amends 2025 No. 70.",
      certainty: "political",
      sources: [{ label: "MOFCOM Americas & Oceania Dept., 2026-09-28", url: "https://www.mofcom.gov.cn/syxwfb/art/2026/art_d9ea01824fc44fd8a29f7dc3f8ca9c72.html" }],
    },
    {
      id: "cn-46-para2",
      date: m("2024-46-2").legalUntil!,
      jurisdiction: "CN",
      kind: "suspension_ends",
      title: "China: suspension of Ga/Ge/Sb/superhard denial to the US ends (2024 No. 46 para. 2)",
      detail: m("2024-46-2").summary,
      certainty: "legal",
      sources: [{ label: "MOFCOM 2025 No. 72", url: m("2024-46-2").url }],
      affects: (c) => (c.destination === "US" && c.items.some((i) => i.cn.materials.some((x) => ["gallium", "germanium", "antimony", "superhard", "graphite"].includes(x))) ? "China-origin Ga/Ge/Sb/superhard/graphite content to the US" : null),
    },
    {
      id: "cn-jp-ban",
      date: "2026-01-06",
      jurisdiction: "CN",
      kind: "takes_effect",
      title: "China bans dual-use items for Japanese military users and uses (2026 No. 1)",
      detail: m("2026-1").summary,
      certainty: "legal",
      sources: [{ label: "MOFCOM 2026 No. 1", url: m("2026-1").url }],
      affects: (c) => (c.items.some((i) => i.cn.materials.length > 0) && (c.shipFrom === "JP" || c.destination === "JP") ? "China-origin controlled materials in a Japan-linked transaction" : null),
    },
    {
      id: "cn-jp-lists-feb",
      date: "2026-02-24",
      jurisdiction: "CN",
      kind: "designation",
      title: "China lists 20 Japanese entities on the Control List and 20 on the Watch List",
      detail: "MOFCOM 2026 Nos. 11 and 12 — incl. MHI, IHI, NEC and Kawasaki defence units, JAXA (Control List) and SUBARU, TDK, Mitsubishi Materials, Sumitomo Heavy Industries, Nitto Denko (Watch List).",
      certainty: "legal",
      sources: [
        { label: "MOFCOM 2026 No. 11", url: "https://www.mofcom.gov.cn/zwgk/zcfb/art/2026/art_b5159a773124428a9813884015d1b8b3.html" },
        { label: "MOFCOM 2026 No. 12", url: "https://www.mofcom.gov.cn/zwgk/zcfb/art/2026/art_bac18400512d408a8d4c2f964e36ac11.html" },
      ],
    },
    {
      id: "cn-jp-lists-jun",
      date: "2026-06-29",
      jurisdiction: "CN",
      kind: "designation",
      title: "China lists 20 more Japanese entities on each of the Control List and Watch List",
      detail: "MOFCOM 2026 Nos. 27 and 28 — incl. Mitsubishi Electric defence units and research centres (Control List); OKI group, Komatsu, Hitachi Advanced Systems, Japan Nuclear Fuel (Watch List).",
      certainty: "legal",
      sources: [{ label: "MOFCOM 2026 No. 27", url: "https://www.mofcom.gov.cn/zwgk/zcfb/art/2026/art_df87be1437044874a35f85cf6e076f3d.html" }],
    },
    {
      id: "jp-catchall-2025",
      date: "2025-10-09",
      jurisdiction: "JP",
      kind: "takes_effect",
      title: "Japan's catch-all revision takes effect",
      detail: "16の項 split into （1）HS-designated sensitive goods and （2）; conventional-weapons end-user requirement added; Group A becomes subject to METI notification; End User List adds a conventional-weapons (CW) column.",
      certainty: "legal",
      sources: [{ label: "METI catch-all materials", url: "https://www.meti.go.jp/policy/anpo/law05.html" }],
    },
    {
      id: "jp-eul-2025",
      date: "2025-09-29",
      jurisdiction: "JP",
      kind: "list_revision",
      title: "METI End User List revised (835 entries, 15 countries/regions)",
      detail: "Applied from 2025-10-09; adds the conventional-weapons (CW) concern type.",
      certainty: "legal",
      sources: [{ label: "METI 20250929_4.xlsx", url: "https://www.meti.go.jp/policy/anpo/20250929_4.xlsx" }],
    },
    {
      id: "jp-list-2026-02-14",
      date: "2026-02-14",
      jurisdiction: "JP",
      kind: "takes_effect",
      title: "Japan: regime-list additions to 貨物等省令 take effect",
      detail: "Cabinet Order / ministerial ordinance promulgated 2025-11-14 implementing multilateral regime decisions.",
      certainty: "legal",
      sources: [{ label: "METI press release 2025-11-11", url: "https://www.meti.go.jp/press/2025/11/20251111001/20251111001.html" }],
    },
    {
      id: "kr-2026-09-01",
      date: "2026-09-01",
      jurisdiction: "KR",
      kind: "takes_effect",
      title: "South Korea adds national controls on AI chips and semiconductor equipment",
      detail: "Amended Public Notice on Trade of Strategic Items (MOTIR).",
      certainty: "legal",
      sources: [{ label: "MOTIR", url: "https://english.motir.go.kr" }],
    },
    {
      id: "eu-2026-annex-i",
      date: "2026-09-14",
      jurisdiction: "EU",
      kind: "list_revision",
      title: "EU adopts the 2026 update of the dual-use control list (in scrutiny period)",
      detail: "Commission Delegated Regulation C(2026)6323; enters into force after the two-month scrutiny period unless objected to. The 2025/2003 update is in force since 2025-11-15.",
      certainty: "announced",
      sources: [{ label: "European Commission", url: "https://policy.trade.ec.europa.eu/news/2026-update-eu-control-list-dual-use-items-2026-09-14_en" }],
    },
  ];
  return events.sort((a, b) => a.date.localeCompare(b.date));
}

export function exposure(cases: Case[]): Record<string, { caseId: string; ref: string; title: string; why: string }[]> {
  const out: Record<string, { caseId: string; ref: string; title: string; why: string }[]> = {};
  const open = cases.filter((c) => c.status === "draft" || c.status === "in_review" || c.status === "on_hold");
  for (const e of timeline()) {
    if (!e.affects) continue;
    for (const c of open) {
      const why = e.affects(c);
      if (why) (out[e.id] ??= []).push({ caseId: c.id, ref: c.ref, title: c.title, why });
    }
  }
  return out;
}
