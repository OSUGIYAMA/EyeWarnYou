# Data sources

Kanmon keeps its own dated copy of every source so that an assessment can be reproduced later against the rules as they stood. `npm run sync` (or **Settings → Data**) fetches the sources, parses them, validates the result, diffs it against the previous copy, and records any differences as *detected changes*. Regulation snapshots are committed to the repository under `data/snapshots/`; the large US screening file is kept in `data/cache/` and downloaded on first run.

Every parser fails loudly rather than producing a partial dataset: each has minimum-count checks (for example, the Country Chart must yield at least 150 countries and the CCL at least 550 ECCNs) and every country name must resolve to an ISO code. When a parser changes how it reads unchanged text, the parser version in the manifest changes and that sync is treated as a re-baseline, so parser changes are never reported as regulatory changes.

## United States

| Dataset | Source | Parsed into | Notes |
|---|---|---|---|
| **EAR text**, Parts 730–774 | eCFR Versioner API (`/api/versioner/v1/full/{date}/title-15.xml?part=…`), latest issue date | `ear-library.json`: 267 sections and supplements as labelled paragraphs | The API requires `Accept-Encoding: gzip`. Supplement No. 1 to Part 774 (the CCL) and Supplement No. 4 to Part 744 (the Entity List) are served from dedicated datasets instead. |
| **Commerce Control List** | Part 774 Supp. No. 1 | `ear-ccl.json`: 638 ECCNs with heading, reasons for control, 1,571 control rows (scope mode, paragraph references, conditions, chart columns), list-based license exception fields, related controls, paragraph tree and notes | ECCN headings appear in several markup variants (`FP-2`/`FP-1` with `<B>`); section markers appear both as `HD1` and as `FP-1` wrapping `<E>`; some license requirements are stated as a "Control(s):" paragraph rather than a table; multi-line LVS values continue in the next paragraph. |
| **Commerce Country Chart** | Part 738 Supp. No. 1 | `ear-country-chart.json`: 200 countries × 16 columns, footnotes | Footnote markers are `<sup>` inside the country cell; country names include typos ("Seycheles") and variants ("Micronesia (Federated State of)") handled by an alias table. |
| **Country Groups** | Part 740 Supp. No. 1 | `ear-country-groups.json`: A:1–A:6, B, D:1–D:5, E:1–E:2 per country | Group B is a list (`<SCOL2><LI>`), not a table; the source spells "Cote d'lvoire" with a lower-case L. |
| **Derived lists** | Parsed from the text above | `ear-derived.json` | UN arms-embargo countries (§746.1(b)(2)); partner countries (746 Supp. No. 3); Russia/Belarus HTS-6 codes (746 Supps. 2, 4, 5, 7 — 29 / 2,405 / 363 / 53 codes); MEU items (744 Supp. No. 2 — 52 ECCNs) and destinations (§744.21(a)(1)); the 29 red flags (732 Supp. No. 3), verbatim. |
| **Consolidated Screening List** | trade.gov downloadable file (`data.trade.gov/downloadable_consolidated_screening_list/v1/consolidated.json`), no key | `data/cache/screening.json`: 26,144 entries across 12 lists | Entity List entries carry the license requirement, licence policy and Federal Register citation, which Kanmon shows on a hit. |

Known anomalies in the EAR text that the parsers tolerate: merged cells in the CCL (the chart column appears in the scope cell for 1C350), empty chart cells, "entireentry"-style typos, the stale §746.5 and License Exception CIV cross-references, and Entity List amendments that the eCFR could not incorporate (screen S2C Limited and Shanghai Micro Electronics Equipment manually).

## Japan

| Dataset | Source | Parsed into | Notes |
|---|---|---|---|
| **輸出貿易管理令** (law ID 324CO0000000378) | e-Gov 法令API v2 (`/api/2/law_data/{id}?law_full_text_format=xml`; the text is base64 XML) | Country lists: 別表第三 (Group A, 27), 別表第三の二 (UN arms embargo, 10), 別表第四 (concern, 3), 別表第二の四 (Russia diversion, 10), 別表第三の三 text; 別表第一 as 330 rows (項, sub-item, text, region); articles as library sections | Kanji numerals, `（十三の二）`-style sub-items and the numbered list inside 16の項（1） are normalized (`16の項（1）8`). |
| **貨物等省令** (403M50000400049) | e-Gov | 35 articles mapped to 項 (goods) or 外為令別表 項 (technology) by reading each article's opening sentence | Mapping by content, not arithmetic: 第1条 ↔ 2の項, 第2条の2 ↔ 3の2の項, 第14条の2 ↔ 16の項（1）. |
| **Derived catch-all scope** | 貨物等省令第14条の2 and 別表第一 16の項（2） | `jp-derived.json`: the HS headings/subheadings of 16の項（1）(with 8542.90 excluded) and the HS chapters of 16の項（2） | Parsed from kanji HS notation (`第八四・五六項`). |
| **外為法, 外為令, おそれ省令** (核兵器等: 413M60000400249; 通常兵器: 420M60000400057) | e-Gov | Library sections, including the ordinances' appended tables | The おそれ省令 have no article structure; the main provision is stored as a single section. |
| **外国ユーザーリスト** (End User List) | METI Excel, discovered from `meti.go.jp/policy/anpo/law00.html` (current: `20250929_4.xlsx`, 835 entries) | `jp-end-user-list.json` with concern codes B, C, M, N and CW | Codes are normalized for full-width letters, Japanese commas and missing line breaks. If METI's site is unreachable the bundled revision is kept. |

## China

| Dataset | Source | Parsed into | Notes |
|---|---|---|---|
| **MOFCOM designations** — Export Control Control List (出口管制管控名单), Watch List (关注名单), Unreliable Entity List (不可靠实体清单), countermeasures (反制清单) | 27 MOFCOM announcement pages (registry in `src/ingest/mofcom.ts`) | `cn-lists.json`: 270 entries with Chinese and English names, designating notice, date and status | China publishes no machine-readable list. Annexes are parsed from `n. 中文名（English name）` lines; prose designations ("决定将A（A Corp）、B（B Inc.）…列入不可靠实体清单") and Latin-only lists are parsed as a fallback. Suspensions and stops announced by MOFCOM (e.g. after the Kuala Lumpur arrangement) are recorded with their source. |
| **Commodity and end-use measures** | MOFCOM / GACC announcements | `src/engine/cn/measures.ts` (13 measures with dates, status, legal and political end dates) and the material map | Encoded as data from primary announcements; see the file for URLs. |

OpenSanctions maintains a hand-curated dataset of Chinese designations (`cn_sanctions`); Kanmon does not use it by default because its licence (CC BY-NC) does not cover commercial use.

## Versioning the regulatory baseline

Because regulation snapshots live in `data/snapshots/` under version control, a sync that picks up new text shows up as a change to those files. Committing them turns the repository history into a record of which rules were in force when — useful when an assessment has to be defended later. The screening cache (`data/cache/`) is excluded because it changes daily and is large; its date is still recorded in the manifest and on every assessment.

## Snapshot manifest

`data/snapshots/manifest.json` records, for each source, the date the data reflects (`asOf`: eCFR issue date, law revision date, list publication date), when it was fetched, the parser version, and entry counts. Every assessment stores these dates, and the printed Transaction Review Record lists them.
