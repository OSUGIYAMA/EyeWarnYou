// Time-dependent policy status that is not (or not yet) reflected in the CFR text.
// Recorded as data so a new Federal Register notice can be captured without code changes.

export interface PolicyStatus {
  id: string;
  title: string;
  state: "stayed" | "not_enforced" | "pending";
  /** Provision is inactive until this date (inclusive); active again the day after. */
  inactiveUntil?: string;
  effectiveFrom?: string;
  summary: string;
  cites: string[];
  sources: { label: string; url: string }[];
}

export const POLICY_STATUS: PolicyStatus[] = [
  {
    id: "affiliates-rule",
    title: "Affiliates Rule (50% ownership extension of Entity List / MEU / §744.8 SDN restrictions)",
    state: "stayed",
    inactiveUntil: "2026-11-09",
    effectiveFrom: "2026-11-10",
    summary:
      "The 50% ownership extension (90 FR 47201) was stayed effective 2025-11-10 until 2026-11-09 (90 FR 50857). Absent a further extension it re-applies from 2026-11-10: foreign entities owned ≥50% (directly or indirectly, individually or in aggregate) by listed parties become subject to the same restrictions.",
    cites: ["744.11(a)(1)", "744.21(a)(3)", "744.8", "734.9(e)", "734.9(g)", "744 Supp. 8"],
    sources: [
      { label: "90 FR 50857 (stay)", url: "https://www.federalregister.gov/documents/2025/11/12/2025-19846" },
      { label: "90 FR 47201 (Affiliates Rule)", url: "https://www.federalregister.gov/documents/2025/09/30/2025-19001" },
    ],
  },
  {
    id: "ai-diffusion",
    title: "AI Diffusion Rule (worldwide 3A090.a / .z / 4E091 requirements, License Exceptions AIA/ACM/LPP)",
    state: "not_enforced",
    summary:
      "The text of 90 FR 4544 remains in the CFR, but BIS announced on 2025-05-13 that it will not be enforced (no rescission published). The engine applies the pre-rule scope (Country Groups D:1, D:4, D:5 excluding A:5/A:6) and flags the worldwide wording.",
    cites: ["742.6(a)(6)(iii)(A)", "742.6(a)(13)", "734.9(l)", "740.27", "740.28", "740.29"],
    sources: [
      { label: "GAO B-337935 (2026-05-12)", url: "https://www.gao.gov/products/b-337935" },
      { label: "BIS non-enforcement announcement (2025-05-13)", url: "https://www.bis.gov" },
    ],
  },
];

export function affiliatesRuleActive(onDate: string): boolean {
  const s = POLICY_STATUS.find((p) => p.id === "affiliates-rule")!;
  return !!s.effectiveFrom && onDate >= s.effectiveFrom;
}

export function daysUntil(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}
