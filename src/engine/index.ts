// Engine entry point: which regimes attach to the transaction, and what each requires.
import type { Case } from "../shared/case.ts";
import type { Assessment, JurisdictionAssessment, Outcome } from "../shared/assessment.ts";
import { worst } from "../shared/assessment.ts";
import type { EngineData } from "./data.ts";
import { assessJp } from "./jp/index.ts";
import { assessUs } from "./us/index.ts";
import { assessCn } from "./cn/index.ts";
import { allQuestions } from "./questions.ts";

export const ENGINE_VERSION = "eyewarnyou-engine/1.0";

export interface EngineOptions {
  /** Evaluation date (YYYY-MM-DD). Defaults to the case ship date, else today. */
  asOf?: string;
  fxPerUsd?: Record<string, number>;
  bulkLicenses?: string[];
}

/** Indicative rates (units per USD). Configure real rates in Settings; shown on every conversion. */
export const DEFAULT_FX: Record<string, number> = { USD: 1, JPY: 150, EUR: 0.92, CNY: 7.2, GBP: 0.79, KRW: 1380, TWD: 32 };

const HEADLINE: Record<Outcome, string> = {
  prohibited: "Do not proceed — prohibited",
  license_required: "License required before shipment",
  exception_available: "License required unless an exception applies",
  incomplete: "Assessment incomplete — open items remain",
  no_license_required: "No license required",
  not_applicable: "No export-control regime attaches",
};

export function assessCase(c: Case, d: EngineData, opts: EngineOptions = {}): Assessment {
  const today = new Date().toISOString().slice(0, 10);
  const asOf = opts.asOf ?? (c.shipDate || today);
  const fx = { ...DEFAULT_FX, ...opts.fxPerUsd };
  const jurisdictions: JurisdictionAssessment[] = [
    assessJp(c, d, { fxPerUsd: fx, bulkLicenses: opts.bulkLicenses }),
    assessUs(c, d, { asOf, fxPerUsd: fx }),
    assessCn(c, d, { asOf }),
  ];
  // Order: the regime of the shipping country first, then item- and person-following regimes.
  jurisdictions.sort((a, b) => Number(b.jurisdiction === c.shipFrom) - Number(a.jurisdiction === c.shipFrom));

  const attached = jurisdictions.filter((j) => j.nexus.attaches !== false);
  const overall = c.items.length && c.destination ? worst(...attached.map((j) => j.outcome)) : "incomplete";
  const questions = allQuestions(d).filter((q) => q.relevant(c, d) && (c.answers[q.id] ?? "unknown") === "unknown" && q.group !== "red_flag");
  const fromFindings = jurisdictions.flatMap((j) =>
    [...j.findings, ...j.items.flatMap((i) => i.findings)]
      .filter((f) => f.question && f.status === "incomplete")
      .map((f) => ({ id: f.question!.id, text: f.question!.text, jurisdiction: j.jurisdiction })),
  );
  return {
    caseId: c.id,
    computedAt: new Date().toISOString(),
    engineVersion: ENGINE_VERSION,
    dataVersions: d.versions,
    overall,
    headline: HEADLINE[overall],
    jurisdictions,
    openQuestions: [...questions.map((q) => ({ id: q.id, text: q.text, jurisdiction: q.jurisdiction })), ...fromFindings],
  };
}
