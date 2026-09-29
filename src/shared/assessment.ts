// Output of the rules engine. Every finding carries the regulation it rests on.

export type Jurisdiction = "US" | "JP" | "CN";

export const JURISDICTION_LABEL: Record<Jurisdiction, string> = {
  US: "United States — EAR",
  JP: "Japan — FEFTA",
  CN: "China — Export Control Law",
};

/** Ordered from most to least severe. */
export type Outcome =
  | "prohibited"
  | "license_required"
  | "exception_available"
  | "incomplete"
  | "no_license_required"
  | "not_applicable";

export const OUTCOME_RANK: Record<Outcome, number> = {
  prohibited: 5,
  license_required: 4,
  exception_available: 3,
  incomplete: 2,
  no_license_required: 1,
  not_applicable: 0,
};

export function worst(...outcomes: Outcome[]): Outcome {
  return outcomes.reduce<Outcome>((a, b) => (OUTCOME_RANK[b] > OUTCOME_RANK[a] ? b : a), "not_applicable");
}

export type Status = "block" | "flag" | "incomplete" | "pass" | "info";

export interface Citation {
  /** Section id in the regulation library, e.g. "740.2", "746 Supp. 2", "jp:324CO0000000378:4". */
  section?: string;
  label: string; // "15 CFR 740.2(a)(12)" / "輸出令 第4条第1項第3号"
  url?: string;
}

export interface ChartCell {
  reason: string;
  column: string;
  x: boolean;
}

export interface Finding {
  id: string;
  status: Status;
  title: string;
  detail?: string;
  citations: Citation[];
  /** Structured evidence the UI can render (chart lookups, de minimis math, list hits…). */
  evidence?:
    | { kind: "chart"; country: string; cells: ChartCell[] }
    | { kind: "control"; eccn: string; scope: string; chart: string; applies: "yes" | "no" | "maybe"; columns: string[] }
    | { kind: "deminimis"; usContent: number; total: number; pct: number; threshold: number }
    | { kind: "screening"; partyId: string; entryId: string; list: string; name: string; score: number }
    | { kind: "text"; text: string };
  /** A question the reviewer must answer to resolve this finding. */
  question?: { id: string; text: string };
}

export interface ExceptionCandidate {
  code: string; // LVS, GBS, STA, ENC, TMP … / 少額特例, 包括許可
  name: string;
  basis: string; // why it surfaced (ECCN field text, country group)
  conditions: string[]; // what the exporter must confirm
  citations: Citation[];
  strength: "likely" | "possible";
}

export interface ItemAssessment {
  itemId: string;
  outcome: Outcome;
  summary: string;
  findings: Finding[];
  exceptions: ExceptionCandidate[];
}

export interface JurisdictionAssessment {
  jurisdiction: Jurisdiction;
  /** Why this regime attaches to the transaction (or why it does not). */
  nexus: { attaches: boolean | "unknown"; reasons: string[] };
  outcome: Outcome;
  summary: string;
  items: ItemAssessment[];
  /** Transaction-level findings: destination, parties, end use. */
  findings: Finding[];
  actions: string[];
}

export interface Assessment {
  caseId: string;
  computedAt: string;
  engineVersion: string;
  dataVersions: Record<string, string>;
  overall: Outcome;
  headline: string;
  jurisdictions: JurisdictionAssessment[];
  openQuestions: { id: string; text: string; jurisdiction: Jurisdiction }[];
}
