// China's commodity-specific export controls and end-use measures, with dated status.
// Sources are MOFCOM / GACC announcements (see url). Status reflects MOFCOM decisions through
// 2026-09-29; "politicalUntil" records an agreed extension not yet issued as a legal instrument.

export interface CnMeasure {
  id: string;
  title: string;
  announcement: string;
  published: string;
  effective: string;
  status: "in_force" | "suspended";
  /** Suspended until (legal text). */
  legalUntil?: string;
  /** Extension agreed politically but not (yet) formalized. */
  politicalUntil?: string;
  extraterritorial?: boolean;
  summary: string;
  url: string;
}

export const CN_MEASURES: CnMeasure[] = [
  { id: "2023-23", title: "Gallium and germanium items", announcement: "MOFCOM/GACC Announcement 2023 No. 23", published: "2023-07-03", effective: "2023-08-01", status: "in_force", summary: "Export license required for gallium and germanium metals, compounds (GaN, Ga2O3, GaAs, GeO2, GeCl4…), wafers and epitaxial materials (CN 3C001, 3C002).", url: "https://aqygzj.mofcom.gov.cn/qdml/art/2023/art_c2ae3d2061e14e97ba608de1ed565f78.html" },
  { id: "2023-39", title: "Graphite items", announcement: "MOFCOM/GACC Announcement 2023 No. 39", published: "2023-10-20", effective: "2023-12-01", status: "in_force", summary: "Export license required for high-purity synthetic graphite and natural flake graphite and products, incl. spherical and expanded graphite (CN 1C108).", url: "https://aqygzj.mofcom.gov.cn/qdml/art/2023/art_28aca48820d94a1ca822047d6716c1d6.html" },
  { id: "2024-33", title: "Antimony and superhard materials", announcement: "MOFCOM/GACC Announcement 2024 No. 33", published: "2024-08-15", effective: "2024-09-15", status: "in_force", summary: "Export license required for antimony ores, metal, oxides and related technology, and superhard-material equipment and materials (CN 3C003, 2A901, 2B901, 2C901 …).", url: "https://www.mofcom.gov.cn/zwgk/zcfb/art/2024/art_a4711acb06364199a3c5a06d7f2be6d8.html" },
  { id: "2024-46-1", title: "United States — military users and uses", announcement: "MOFCOM Announcement 2024 No. 46, para. 1", published: "2024-12-03", effective: "2024-12-03", status: "in_force", extraterritorial: true, summary: "Export of all dual-use items to US military users or military uses is prohibited. Organizations and individuals anywhere that transfer China-origin dual-use items to US persons in violation are liable.", url: "https://www.mofcom.gov.cn/zwgk/zcfb/art/2024/art_3d5e990b43424e60828030f58a547b60.html" },
  { id: "2024-46-2", title: "United States — Ga/Ge/Sb/superhard denial; graphite scrutiny", announcement: "MOFCOM Announcement 2024 No. 46, para. 2", published: "2024-12-03", effective: "2024-12-03", status: "suspended", legalUntil: "2026-11-27", summary: "Presumptive denial of gallium, germanium, antimony and superhard-material exports to the US; stricter end-use review for graphite. Suspended by 2025 No. 72.", url: "https://www.mofcom.gov.cn/zwgk/zcfb/art/2025/art_5c68985a6b1a46778e2e8dbff1bb1601.html" },
  { id: "2025-10", title: "Tungsten, tellurium, bismuth, molybdenum, indium", announcement: "MOFCOM/GACC Announcement 2025 No. 10", published: "2025-02-04", effective: "2025-02-04", status: "in_force", summary: "Export license required for specified tungsten, tellurium, bismuth, molybdenum and indium items and technologies.", url: "https://www.mofcom.gov.cn/zwgk/zcfb/art/2025/art_e623090907fc4e1092f0a4db72f57b95.html" },
  { id: "2025-18", title: "Seven medium and heavy rare earths", announcement: "MOFCOM/GACC Announcement 2025 No. 18", published: "2025-04-04", effective: "2025-04-04", status: "in_force", summary: "Export license required for Sm, Gd, Tb, Dy, Lu, Sc and Y metals, alloys, oxides and compounds, targets, SmCo magnets and Tb/Dy-containing NdFeB magnets (CN 1C902–1C908). Deep-processed products (motors, rotor assemblies, sensors) are generally out of scope per MOFCOM FAQs.", url: "https://aqygzj.mofcom.gov.cn/flzc/gzjgfxwj/art/2025/art_f3a1432ba20248eca12ff7b91bc73fda.html" },
  { id: "2025-57", title: "Five further rare earths (Ho, Er, Tm, Eu, Yb)", announcement: "MOFCOM/GACC Announcement 2025 No. 57", published: "2025-10-09", effective: "2025-11-08", status: "suspended", legalUntil: "2026-11-10", politicalUntil: "2027-01-10", summary: "Would add Ho, Er, Tm, Eu, Yb (CN 1C909–1C913). Suspended by 2025 No. 70 before taking effect.", url: "https://www.mofcom.gov.cn/zwgk/zcfb/art/2025/art_59ec4f6bec0b459aa4a30c4bbd0a41c1.html" },
  { id: "2025-58", title: "Lithium batteries, cathode and graphite anode materials", announcement: "MOFCOM/GACC Announcement 2025 No. 58", published: "2025-10-09", effective: "2025-11-08", status: "suspended", legalUntil: "2026-11-10", politicalUntil: "2027-01-10", summary: "Would control high-energy-density Li-ion batteries, cathode materials and artificial-graphite anode materials and equipment. Suspended before taking effect.", url: "https://www.mofcom.gov.cn/zwgk/zcfb/art/2025/art_79646f0161564975a938fe00fee158d5.html" },
  { id: "2025-61", title: "Foreign-made rare-earth items (0.1% de minimis / FDP)", announcement: "MOFCOM Announcement 2025 No. 61", published: "2025-10-09", effective: "2025-12-01", status: "suspended", legalUntil: "2026-11-10", politicalUntil: "2027-01-10", extraterritorial: true, summary: "Would require a MOFCOM license for exports from third countries of foreign-made magnets and parts, components and assemblies containing them when China-origin controlled rare earths are ≥0.1% of value, or when made with China-origin rare-earth technology. Paragraphs 1(1)–(2) never took effect; suspended by 2025 No. 70.", url: "https://www.mofcom.gov.cn/zwgk/zcfb/art/2025/art_7fc9bff0fb4546ecb02f66ee77d0e5f6.html" },
  { id: "2025-62", title: "Rare-earth technologies", announcement: "MOFCOM Announcement 2025 No. 62", published: "2025-10-09", effective: "2025-10-09", status: "suspended", legalUntil: "2026-11-10", politicalUntil: "2027-01-10", extraterritorial: true, summary: "Controls rare-earth mining, separation, smelting, magnet manufacturing and recycling technology, including provision inside China to foreign persons. Suspended 2025-11-07.", url: "https://www.mofcom.gov.cn/zwgk/zcfb/art/2025/art_6cb42957741440c6984de696b70df9ae.html" },
  { id: "2026-1", title: "Japan — military users, uses and military capability", announcement: "MOFCOM Announcement 2026 No. 1", published: "2026-01-06", effective: "2026-01-06", status: "in_force", extraterritorial: true, summary: "Export of all dual-use items to Japanese military users, military uses, and any other end user or use that helps enhance Japan's military capability is prohibited. Organizations and individuals anywhere that transfer China-origin dual-use items to Japanese persons in violation are liable.", url: "https://www.mofcom.gov.cn/zwgk/zcfb/art/2026/art_8990fedae8fa462eb02cc9bae5034e91.html" },
  { id: "2026-34", title: "United States — drone items", announcement: "MOFCOM Announcement 2026 No. 34", published: "2026-08-05", effective: "2026-08-05", status: "in_force", summary: "Strict case-by-case review of drone-related dual-use items to the US; no general licences or facilitation.", url: "https://aqygzj.mofcom.gov.cn/flzc/gzjgfxwj/art/2026/art_38af07adecf3422093fe0976cd05a329.html" },
];

export interface CnMaterial {
  id: string;
  label: string;
  code: string;
  measure: string;
  magnet?: boolean;
  /** Listed in Annex 1 Part 1 of 2025 No. 61 (China-origin content counted toward the 0.1% test). */
  no61Part1?: boolean;
}

export const CN_MATERIALS: CnMaterial[] = [
  { id: "gallium", label: "Gallium (Ga) and compounds", code: "3C001", measure: "2023-23" },
  { id: "germanium", label: "Germanium (Ge) and compounds", code: "3C002", measure: "2023-23" },
  { id: "graphite", label: "Graphite (synthetic, natural flake, spherical)", code: "1C108", measure: "2023-39" },
  { id: "antimony", label: "Antimony (Sb)", code: "3C003", measure: "2024-33" },
  { id: "superhard", label: "Superhard materials (synthetic diamond, cBN)", code: "2C901", measure: "2024-33" },
  { id: "tungsten", label: "Tungsten (W) items", code: "1C117", measure: "2025-10" },
  { id: "tellurium", label: "Tellurium (Te) items", code: "6C002", measure: "2025-10" },
  { id: "bismuth", label: "Bismuth (Bi) items", code: "6C001", measure: "2025-10" },
  { id: "molybdenum", label: "Molybdenum (Mo) items", code: "1C004", measure: "2025-10" },
  { id: "indium", label: "Indium (In) items", code: "3C004", measure: "2025-10" },
  { id: "samarium", label: "Samarium (Sm)", code: "1C902", measure: "2025-18", no61Part1: true },
  { id: "gadolinium", label: "Gadolinium (Gd)", code: "1C903", measure: "2025-18", no61Part1: true },
  { id: "terbium", label: "Terbium (Tb)", code: "1C904", measure: "2025-18", no61Part1: true },
  { id: "dysprosium", label: "Dysprosium (Dy)", code: "1C905", measure: "2025-18", no61Part1: true },
  { id: "lutetium", label: "Lutetium (Lu)", code: "1C906", measure: "2025-18", no61Part1: true },
  { id: "scandium", label: "Scandium (Sc)", code: "1C907", measure: "2025-18", no61Part1: true },
  { id: "yttrium", label: "Yttrium (Y)", code: "1C908", measure: "2025-18", no61Part1: true },
  { id: "smco-magnet", label: "SmCo magnets", code: "1C902", measure: "2025-18", magnet: true, no61Part1: true },
  { id: "ndfeb-tbdy", label: "NdFeB magnets containing Tb or Dy", code: "1C904 / 1C905", measure: "2025-18", magnet: true, no61Part1: true },
  { id: "holmium", label: "Holmium, erbium, thulium, europium, ytterbium", code: "1C909–1C913", measure: "2025-57" },
  { id: "li-battery", label: "High-energy Li-ion cells / cathode / graphite anode", code: "CN 3A001 / 3C901", measure: "2025-58" },
];

export type MeasureState = { active: boolean; note: string };

/** Whether a measure is operative on a date, given legal suspension dates. */
export function measureState(m: CnMeasure, onDate: string): MeasureState {
  if (m.status === "in_force") return { active: onDate >= m.effective, note: `In force since ${m.effective}` };
  if (m.legalUntil && onDate >= m.legalUntil)
    return {
      active: true,
      note: `Suspension ends ${m.legalUntil} under the legal text${m.politicalUntil ? `; MOFCOM said on 2026-09-28 it would extend to ${m.politicalUntil}, but no amending announcement has been published` : ""}`,
    };
  return { active: false, note: `Suspended until ${m.legalUntil}${m.politicalUntil ? ` (extension to ${m.politicalUntil} agreed, pending legal instrument)` : ""}` };
}
