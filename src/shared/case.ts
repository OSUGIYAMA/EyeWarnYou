// The transaction under review ("case") and everything the engine needs to assess it.
import { z } from "zod";

export const Iso2 = z.string().regex(/^[A-Z]{2}$/);

export const PartyRole = z.enum(["consignee", "end_user", "intermediate_consignee", "purchaser", "forwarder", "other"]);
export type PartyRole = z.infer<typeof PartyRole>;

export const Party = z.object({
  id: z.string(),
  role: PartyRole,
  name: z.string(),
  country: z.string().default(""),
  address: z.string().optional(),
  notes: z.string().optional(),
});
export type Party = z.infer<typeof Party>;

export const Disposition = z.enum(["pending", "cleared", "confirmed"]);
export type Disposition = z.infer<typeof Disposition>;

export const ScreeningHit = z.object({
  entryId: z.string(),
  list: z.string(),
  name: z.string(),
  matchedName: z.string(),
  score: z.number(),
  countries: z.array(z.string()).default([]),
  disposition: Disposition.default("pending"),
  note: z.string().optional(),
  by: z.string().optional(),
  at: z.string().optional(),
});
export type ScreeningHit = z.infer<typeof ScreeningHit>;

export const PartyScreening = z.object({
  partyId: z.string(),
  query: z.string(),
  ranAt: z.string(),
  dataAsOf: z.string(),
  threshold: z.number(),
  hits: z.array(ScreeningHit),
});
export type PartyScreening = z.infer<typeof PartyScreening>;

export const Answer = z.enum(["yes", "no", "unknown"]);
export type Answer = z.infer<typeof Answer>;

export const Currency = z.enum(["USD", "JPY", "EUR", "CNY", "GBP", "KRW", "TWD"]);
export type Currency = z.infer<typeof Currency>;

export const UsOrigin = z.enum(["us_origin", "foreign_with_us_content", "foreign_no_us_content", "unknown"]);

export const ItemUs = z.object({
  /** Where the item stands relative to US jurisdiction (15 CFR 734.3). */
  origin: UsOrigin.default("unknown"),
  /** Value of US-origin controlled content incorporated (same currency as the item value). */
  usContentValue: z.number().nonnegative().optional(),
  /** Classifications of the incorporated US content, for de minimis exclusions (e.g. 9A515, 3A090). */
  usContentEccns: z.array(z.string()).default([]),
  /** Foreign Direct Product rule questionnaire (15 CFR 734.9); key = rule id. */
  fdp: z.record(z.string(), Answer).default({}),
  /** "3A001", "EAR99", or empty when not yet classified. */
  eccn: z.string().default(""),
  /** Paragraph within the ECCN, e.g. "b.2" — enables paragraph-scoped reasons for control. */
  paragraph: z.string().default(""),
  classification: z.enum(["confirmed", "provisional", "unclassified"]).default("unclassified"),
  classificationBasis: z.string().optional(),
  /** Reviewer overrides of whether a control row applies (index into ECCN.controls). */
  controlOverrides: z.record(z.string(), z.boolean()).default({}),
});
export type ItemUs = z.infer<typeof ItemUs>;

export const ItemJp = z.object({
  /** 該非判定 against 輸出令別表第一 1–15項. */
  listStatus: z.enum(["listed", "not_listed", "unclassified"]).default("unclassified"),
  /** e.g. "8の項（1）" — the 項番 the item falls under when listed. */
  kou: z.string().default(""),
  /**
   * Catch-all scope under 別表第一16の項: "16-1" (HS-designated sensitive goods, 貨物等省令第14条の2),
   * "16-2" (HS Ch. 25–40, 54–59, 63, 68–93, 95), "out_of_scope", or "unknown" (derived from the HS code when blank).
   */
  catchAllScope: z.enum(["16-1", "16-2", "out_of_scope", "unknown"]).default("unknown"),
  /** Whether the goods fall under 別表第二の三 (Russia/Belarus export-approval list). */
  appendix2_3: z.enum(["yes", "no", "unknown"]).default("unknown"),
  classificationBasis: z.string().optional(),
});
export type ItemJp = z.infer<typeof ItemJp>;

export const ItemCn = z.object({
  /** Classification against China's Dual-Use Items Export Control List (relevant when exporting from China). */
  listStatus: z.enum(["listed", "not_listed", "unclassified"]).default("unclassified"),
  /** Chinese dual-use list code (e.g. "3C001"), namespaced — never compare with ECCNs. */
  cnCode: z.string().default(""),
  /** China-origin controlled materials incorporated or supplied (ids from CN_MATERIALS). */
  materials: z.array(z.string()).default([]),
  /** Share of China-origin controlled rare-earth content by value, 0–100 (2025 No. 61 test). */
  cnControlledContentPct: z.number().min(0).max(100).optional(),
});
export type ItemCn = z.infer<typeof ItemCn>;

export const Item = z.object({
  id: z.string(),
  name: z.string(),
  model: z.string().optional(),
  manufacturer: z.string().optional(),
  description: z.string().optional(),
  kind: z.enum(["commodity", "software", "technology"]).default("commodity"),
  quantity: z.number().positive().default(1),
  unitValue: z.number().nonnegative().optional(),
  currency: Currency.default("USD"),
  hsCode: z.string().optional(),
  countryOfOrigin: z.string().default(""),
  us: ItemUs.default(ItemUs.parse({})),
  jp: ItemJp.default(ItemJp.parse({})),
  cn: ItemCn.default(ItemCn.parse({})),
});
export type Item = z.infer<typeof Item>;

export const CaseStatus = z.enum(["draft", "in_review", "approved", "rejected", "on_hold"]);
export type CaseStatus = z.infer<typeof CaseStatus>;

export const ReviewEvent = z.object({
  at: z.string(),
  by: z.string(),
  action: z.enum(["created", "submitted", "approved", "rejected", "on_hold", "reopened", "comment"]),
  note: z.string().optional(),
  /** Snapshot of the assessment outcome at decision time (for the audit trail). */
  outcome: z.string().optional(),
  dataVersions: z.record(z.string(), z.string()).optional(),
});
export type ReviewEvent = z.infer<typeof ReviewEvent>;

export const Case = z.object({
  id: z.string(),
  ref: z.string(),
  title: z.string(),
  status: CaseStatus.default("draft"),
  shipFrom: z.string().default("JP"),
  destination: z.string().default(""),
  /** Sub-national region with its own regime (e.g. "UA-CRIMEA", "UA-DNR", "UA-LNR"). */
  destinationRegion: z.string().default(""),
  transitCountries: z.array(z.string()).default([]),
  exporter: z.string().default(""),
  contractRef: z.string().default(""),
  incoterms: z.string().default(""),
  shipDate: z.string().default(""),
  endUseDescription: z.string().default(""),
  items: z.array(Item).default([]),
  parties: z.array(Party).default([]),
  screenings: z.record(z.string(), PartyScreening).default({}),
  /** End-use / end-user / red-flag questionnaire answers, keyed by question id. */
  answers: z.record(z.string(), Answer).default({}),
  notes: z.string().default(""),
  review: z.array(ReviewEvent).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.string().default(""),
});
export type Case = z.infer<typeof Case>;

export const CaseInput = Case.omit({ id: true, ref: true, createdAt: true, updatedAt: true, review: true }).partial().extend({
  title: z.string().min(1),
});
export type CaseInput = z.infer<typeof CaseInput>;
