# Methodology

This document explains how EyeWarnYou reaches a determination: how it decides which regimes attach to a transaction, how each regime is evaluated, how restricted-party screening works, where AI is (and is not) used, and what the system does not do. Section references are to 15 CFR (EAR), to 輸出貿易管理令 (輸出令) and its ordinances, and to MOFCOM announcements. The state of the law described here is as of **2026-09-29**; the engine reads the current text from its snapshots, and this document names the few rules that are encoded as data rather than derived.

- [1. The jurisdictional model](#1-the-jurisdictional-model)
- [2. United States — EAR](#2-united-states--ear)
- [3. Japan — FEFTA](#3-japan--fefta)
- [4. China — Export Control Law](#4-china--export-control-law)
- [5. Time](#5-time)
- [6. Restricted-party screening](#6-restricted-party-screening)
- [7. AI assistance](#7-ai-assistance)
- [8. Outcomes and aggregation](#8-outcomes-and-aggregation)
- [Limitations](#limitations)

---

## 1. The jurisdictional model

A regime can reach a transaction through three different connecting factors, and EyeWarnYou reports each separately:

| Nexus | Japan | United States | China |
|---|---|---|---|
| **Ship-from** — the export itself | Goods exported from Japan (外為法第48条) | Exports from the US (out of scope: EyeWarnYou models reexports) | Goods exported from China, e.g. by a Chinese subsidiary (出口管制法) |
| **Item-following** — the goods carry the regime with them | — | US-origin items; foreign-made items above the de minimis level; foreign direct products (§§734.3, 734.4, 734.9) | China-origin controlled items: end-user commitments (两用物项出口管制条例 第24条), extraterritorial end-use prohibitions (2024 No. 46, 2026 No. 1), the suspended 0.1% rule (2025 No. 61) |
| **Person-following** — the counterparty | METI End User List (需要者要件) | Entity List, MEU, UVL, Denied Persons, §744.8 SDNs; OFAC | Control List, Watch List, Unreliable Entity List, countermeasures |

Every jurisdiction module returns a `nexus` (`attaches: true | false | "unknown"`, with reasons), an outcome, per-item assessments, transaction-level findings and next steps. A regime that does not attach is shown as such with its reason — the absence of a requirement is itself a documented conclusion.

## 2. United States — EAR

The analysis follows the order of Part 732 ("Steps for using the EAR").

### 2.1 Is the item subject to the EAR?

- **US-origin items** are subject wherever located (§734.3(a)(2)).
- **Foreign-made items with US content** are subject if the value of *controlled* US content exceeds the de minimis level (§734.4). The reviewer enters the controlled US content value and the item value; EyeWarnYou computes the percentage against:
  - **10%** for destinations in Country Group E:1 or E:2 (§734.4(c)); **25%** elsewhere (§734.4(d));
  - **0%** where §734.4(a) removes de minimis: US-origin 9x515 or "600 series" .a–.x content to D:5, and .y content to E:1/E:2, Belarus, China or Russia (§734.4(a)(6)); US 5E002 encryption technology (§734.4(a)(2)); 0A919.a.1 content to D:5; 9E003 hot-section technology.
  - The guidance that only content that would itself need a license to the destination is counted (Supp. No. 2 to Part 734), and the partner-country rule that AT-only and EAR99 US content is not counted for Russia/Belarus when exporting from a Supp. No. 3 country such as Japan (§746.8(a)(12)(iii)(B)), are shown with the calculation.
- **Foreign direct products** are handled as a questionnaire (§734.9). A gate question asks whether the item is a direct product of US-origin technology/software or of a plant that is. If yes, only the FDP rules whose destination or party scope is met are asked — NS (b), 9x515 (c), 600 series (d), Entity List footnotes 1/4/5 (e), Russia/Belarus military end users (g), advanced computing (h), supercomputers (i). The Russia/Belarus/Crimea (f) and Iran (j) rules are omitted for exports from Supp. No. 3 partner countries, which are excluded from them.

An item whose jurisdiction cannot yet be determined makes the US nexus `unknown`; an item that is not subject to the EAR is reported as such and excluded from US requirements.

### 2.2 CCL × Commerce Country Chart (General Prohibitions 1–3)

Each ECCN's License Requirements table is parsed into rows of *reason for control*, *scope* and *Country Chart cell* (1,571 rows across 638 ECCNs). Two things make this non-trivial:

**Paragraph scope.** Many rows apply to part of an entry ("NS applies to 3A001.b.2 and b.3", "RS applies to entire entry except 9A610.b"). The parser classifies each row as `entire`, `except` or `only`, extracts the paragraph references that belong to *this* ECCN (references to other ECCNs, such as "the parameters in 3A201.b", are discarded), and flags rows whose scope carries a condition ("when usable in missiles", "except … for use in civil telecommunications"). With the item's paragraph (e.g. `b.2.a`), each row resolves to *applies*, *does not apply*, or *maybe* — the last becomes a question for the reviewer, whose answer is stored as an override.

**Chart cells that are not columns.** 1,271 rows resolve to Country Chart columns ("NS Column 2") and are looked up in the destination's row of Supp. No. 1 to Part 738. The other 299 state the requirement in prose. An interpreter handles the families catalogued across the whole CCL: worldwide requirements (§742.4(a)(5), §742.6(a)(10), §742.13, §742.14; "ALL destinations, except Canada"), encryption (§742.15), UN arms embargoes (§746.1(b), using the country list parsed from §746.1(b)(2)), Country-Group formulas ("UAE or D:1, D:4 and D:5 … excluding A:5 or A:6"), named destinations (China/Russia/Venezuela; Iraq/Pakistan; North Korea), Russia industry-sector rows (§746.8) and Footnote 5 party-dependent rows (§742.6(a)(11)). The AI Diffusion Rule's worldwide wording (§742.6(a)(6)(iii)(A), (a)(13)) is evaluated under the pre-rule scope and flagged, because BIS has announced it will not enforce it. 281 of the 299 prose rows are interpreted; 18 (short-supply controls, ITAR cross-references, empty source cells) are sent to the reviewer with the text.

### 2.3 Destinations (Part 746)

Applied on top of the CCL result:

- **Cuba, North Korea, Syria** — all items subject to the EAR (North Korea and Syria except EAR99 food and medicine) (§§746.2, 746.4, 746.9), with the licensing policy stated.
- **Iran** — CCL items with any Country Chart entry and EAR99 items in Supp. No. 7 to Part 746 by HTS code (§746.7), plus the OFAC embargo (31 CFR 560), which the EAR also enforces (§746.7(e)).
- **Russia and Belarus** — every item on the CCL, including AT-only items (§746.8(a)(1)); EAR99 items by HTS-6 prefix against Supp. No. 4 (industrial goods, 2,405 codes) and Supp. No. 5 (luxury goods, 363 codes); oil-and-gas end uses against Supp. No. 2; a prompt for Supp. No. 6 chemicals and EAR99 enterprise software (§746.8(a)(8)). The HTS lists are parsed from the supplements at sync time.
- **Occupied regions of Ukraine** (Crimea, "DNR", "LNR") — all items except EAR99 food and medicine (§746.6).
- **Iraq** — CCL items controlled for the reasons in §746.3(a)(1) and the RS ECCNs in §746.3(a)(3).

### 2.4 Parties and end uses (General Prohibitions 4–5, 10)

Screening hits are applied only after a reviewer confirms them:

| Confirmed list | Effect in EyeWarnYou | Basis |
|---|---|---|
| Denied Persons List | Prohibited | GP4, §736.2(b)(4) |
| Entity List | License requirement as stated in the entry (usually "all items subject to the EAR"); license exceptions only if the entry says so; FDP footnotes recorded | §§744.11, 744.16 |
| MEU List | License requirement for Supp. No. 2 to Part 744 items | §744.21 |
| Unverified List | UVL statement; no license exceptions | §§744.15, 740.2(a)(17) |
| OFAC SDN | §744.8 license requirement for the listed programmes (RUSSIA-EO14024, FTO, SDGT, NPWMD …); otherwise an OFAC exposure flag | §744.8; 31 CFR V |

Knowledge questions cover §744.2 (nuclear), §744.3 (missiles/UAVs), §744.4 (CBW), §744.21 (military end use/user in Belarus, Burma, Cambodia, China, Nicaragua, Russia, Venezuela — Supp. No. 2 items, or all items for Belarus and Russia), §744.22 (military-intelligence), §744.23 (supercomputers and advanced-node ICs) and §746.8(a)(4) (Russian oil and gas); each question is shown only where its destination scope makes it relevant. BIS's 29 "Know Your Customer" red flags (Supp. No. 3 to Part 732) are parsed verbatim; any red flag answered "yes" keeps the case incomplete until the reviewer records that the inquiry resolved it (GP10).

### 2.5 License exceptions (Part 740)

Exceptions are proposed only where the license requirement arises from the Country Chart — never to overcome Part 744, Part 746 or party-based requirements (§740.2(a); §740.20(b)(2)(i)). The §740.2 restrictions that remove exceptions (MT items, 600-series/9x515 to D:5, crime-control items outside NATO/AU/IN/JP/NZ, surreptitious-interception items, UVL parties, sanctioned destinations) are checked first. Then:

- **LVS** (§740.3): ECCN field gives a value; destination in Country Group B; net value per ECCN per order within the limit (converted at the configured rate).
- **GBS** (§740.4): "GBS: Yes"; Country Group B except Sudan and Ukraine; license required for NS reasons only.
- **STA** (§740.20): A:5 when all reasons are NS/CB/NP/RS/CC/SI, or A:6 for NS only; not for EI/SS/SL/CW/MT; the ECCN's STA paragraph is shown as a condition.
- **ENC** and the advanced-computing exceptions (NAC/ACA, ACM, AIA, HBM, LPP) where the ECCN field provides them — **only if the field covers the item's paragraph** (e.g. "Yes, for 3A001.z" does not surface for 3A001.b.2).

Candidates are presented with the conditions the exporter must confirm; the engine never concludes that an exception applies.

### 2.6 Dated policy status

Two rules are in the CFR text but not operative as written, and are recorded as data (`src/engine/us/status.ts`) so a new Federal Register notice can be captured without code changes:

- **Affiliates Rule** (90 FR 47201): stayed from 2025-11-10 until 2026-11-09 (90 FR 50857). For ship dates from 2026-11-10 the engine asks whether any party is ≥50% owned by listed entities and treats a "yes" as a §744.11 requirement.
- **AI Diffusion Rule** (90 FR 4544): announced as not enforced (2025-05-13); pre-rule scope applied, as above.

## 3. Japan — FEFTA

Japan attaches when goods are exported from Japan. The analysis follows the structure of 輸出令 第1条・第2条・第4条.

### 3.1 List control (別表第一 1–15の項)

A listed item (該当) needs a METI license for every destination (外為法第48条第1項, 輸出令第1条). The reviewer records the 項番 (e.g. `7の項（1）`); the 別表第一 rows and 貨物等省令 articles are parsed from e-Gov so the picker and the classification assistant use the current text. Items in 1の項 have no exceptions (輸出令第4条第1項 ただし書).

**Small-value exception** (少額特例, 輸出令第4条第1項第5号): available for 5–13の項 and 15の項 goods with a total value up to ¥1,000,000 — or ¥50,000 for goods in 別表第三の三 (all of 15の項, plus sub-items designated by METI notice; EyeWarnYou flags the notice-dependent cases) — except to countries of concern (別表第四: Iran, Iraq, North Korea). It is lost for Group A destinations if METI has issued a notification, and elsewhere if any WMD catch-all condition or a conventional-weapons notification applies (and, for UN arms-embargo destinations, any conventional-weapons condition). Values are converted to yen at the configured rate.

### 3.2 Catch-all (16の項, as revised on 2025-10-09)

Scope is determined from the HS code, using definitions parsed from the law: **16の項（1）** is the HS list in 貨物等省令第14条の2 (machine tools 84.56–84.61, radar 85.26, integrated circuits 85.42 except 8542.90, UAV-related 88.06/88.07/8802.60, navigation and measuring instruments 9014.20/.80, 9027.50, 9030.20/.32/.39); **16の項（2）** is HS Chapters 25–40, 54–59, 63, 68–93 and 95. The requirement then depends on the destination tier:

| Destination | 16の項（1） | 16の項（2） |
|---|---|---|
| **Group A** (別表第三, 27 countries) | METI notification only (輸出令第1条第3項, 第4条第2項第3号) | same |
| **UN arms embargo** (別表第三の二) | WMD: use, end user, notification · Conventional: use, end user, notification | same |
| **Other countries** | WMD: use, end user, notification · Conventional: use, end user, notification | WMD: use, end user, notification · Conventional: notification only |

- **WMD requirements** (核兵器等おそれ省令): documented or communicated use for WMD development or the nuclear activities in the ordinance's table (第1号); an end user that develops or developed WMD per designated documents or communications (第2号・第3号). A confirmed METI End User List hit with a WMD concern code (B/C/M/N) satisfies the end-user requirement.
- **Conventional-weapons requirements** (通常兵器おそれ省令, 2025 revision): documented use for conventional-weapons development (第1号) and, since 2025, an end user that develops, manufactures or uses conventional weapons (第2号・第3号). A confirmed End User List hit coded **CW** satisfies the latter. METI's own checklists ask whether the end user is a military or military-related body; EyeWarnYou phrases the question accordingly, and notes that this reading is inferred from METI's templates and bulk-license design rather than stated in the ordinance.
- **明らかガイドライン**: an end-user requirement is lifted if the reviewer records that it is *clear* the goods will not be used for the concerning purpose — except that, per guideline ⑲, this is not available for 16の項（1）goods to UN arms-embargo destinations, which the engine enforces.

### 3.3 Export approvals (外為法第48条第3項, 輸出令第2条)

- **Russia and Belarus**: goods in 別表第二の三 need approval (List-controlled goods always do); goods outside it still need approval in transactions with METI-designated persons (第1号の6・の7).
- **Diversion countries** (別表第二の四: UAE, Armenia, China, India, Kazakhstan, Kyrgyzstan, Syria, Thailand, Türkiye, Uzbekistan — parsed from the order): 別表第二の三 goods to designated persons (第1号の8).
- **Designated areas of Donetsk and Luhansk** (第1号の5) and **North Korea** (reported as prohibited).

## 4. China — Export Control Law

China attaches through any of the three nexus types. Because Chinese control codes reuse the Wassenaar format with different meanings (CN 3C001 is gallium; Wassenaar 3C001 is hetero-epitaxial materials), Chinese codes are kept in their own namespace and never matched against ECCNs.

- **Ship-from China**: an item on China's Dual-Use Items Export Control List needs a MOFCOM licence (Regs Arts. 13–17); China-origin materials under measures in force (gallium and germanium, graphite, antimony and superhard materials, tungsten/tellurium/bismuth/molybdenum/indium, the seven medium and heavy rare earths including SmCo and Tb/Dy-NdFeB magnets) require a licence; the catch-all (ECL Art. 12(3)) is asked; parties on the Watch List cannot be supplied under general licences.
- **China-origin items exported from elsewhere**: an end-user commitment makes onward transfer subject to MOFCOM consent (Regs Art. 24); supplying Japanese military users or uses, or anything enhancing Japan's military capability, is prohibited (2026 No. 1), as is supplying US military users (2024 No. 46 para. 1) — both measures state liability for foreign transferors; Control List designations since 2026 prohibit anyone from transferring China-origin dual-use items to the listed party.
- **The 0.1% rule** (2025 No. 61): for magnets and assemblies containing them, the China-origin rare-earth value share is recorded; the rule is evaluated as suspended until its legal end date and flagged from that date.
- **List effects** are applied according to the list, the designation date and the nexus: for a shipment not from China, UEL and countermeasure listings (which bind organizations in China) and pre-2026 Control List designations are reported as supply-chain and subsidiary risks rather than direct prohibitions on the exporter. Suspended or stopped designations are reported with MOFCOM's decision.

Measures and their status are recorded in `src/engine/cn/measures.ts` with announcement numbers and URLs; the designations themselves are parsed from MOFCOM's announcement pages (see [Data sources](data-sources.md)).

## 5. Time

Each case is evaluated **on its planned ship date** (today if none is set). This matters now because several rules have dated status:

| Rule | Status on 2026-09-29 | Engine behaviour |
|---|---|---|
| US Affiliates Rule | Stayed until 2026-11-09 | Ownership question and §744.11 requirement from 2026-11-10 |
| China 2025 Nos. 55–58, 61, 62 | Suspended until 2026-11-10 (legal); extension to 2027-01-10 agreed, not formalized | Inactive before 2026-11-10; active from that date with the political caveat shown |
| China 2024 No. 46 para. 2 | Suspended until 2026-11-27 | Surfaced for US destinations |
| China UEL 2025 No. 7, Control List 2025 No. 21 | Suspended until 2026-11-10 | Listings shown as suspended until that date |

The **Intelligence** view lists these and other dated events, and — because it can evaluate every open case against each event — shows which transactions a change would affect.

## 6. Restricted-party screening

Names on sanctions lists differ from names in contracts by legal form ("Co., Ltd."), punctuation, word order, transliteration and typos, while generic words ("technology", "trading", "international") appear in thousands of entries. The matcher is designed around both facts:

1. **Normalization**: Unicode NFKC, diacritics folded, legal-form tokens removed (a curated list across English, European, Russian, Japanese and Chinese forms), light plural folding; CJK names are tokenized into character bigrams after stripping 有限公司 / 株式会社 etc.
2. **Weighting**: each token is weighted by inverse document frequency over all list names, so distinctive tokens ("Huawei", "Rostec") dominate the score.
3. **Fuzzy tokens**: tokens of five or more characters may match with an optimal-string-alignment distance of about one edit per five characters (transpositions count as one edit). Fuzzy matches are discounted (average of edit ratio and Jaro-Winkler × 0.94) so they never score like exact matches; shorter tokens must match exactly.
4. **Score**: an F-beta combination (β² = 2, favouring recall) of IDF-weighted recall and precision between query and candidate names, over the primary name and every alias; country agreement adds 3 points and disagreement subtracts 7.
5. **Candidate generation** uses an inverted index with trigram expansion; very common tokens are used only when nothing else matches.

The default threshold for case screening is 85. Hits are stored on the case with the data date; the engine only acts on hits a reviewer has confirmed. See [Evaluation](evaluation.md) for recall by variant type and the false-positive check.

## 7. AI assistance

Claude (Opus 5 by default, configurable) is used for three drafting tasks, always grounded in text EyeWarnYou retrieves from its own snapshots:

- **Classification**: a low-effort planning call proposes search terms and likely entries; EyeWarnYou retrieves up to 12 candidate ECCNs (full text including notes) and the matching 貨物等省令 lines; a second call with adaptive thinking follows the Order of Review and returns, as structured output, the ECCN and paragraph, a per-parameter comparison (threshold, reference, product value, met / not met / unknown), alternatives to rule out, missing facts, and the Japanese 項番 with its ministerial-ordinance reference. EyeWarnYou then checks that the ECCN and paragraph exist in the current CCL and that the 項番 exists in 別表第一, and shows any failure as a verification warning. Applying the result sets the classification to *provisional*.
- **Document intake**: PDFs (including scans) are sent as documents; DOCX and text are extracted locally. The structured output includes a verbatim evidence quote for every party and item and a list of concerns; nothing is saved until the reviewer creates the case.
- **Ask the regulations**: the question is answered only from retrieved EAR and Japanese-law passages (and named ECCNs), which are numbered and must be cited.

Requests use the Messages API with server-side refusal fallback. Token usage is written to the audit log. The model's output never changes a determination directly — it fills fields that a reviewer can accept, edit or discard.

## 8. Outcomes and aggregation

Outcomes are ordered: **prohibited › license required › exception may apply › incomplete › no license required › not applicable**. An item's outcome in a regime is the most severe of its findings; a regime's outcome is the most severe across its items and transaction-level findings; the case outcome is the most severe across the regimes that attach. "Exception may apply" ranks above "incomplete" because a license requirement is already established; open questions remain listed. A case cannot be approved while it is incomplete or prohibited, and each decision records the outcome and data versions at that moment.

## Limitations

- **Classification is the user's responsibility.** The engine evaluates the consequences of a classification; the assistant only drafts one. Paragraph-level scope works best when the item is classified to the most specific paragraph.
- **Prose that the interpreter does not recognise** (18 CCL rows at present) is sent to review rather than evaluated.
- **Ownership is not modelled.** Public lists do not reveal 50% ownership; the engine asks the question when the Affiliates Rule is in force.
- **Not covered in depth**: ITAR (flagged only), deemed exports and technology transfer (a Japanese technology item is routed through the same list analysis with 外為法第25条 cited), US-person activity restrictions (§744.6), OFAC programmes beyond list hits, the bulk-license eligibility matrix (包括許可取扱要領), 別表第二の三 matching by HS code, and the METI notice (告示) that designates ¥50,000 small-value items.
- **Chinese lists** are compiled from MOFCOM's announcement pages. Coverage of countermeasure lists issued by the Ministry of Foreign Affairs (mostly individuals) is out of scope; status changes announced by spokesperson statements are recorded manually in the notice registry.
- **Exchange rates** for value thresholds are configured by the user.
- **Not legal advice.** EyeWarnYou supports, documents and speeds up a qualified reviewer's work; it does not replace legal judgment or government guidance.
