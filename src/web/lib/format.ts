import type { Outcome, Status } from "@/shared/assessment.ts";

export const OUTCOME: Record<Outcome, { label: string; short: string; tone: Tone }> = {
  prohibited: { label: "Prohibited", short: "Prohibited", tone: "red" },
  license_required: { label: "License required", short: "License", tone: "orange" },
  exception_available: { label: "Exception may apply", short: "Exception", tone: "amber" },
  incomplete: { label: "Incomplete", short: "Incomplete", tone: "gray" },
  no_license_required: { label: "No license required", short: "NLR", tone: "green" },
  not_applicable: { label: "Not applicable", short: "N/A", tone: "neutral" },
};

export const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  in_review: "In review",
  approved: "Approved",
  rejected: "Rejected",
  on_hold: "On hold",
};

export type Tone = "red" | "orange" | "amber" | "green" | "blue" | "violet" | "gray" | "neutral";

export const TONE_CLASSES: Record<Tone, string> = {
  red: "bg-red-soft text-red-text ring-red/20",
  orange: "bg-orange-soft text-orange-text ring-orange/20",
  amber: "bg-amber-soft text-amber-text ring-amber/25",
  green: "bg-green-soft text-green-text ring-green/20",
  blue: "bg-accent-soft text-accent-text ring-accent/20",
  violet: "bg-violet-soft text-violet ring-violet/20",
  gray: "bg-panel-2 text-fg-2 ring-line-strong",
  neutral: "bg-panel-2 text-fg-3 ring-line",
};

export const TONE_DOT: Record<Tone, string> = {
  red: "bg-red",
  orange: "bg-orange",
  amber: "bg-amber",
  green: "bg-green",
  blue: "bg-accent",
  violet: "bg-violet",
  gray: "bg-fg-3",
  neutral: "bg-line-strong",
};

export const STATUS_TONE: Record<Status, Tone> = {
  block: "red",
  flag: "amber",
  incomplete: "gray",
  pass: "green",
  info: "blue",
};

export function relTime(iso: string): string {
  const d = Date.now() - Date.parse(iso);
  const m = Math.round(d / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function fmtDate(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

export const LIST_NAMES: Record<string, { name: string; agency: string; tone: Tone }> = {
  EL: { name: "Entity List", agency: "BIS", tone: "red" },
  MEU: { name: "Military End-User List", agency: "BIS", tone: "red" },
  UVL: { name: "Unverified List", agency: "BIS", tone: "amber" },
  DPL: { name: "Denied Persons List", agency: "BIS", tone: "red" },
  SDN: { name: "SDN List", agency: "OFAC", tone: "red" },
  SSI: { name: "Sectoral Sanctions", agency: "OFAC", tone: "orange" },
  ISN: { name: "Nonproliferation Sanctions", agency: "State", tone: "orange" },
  DTC: { name: "ITAR Debarred", agency: "State", tone: "orange" },
  CMIC: { name: "Chinese Military-Industrial Complex", agency: "OFAC", tone: "orange" },
  "NS-MBS": { name: "Menu-Based Sanctions", agency: "OFAC", tone: "orange" },
  PLC: { name: "Palestinian Legislative Council", agency: "OFAC", tone: "gray" },
  CAP: { name: "CAPTA List", agency: "OFAC", tone: "gray" },
  "METI-EUL": { name: "End User List (外国ユーザーリスト)", agency: "METI", tone: "violet" },
  "CN-ECL": { name: "Export Control Control List (管控名单)", agency: "MOFCOM", tone: "red" },
  "CN-WL": { name: "Watch List (关注名单)", agency: "MOFCOM", tone: "amber" },
  "CN-UEL": { name: "Unreliable Entity List", agency: "MOFCOM", tone: "red" },
  "CN-AFSL": { name: "Countermeasure list (反制清单)", agency: "MOFCOM", tone: "orange" },
};

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
