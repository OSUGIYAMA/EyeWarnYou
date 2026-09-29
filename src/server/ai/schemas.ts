// Structured-output schemas for the AI features. Every field is required (use "" / null / [] for
// unknowns) so the model must state explicitly when information is missing.
import { z } from "zod";

export const QueryPlan = z.object({
  terms_en: z.array(z.string()).describe("Technical English search terms for the Commerce Control List (component types, functions, key parameters)"),
  terms_ja: z.array(z.string()).describe("Japanese search terms as used in 輸出令別表第一 / 貨物等省令 (e.g. 集積回路, 暗号, 工作機械)"),
  likely_eccns: z.array(z.string()).describe("Up to 8 five-character ECCNs worth checking, e.g. 3A001, 5A002, 5A992"),
  likely_kou: z.array(z.string()).describe("Up to 4 項 of 輸出令別表第一 worth checking, e.g. 7, 9"),
});

const Parameter = z.object({
  parameter: z.string().describe("The control parameter, e.g. 'operating temperature range', 'total processing performance'"),
  threshold: z.string().describe("The threshold as stated in the regulation text"),
  reference: z.string().describe("Paragraph or article reference where the threshold appears, e.g. '3A001.a.2' or '貨物等省令 第6条第1項第1号イ'"),
  productValue: z.string().describe("The product's value for this parameter, or '' if not provided"),
  status: z.enum(["meets", "does_not_meet", "unknown"]),
});

export const Classification = z.object({
  us: z.object({
    eccn: z.string().describe("Five-character ECCN (e.g. 3A001) or 'EAR99'"),
    paragraph: z.string().describe("Most specific paragraph without the ECCN, e.g. 'a.2.c'; '' when EAR99 or entire entry"),
    confidence: z.enum(["high", "medium", "low"]),
    rationale: z.string().describe("Why this entry and paragraph, in 2–5 sentences, following the Order of Review"),
    parameters: z.array(Parameter),
    alternatives: z.array(z.object({ eccn: z.string(), paragraph: z.string(), why: z.string() })).describe("Other entries a reviewer should rule out"),
    missingInformation: z.array(z.string()).describe("Specific facts the reviewer must confirm"),
  }),
  jp: z.object({
    listStatus: z.enum(["listed", "not_listed", "uncertain"]),
    kou: z.string().describe("項番 as written in 輸出令別表第一, e.g. '7の項（1）'; '' if not listed"),
    ministerialReference: z.string().describe("貨物等省令 article / item, e.g. '第6条第1号イ'; '' if not listed"),
    confidence: z.enum(["high", "medium", "low"]),
    rationale: z.string(),
    parameters: z.array(Parameter),
    missingInformation: z.array(z.string()),
  }),
  hsCodeSuggestion: z.string().describe("Likely 6-digit HS code, or ''"),
  caveats: z.array(z.string()),
});
export type Classification = z.infer<typeof Classification>;

const Evidence = z.string().describe("Short verbatim quote from the document supporting the value, or ''");

export const ContractExtraction = z.object({
  title: z.string().describe("Short case title, e.g. 'Supply of spectrum analyzers to X Co.'"),
  contractRef: z.string(),
  shipFrom: z.string().describe("ISO 3166-1 alpha-2 country the goods ship from, or ''"),
  destination: z.string().describe("ISO 3166-1 alpha-2 country of ultimate destination, or ''"),
  incoterms: z.string(),
  shipDate: z.string().describe("YYYY-MM-DD or ''"),
  endUseDescription: z.string().describe("Stated end use, verbatim where possible"),
  parties: z.array(
    z.object({
      role: z.enum(["consignee", "end_user", "intermediate_consignee", "purchaser", "forwarder", "other"]),
      name: z.string(),
      country: z.string().describe("ISO alpha-2 or ''"),
      address: z.string(),
      evidence: Evidence,
    }),
  ),
  items: z.array(
    z.object({
      name: z.string(),
      model: z.string(),
      manufacturer: z.string(),
      description: z.string().describe("Technical description and any specifications stated"),
      quantity: z.number().nullable(),
      unitValue: z.number().nullable(),
      currency: z.string().describe("ISO 4217 code or ''"),
      hsCode: z.string(),
      countryOfOrigin: z.string().describe("ISO alpha-2 or ''"),
      statedClassification: z.string().describe("Any ECCN / 項番 / 'EAR99' stated in the document, or ''"),
      evidence: Evidence,
    }),
  ),
  concerns: z
    .array(z.object({ concern: z.string(), evidence: Evidence, severity: z.enum(["high", "medium", "low"]) }))
    .describe("Potential red flags: vague or military end use, reluctance to disclose end use, forwarder as final destination, unusual routing or payment, re-export clauses to sanctioned destinations, etc."),
  missing: z.array(z.string()).describe("Information needed for screening that the document does not state"),
});
export type ContractExtraction = z.infer<typeof ContractExtraction>;

export const Romanization = z.object({
  candidates: z.array(z.object({ name: z.string(), basis: z.string().describe("'official English name', 'pinyin', 'Hepburn', 'common transliteration' …") })),
});
