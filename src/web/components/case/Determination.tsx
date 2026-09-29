// The live determination: which regimes attach, what each requires, and why — every finding cites its source.
import { ChevronDown, CircleCheck, CircleDashed, Gavel, Scale } from "lucide-react";
import { useState } from "react";
import type { Assessment, ExceptionCandidate, Finding, JurisdictionAssessment } from "@/shared/assessment.ts";
import type { Case } from "../../lib/api.ts";
import { cx, fmtDate, OUTCOME } from "../../lib/format.ts";
import { AnswerToggle, Badge, Mono, OutcomePill, StatusDot } from "../ui/index.tsx";
import { CiteLink } from "../RegSheet.tsx";

const ORDER: Record<Finding["status"], number> = { block: 0, flag: 1, incomplete: 2, info: 3, pass: 4 };
const J_LABEL: Record<string, { name: string; short: string }> = {
  JP: { name: "Japan", short: "Foreign Exchange and Foreign Trade Act" },
  US: { name: "United States", short: "Export Administration Regulations" },
  CN: { name: "China", short: "Export Control Law" },
};

export function Determination({ c, assessment, onQuestion }: { c: Case; assessment: Assessment; onQuestion: (id: string, v: "yes" | "no" | "unknown") => void }) {
  const o = OUTCOME[assessment.overall];
  const attached = assessment.jurisdictions.filter((j) => j.nexus.attaches !== false);
  const detached = assessment.jurisdictions.filter((j) => j.nexus.attaches === false);
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-panel shadow-card">
      <div className={cx("border-b border-line px-5 py-4", assessment.overall === "prohibited" ? "bg-red-soft/70" : assessment.overall === "license_required" ? "bg-orange-soft/70" : assessment.overall === "exception_available" ? "bg-amber-soft/70" : assessment.overall === "no_license_required" ? "bg-green-soft/70" : "bg-panel-2/60")}>
        <div className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-fg-3">
          <Scale className="size-3.5" /> Determination
        </div>
        <div className="mt-2 flex items-center gap-3">
          <OutcomePill outcome={assessment.overall} size="lg" />
        </div>
        <div className="mt-2 text-[15px] font-semibold tracking-tight">{assessment.headline}</div>
        <div className="mt-3 grid gap-1.5">
          {assessment.jurisdictions.map((j) => (
            <div key={j.jurisdiction} className="flex items-center gap-2 text-[12.5px]">
              <span className="w-6 font-mono text-[11px] font-semibold text-fg-3">{j.jurisdiction}</span>
              <span className="w-28 text-fg-2">{J_LABEL[j.jurisdiction]?.name}</span>
              {j.nexus.attaches === false ? <span className="text-fg-3">Does not attach</span> : <OutcomePill outcome={j.outcome} size="sm" />}
            </div>
          ))}
        </div>
        {assessment.openQuestions.length > 0 && (
          <a href="#questions" className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-fg-2 hover:text-fg">
            <CircleDashed className="size-3.5" /> {assessment.openQuestions.length} question{assessment.openQuestions.length > 1 ? "s" : ""} still open
          </a>
        )}
        {o && assessment.overall === "exception_available" && <div className="mt-2 text-[12px] text-fg-2">A license is required unless every condition of a listed exception is met and documented.</div>}
      </div>

      <div className="divide-y divide-line">
        {attached.map((j) => (
          <JurisdictionBlock key={j.jurisdiction} j={j} c={c} onQuestion={onQuestion} />
        ))}
        {detached.map((j) => (
          <div key={j.jurisdiction} className="px-5 py-3">
            <div className="flex items-center gap-2 text-[13px]">
              <span className="font-mono text-[11px] font-semibold text-fg-3">{j.jurisdiction}</span>
              <span className="font-medium text-fg-2">{J_LABEL[j.jurisdiction]?.name}</span>
              <span className="text-fg-3">— does not attach</span>
            </div>
            <ul className="mt-1 space-y-0.5 text-[12px] text-fg-3">
              {j.nexus.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
            {j.findings.length > 0 && <FindingList findings={j.findings} c={c} onQuestion={onQuestion} />}
          </div>
        ))}
      </div>
      <div className="border-t border-line bg-panel-2/50 px-5 py-2.5 text-[11px] leading-relaxed text-fg-3">
        Assessed {fmtDate(assessment.computedAt)} by {assessment.engineVersion} against eCFR {assessment.dataVersions.ccl}
        {assessment.dataVersions.csl ? ` · CSL ${assessment.dataVersions.csl}` : ""} · 輸出令 {assessment.dataVersions.jpLaw}
        {assessment.dataVersions.meti ? ` · 外国ユーザーリスト ${assessment.dataVersions.meti}` : ""}. Decision support, not legal advice.
      </div>
    </div>
  );
}

function JurisdictionBlock({ j, c, onQuestion }: { j: JurisdictionAssessment; c: Case; onQuestion: (id: string, v: "yes" | "no" | "unknown") => void }) {
  const [open, setOpen] = useState(true);
  return (
    <section>
      <button onClick={() => setOpen((x) => !x)} className="flex w-full items-center gap-2 px-5 py-3 text-left hover:bg-panel-2/40">
        <span className="font-mono text-[11px] font-semibold text-fg-3">{j.jurisdiction}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold tracking-tight">
            {J_LABEL[j.jurisdiction]?.name} <span className="font-normal text-fg-3">— {J_LABEL[j.jurisdiction]?.short}</span>
          </div>
        </div>
        <OutcomePill outcome={j.outcome} size="sm" />
        <ChevronDown className={cx("size-4 text-fg-3 transition-transform", !open && "-rotate-90")} />
      </button>
      {open && (
        <div className="px-5 pb-4">
          <div className="mb-3 rounded-lg bg-panel-2/60 px-3 py-2 text-[12px] text-fg-2 ring-1 ring-line">
            <span className="font-medium text-fg">{j.nexus.attaches === "unknown" ? "Jurisdiction undetermined: " : "Attaches because: "}</span>
            {j.nexus.reasons.join("; ")}
          </div>
          {j.findings.length > 0 && (
            <div className="mb-3">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-3">Destination, parties & end use</div>
              <FindingList findings={j.findings} c={c} onQuestion={onQuestion} />
            </div>
          )}
          {j.items.map((ia) => {
            const item = c.items.find((i) => i.id === ia.itemId);
            if (!item) return null;
            return (
              <div key={ia.itemId} className="mb-3 rounded-lg ring-1 ring-line last:mb-0">
                <div className="flex items-center gap-2 border-b border-line px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{item.name || "Untitled item"}</span>
                  {j.jurisdiction === "US" && item.us.eccn && <Mono className="text-fg-3">{item.us.eccn}{item.us.paragraph ? `.${item.us.paragraph}` : ""}</Mono>}
                  {j.jurisdiction === "JP" && item.jp.kou && <span className="text-[12px] text-fg-3">{item.jp.kou}</span>}
                  <OutcomePill outcome={ia.outcome} size="sm" />
                </div>
                <div className="px-3 py-2">
                  <div className="mb-1.5 text-[12.5px] text-fg-2">{ia.summary}</div>
                  <FindingList findings={ia.findings} c={c} onQuestion={onQuestion} />
                  {ia.exceptions.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {ia.exceptions.map((e) => (
                        <ExceptionCard key={e.code} e={e} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {j.actions.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-3">
                <Gavel className="size-3" /> Next steps
              </div>
              <ul className="space-y-1 text-[12.5px] text-fg-2">
                {j.actions.map((a, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-[7px] size-1 shrink-0 rounded-full bg-fg-3" />
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function FindingList({ findings, c, onQuestion }: { findings: Finding[]; c: Case; onQuestion: (id: string, v: "yes" | "no" | "unknown") => void }) {
  const [showPass, setShowPass] = useState(false);
  const sorted = [...findings].sort((a, b) => ORDER[a.status] - ORDER[b.status]);
  const main = sorted.filter((f) => f.status !== "pass");
  const passed = sorted.filter((f) => f.status === "pass");
  return (
    <div className="space-y-1.5">
      {main.map((f) => (
        <FindingRow key={f.id} f={f} c={c} onQuestion={onQuestion} />
      ))}
      {passed.length > 0 &&
        (showPass ? (
          passed.map((f) => <FindingRow key={f.id} f={f} c={c} onQuestion={onQuestion} />)
        ) : (
          <button onClick={() => setShowPass(true)} className="flex items-center gap-1.5 pl-0.5 text-[12px] text-fg-3 hover:text-fg-2">
            <CircleCheck className="size-3.5 text-green" /> {passed.length} check{passed.length > 1 ? "s" : ""} passed
          </button>
        ))}
    </div>
  );
}

function currentAnswer(c: Case, qid: string): "yes" | "no" | "unknown" {
  const [kind, itemId, idx] = qid.split(".");
  const item = c.items.find((i) => i.id === itemId);
  if (kind === "ctl" && item) {
    const v = item.us.controlOverrides[idx];
    return v === undefined ? "unknown" : v ? "yes" : "no";
  }
  if (kind === "fdp" && item) return item.us.fdp[idx] ?? "unknown";
  if (kind === "jp23" && item) return item.jp.appendix2_3;
  return c.answers[qid] ?? "unknown";
}

function FindingRow({ f, c, onQuestion }: { f: Finding; c: Case; onQuestion: (id: string, v: "yes" | "no" | "unknown") => void }) {
  const [expanded, setExpanded] = useState(f.status === "block" || f.status === "incomplete" || f.status === "flag");
  const hasBody = !!(f.detail || f.evidence || f.citations.length);
  return (
    <div className="flex gap-2.5">
      <StatusDot status={f.status} />
      <div className="min-w-0 flex-1">
        <button onClick={() => hasBody && setExpanded((x) => !x)} className={cx("text-left text-[13px] leading-snug", f.status === "pass" || f.status === "info" ? "text-fg-2" : "font-medium text-fg")}>
          {f.title}
        </button>
        {expanded && (
          <div className="mt-1 space-y-1.5">
            {f.evidence && <Evidence e={f.evidence} />}
            {f.detail && <div className="whitespace-pre-line text-[12.5px] leading-relaxed text-fg-2">{f.detail}</div>}
            {f.question && (
              <div className="flex items-center gap-3 rounded-lg bg-panel-2/70 px-2.5 py-1.5 ring-1 ring-line">
                <span className="flex-1 text-[12.5px]">{f.question.text}</span>
                <AnswerToggle size="sm" value={currentAnswer(c, f.question.id)} onChange={(v) => onQuestion(f.question!.id, v)} />
              </div>
            )}
            {f.citations.length > 0 && (
              <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                {f.citations.map((ci, i) => (
                  <CiteLink key={i} cite={ci} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Evidence({ e }: { e: NonNullable<Finding["evidence"]> }) {
  if (e.kind === "chart")
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11.5px] text-fg-3">Country Chart — {e.country}:</span>
        {e.cells.map((cell) => (
          <span key={cell.column} className={cx("inline-flex h-5 items-center gap-1 rounded px-1.5 font-mono text-[11px] ring-1 ring-inset", cell.x ? "bg-orange-soft text-orange-text ring-orange/25" : "bg-panel-2 text-fg-3 ring-line")}>
            {cell.column.replace(/(\d)$/, " $1")} {cell.x ? "✕" : "—"}
          </span>
        ))}
      </div>
    );
  if (e.kind === "deminimis") {
    const pct = Math.min(100, e.pct);
    return (
      <div className="rounded-lg bg-panel-2/60 px-3 py-2 ring-1 ring-line">
        <div className="flex justify-between text-[11.5px] text-fg-3">
          <span>
            US controlled content <span className="font-medium tabular text-fg">{e.pct.toFixed(1)}%</span>
          </span>
          <span>de minimis level {e.threshold}%</span>
        </div>
        <div className="relative mt-1.5 h-1.5 rounded-full bg-panel-3">
          <div className={cx("h-full rounded-full", e.pct > e.threshold ? "bg-orange" : "bg-green")} style={{ width: `${pct}%` }} />
          <div className="absolute -top-1 h-3.5 w-px bg-fg" style={{ left: `${e.threshold}%` }} />
        </div>
      </div>
    );
  }
  if (e.kind === "screening")
    return (
      <div className="text-[12px] text-fg-3">
        Matched <span className="font-medium text-fg-2">{e.name}</span> · score {Math.round(e.score)}
      </div>
    );
  return null;
}

function ExceptionCard({ e }: { e: ExceptionCandidate }) {
  return (
    <div className="rounded-lg border border-amber/30 bg-amber-soft/50 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <Badge tone="amber">{e.code}</Badge>
        <span className="text-[13px] font-medium">{e.name}</span>
        <span className="ml-auto text-[11px] text-fg-3">{e.strength === "likely" ? "Likely available" : "Possibly available"}</span>
      </div>
      <div className="mt-1 text-[12px] text-fg-2">{e.basis}</div>
      <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-fg-3">Confirm before relying on it</div>
      <ul className="mt-0.5 space-y-0.5 text-[12.5px]">
        {e.conditions.map((cond, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-[5px] size-2.5 shrink-0 rounded-[3px] ring-1 ring-amber/60" />
            {cond}
          </li>
        ))}
      </ul>
      <div className="mt-1.5 flex gap-3">
        {e.citations.map((ci, i) => (
          <CiteLink key={i} cite={ci} />
        ))}
      </div>
    </div>
  );
}
