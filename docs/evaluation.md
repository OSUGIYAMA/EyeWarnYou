# Evaluation

Three questions matter for a tool like this: does it read the regulations correctly, does it find the parties it should (without drowning reviewers in false positives), and does the rules engine reach the conclusions a specialist would? Each is measured below. Everything here is reproducible:

```bash
npm run evaluate   # parser coverage and the screening benchmark → docs/evaluation-results.json
npm test           # 69 scenario and unit tests
```

Figures are for the snapshots dated 2026-09-24 (eCFR), 2026-06-05 (輸出令), 2026-09-29 (Consolidated Screening List), 2025-09-29 (METI End User List) and 2026-08-05 (latest MOFCOM designation).

## 1. Reading the Commerce Control List

The rules engine can only be as good as its reading of each ECCN's License Requirements table.

| | Rows | Share |
|---|---:|---:|
| Control rows across 638 ECCNs | 1,571 | 100% |
| Resolved to Commerce Country Chart columns | 1,271 | 80.9% |
| Stated in prose, interpreted by rule family | 281 | 17.9% |
| Stated in prose, sent to the reviewer | 18 | 1.1% |

The rows sent to review are short-supply controls that point to Part 754, ITAR cross-references and rows whose source cell is empty. Scope parsing classifies rows as applying to the entire entry (1,119), to the entire entry except named paragraphs (116, of which 9 carry a condition) or only to named paragraphs (336, of which 194 carry a condition such as an end-use carve-out). Conditional rows become questions for the reviewer rather than assumptions.

The interpreter was built from a census of every distinct Country Chart phrasing in the CCL (worldwide requirements, encryption, UN embargoes, Country-Group formulas, named destinations, Russia industry-sector rows, Footnote 5 party-dependent rows, AI Diffusion Rule wording). A row counts as interpreted only if the interpreter returns a determination for all nine probe destinations (CN, RU, DE, IN, AE, MO, KP, IQ, CA).

## 2. Restricted-party screening

**Benchmark.** 400 entities were sampled (fixed seed) from the Entity List, MEU List, Denied Persons List, Unverified List, METI End User List and MOFCOM's Control and Watch Lists, restricted to names with at least two significant tokens. For each, query variants were generated the way names drift between a sanctions list and a contract, and the matcher was asked whether the correct entry appears among results scoring ≥ 85 (the default threshold).

| Variant | Queries | Recall at ≥ 85 | Correct entry ranked first |
|---|---:|---:|---:|
| Exact name | 400 | 100.0% | 100.0% |
| Upper-cased | 400 | 100.0% | 100.0% |
| Legal form dropped ("Co., Ltd.", "JSC" …) | 146 | 99.3% | 99.3% |
| First two words swapped | 270 | 97.8% | 97.8% |
| One typo (adjacent transposition in a word of ≥ 7 letters) | 336 | 87.5% | 87.5% |

**False positives.** 62 large companies that are not on the US lists under these names (Japanese, European, Korean, Taiwanese, Indian, US and ASEAN multinationals) were screened against the twelve US lists at ≥ 85. One produced a hit: *General Electric Company* against the Entity List's *General Electronic* (90.8) — a genuine near-match that a reviewer clears in seconds.

**What the benchmark taught us.** The first version measured Levenshtein distance, which counts a transposition as two edits; typo recall was **33.3%**. Switching to optimal-string-alignment distance (a transposition is one edit) raised it to **87.5%** with no change to the false-positive result. The remaining typo misses are concentrated in names whose only distinctive word is short, where exact matching is deliberately required to avoid false positives like *Sony* → *Sona*.

**Limits of the benchmark.** Variants are synthetic; transliteration differences between Cyrillic, Chinese or Arabic sources and their Latin renderings, and names that share generic words with listed entities, are harder than this benchmark suggests. The benchmark does not measure ownership (50%) exposure, which is not visible in the lists.

## 3. Rules-engine scenarios

The test suite encodes scenarios whose expected result was derived by hand from the regulation text, using the real snapshots rather than fixtures. A selection:

| Scenario | Expected | Basis |
|---|---|---|
| Foreign-made item, 20% controlled US content, to China | Not subject to the EAR | §734.4(d) — 25% |
| 12% US content to Iran | Subject to the EAR | §734.4(c) — 10% for E:1/E:2 |
| Any US 9A515 content to a D:5 destination | Subject to the EAR | §734.4(a)(6)(i) — no de minimis |
| 3A001.a.2 to Germany / to Brazil | NLR / license required with LVS and GBS candidates | NS2 column; §§740.3, 740.4 (Group B, NS-only) |
| 3A001.b.2 MMIC to South Korea | NS1 row needs confirmation (civil-telecom carve-out); once confirmed, STA candidate | CCL scope; §740.20(c)(1) (A:5) |
| 3A001.b.2 — exceptions limited to 3A001.z | NAC/ACA, AIA not offered | ECCN license-exception field scope |
| 3A991 to China with military end-use knowledge | License required | §744.21, Supp. No. 2 to Part 744 |
| EAR99 laptops (HTS 8471.30) to Russia | License required | §746.8(a)(5), Supp. No. 4 to Part 746 |
| Any CCL item to Russia, including AT-only | License required | §746.8(a)(1) |
| Confirmed Entity List party (Huawei), EAR99 item | License required | §744.11 |
| Confirmed Denied Persons List party | Prohibited | GP4 |
| Red flag present, not resolved | Incomplete | Supp. No. 3 to Part 732; GP10 |
| Ship date before / from 2026-11-10 | Affiliates Rule reported as stayed / ownership question required | 90 FR 50857 |
| HS 8542.31 / 8542.90 / 8471.30 / 0901.11 | 16の項（1） / （2） / （2） / outside | 貨物等省令第14条の2; 別表第一 16の項 |
| Listed 7の項（1）, ¥500,000, to Korea | License required; small-value exception candidate | 輸出令第4条第1項第5号 |
| Listed 15の項, ¥60,000 | No small-value exception (¥50,000 limit) | 別表第三の三 |
| 16の項（1）to China with a military end user | Catch-all license | 通常兵器おそれ省令 第2号・第3号 |
| 16の項（2）to China with a military end user / to Libya | No license / license | Conventional end-user requirement: UN arms-embargo destinations only for 16の項（2） |
| 16の項（1）to Libya, reviewer claims "clearly unrelated" | License still required | 明らかガイドライン ⑲ |
| Group A destination with a METI notification | License required | 輸出令第1条第3項 |
| Listed goods to Russia | Export approval required | 輸出令第2条, 別表第二の三 |
| China-origin gallium in a transfer for Japanese military use | Prohibited | MOFCOM 2026 No. 1 |
| Magnets with 2% China-origin rare-earth content, ship date 2026-09-29 / 2026-11-10 | No requirement / licence may be required | MOFCOM 2025 No. 61 suspended until 2026-11-10 (No. 70) |
| Chinese subsidiary exporting to a Watch-listed Japanese customer (TDK) | Watch List flag; licence required for gallium | Dual-Use Items Regulations Art. 26; 2023 No. 23 |

Parser unit tests cover scope extraction (including references to other ECCNs that must be ignored), the merged-cell anomaly in 1C350, license-exception value parsing, kanji numerals, MOFCOM annex and prose designations, and the screening normalizer.

## 4. What is not evaluated here

- **AI output quality.** The classification assistant and document intake depend on the model and the inputs; their outputs are drafts, verified structurally (ECCN / paragraph / 項番 existence) but not scored against a labelled set. A labelled classification benchmark — datasheets with specialist-confirmed ECCNs and 項番 — is the most valuable next step.
- **End-to-end reviewer time**, and agreement with experienced reviewers on real transactions.
