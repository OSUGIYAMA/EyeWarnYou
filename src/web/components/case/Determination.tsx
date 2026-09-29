// The live determination. `Verdict` answers "can this ship?" in one line and offers the next step;
// `Determination` shows, law by law, why — every finding cites its source.
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { Assessment, ExceptionCandidate, Finding, JurisdictionAssessment, Outcome } from "@/shared/assessment.ts";
import type { Progress } from "@/shared/progress.ts";
import type { Case } from "../../lib/api.ts";
import { cx, fmtDate } from "../../lib/format.ts";
import { AnswerToggle, Card, Mono, OutcomeIcon, OutcomePill, StatusDot } from "../ui/index.tsx";
import { CiteLink } from "../RegSheet.tsx";

const ORDER: Record<Finding["status"], number> = { block: 0, flag: 1, incomplete: 2, info: 3, pass: 4 };
export const J_LABEL: Record<string, { name: string; law: string; short: string }> = {
  JP: { name: "Japan", law: "Foreign Exchange and Foreign Trade Act", short: "外為法" },
  US: { name: "United States", law: "Export Administration Regulations", short: "EAR" },
  CN: { name: "China", law: "Export Control Law", short: "出口管制法" },
};

const VERDICT: Record<Outcome, string> = {
  prohibited: "Do not ship",
  license_required: "License required",
  exception_available: "An exception may apply",
  incomplete: "Needs your input",
  no_license_required: "No license required",
  not_applicable: "No export controls apply",
};

function verdictDetail(c: Case, a: Assessment, p: Progress): string {
  const attached = a.jurisdictions.filter((j) => j.nexus.attaches !== false);
  if (a.overall === "incomplete") {
    if (!c.items.length || !c.destination) return "Add the goods and the destination, and Kanmon will work out which laws apply.";
    const todo = p.steps.filter((s) => !s.done && s.id !== "submit" && s.id !== "decide").map((s) => s.label.charAt(0).toLowerCase() + s.label.slice(1));
    const list = todo.length > 1 ? `${todo.slice(0, -1).join(", ")} and ${todo.at(-1)}` : todo[0];
    return list ? `To decide, Kanmon needs you to ${list}. Everything else has been checked.` : "Kanmon needs a few more details before it can decide.";
  }
  if (a.overall === "no_license_required") return `Checked under ${attached.map((j) => J_LABEL[j.jurisdiction]?.name).join(", ")} — nothing requires a license on the facts given.`;
  if (a.overall === "not_applicable") return "None of the Japanese, US or Chinese regimes reaches this transaction.";
  const worstJ = attached.find((j) => j.outcome === a.overall) ?? attached[0];
  const reason = worstJ?.items.find((i) => i.outcome === a.overall)?.summary ?? worstJ?.findings.find((f) => f.status === "block")?.title;
  const where = worstJ ? `Under ${J_LABEL[worstJ.jurisdiction]?.name ?? worstJ.jurisdiction}'s ${J_LABEL[worstJ.jurisdiction]?.law ?? "rules"}` : "";
  return [where, reason].filter(Boolean).join(" — ").replace(/\.?$/, ".");
}

export function Verdict({ c, assessment, progress, action }: { c: Case; assessment: Assessment; progress: Progress; action: ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start gap-4 p-6">
        <OutcomeIcon outcome={assessment.overall} className="size-11" />
        <div className="min-w-0 flex-1 basis-72">
          <div className="text-[26px] font-bold leading-tight tracking-[-0.02em]">{VERDICT[assessment.overall]}</div>
          <p className="mt-1 max-w-2xl text-[14.5px] leading-relaxed text-fg-2">{verdictDetail(c, assessment, progress)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 self-center">{action}</div>
      </div>
      <div className="grid grid-cols-1 border-t border-line sm:grid-cols-3 sm:divide-x sm:divide-line">
        {assessment.jurisdictions.map((j) => (
          <a key={j.jurisdiction} href={`#law-${j.jurisdiction}`} className="block px-6 py-3.5 transition-colors hover:bg-fill-2">
            <div className="text-[12.5px] text-fg-3">
              {J_LABEL[j.jurisdiction]?.name} · {J_LABEL[j.jurisdiction]?.short}
            </div>
            <div className="mt-0.5">{j.nexus.attaches === false ? <span className="text-[13px] text-fg-3">Does not apply</span> : <OutcomePill outcome={j.outcome} />}</div>
          </a>
        ))}
      </div>
      <div className="flex items-center gap-3 border-t border-line px-6 py-3">
        <div className="flex flex-1 gap-1" aria-hidden>
          {progress.steps.map((s) => (
            <span key={s.id} title={s.done ? s.doneLabel : s.label} className={cx("h-1 flex-1 rounded-full", s.done ? "bg-accent" : "bg-fill")} />
          ))}
        </div>
        <span className="shrink-0 text-[12.5px] tabular text-fg-3">
          {progress.done} of {progress.total} steps
        </span>
      </div>
    </Card>
  );
}

export function Determination({ c, assessment, onQuestion }: { c: Case; assessment: Assessment; onQuestion: (id: string, v: "yes" | "no" | "unknown") => void }) {
  const attached = assessment.jurisdictions.filter((j) => j.nexus.attaches !== false);
  const detached = assessment.jurisdictions.filter((j) => j.nexus.attaches === false);
  return (
    <Card className="overflow-hidden">
      <div className="divide-y divide-line">
        {attached.map((j) => (
          <JurisdictionBlock key={j.jurisdiction} j={j} c={c} onQuestion={onQuestion} />
        ))}
        {detached.map((j) => (
          <Detached key={j.jurisdiction} j={j} c={c} onQuestion={onQuestion} />
        ))}
      </div>
      <div className="border-t border-line px-5 py-3 text-[11.5px] leading-relaxed text-fg-3">
        Assessed {fmtDate(assessment.computedAt)} by {assessment.engineVersion} against eCFR {assessment.dataVersions.ccl}
        {assessment.dataVersions.csl ? ` · CSL ${assessment.dataVersions.csl}` : ""} · 輸出令 {assessment.dataVersions.jpLaw}
        {assessment.dataVersions.meti ? ` · 外国ユーザーリスト ${assessment.dataVersions.meti}` : ""}. Decision support, not legal advice.
      </div>
    </Card>
  );
}

function SubHead({ children }: { children: ReactNode }) {
  return <div className="mb-2 text-[12.5px] font-semibold text-fg-2">{children}</div>;
}

function JurisdictionBlock({ j, c, onQuestion }: { j: JurisdictionAssessment; c: Case; onQuestion: (id: string, v: "yes" | "no" | "unknown") => void }) {
  const [open, setOpen] = useState(true);
  return (
    <section id={`law-${j.jurisdiction}`} className="scroll-mt-8">
      <button onClick={() => setOpen((x) => !x)} className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-fill-2">
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-semibold tracking-tight">{J_LABEL[j.jurisdiction]?.name}</div>
          <div className="text-[12.5px] text-fg-3">{J_LABEL[j.jurisdiction]?.law}</div>
        </div>
        <OutcomePill outcome={j.outcome} />
        <ChevronDown className={cx("size-4 text-fg-3 transition-transform", !open && "-rotate-90")} />
      </button>
      {open && (
        <div className="space-y-5 px-5 pb-5">
          <p className="text-[13px] leading-relaxed text-fg-2">
            <span className="font-medium text-fg">{j.nexus.attaches === "unknown" ? "May apply. " : "Why it applies. "}</span>
            {j.nexus.reasons.join(" ")}
          </p>
          {j.findings.length > 0 && (
            <div>
              <SubHead>Destination, parties and end use</SubHead>
              <FindingList findings={j.findings} c={c} onQuestion={onQuestion} />
            </div>
          )}
          {j.items.map((ia) => {
            const item = c.items.find((i) => i.id === ia.itemId);
            if (!item) return null;
            return (
              <div key={ia.itemId} className="border-t border-line pt-4">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{item.name || "Untitled item"}</span>
                  {j.jurisdiction === "US" && item.us.eccn && (
                    <Mono className="text-fg-3">
                      {item.us.eccn}
                      {item.us.paragraph ? `.${item.us.paragraph}` : ""}
                    </Mono>
                  )}
                  {j.jurisdiction === "JP" && item.jp.kou && <span className="text-[12.5px] text-fg-3">{item.jp.kou}</span>}
                </div>
                <div className="mb-2.5 mt-0.5 flex items-center gap-2 text-[13px] text-fg-2">
                  <OutcomePill outcome={ia.outcome} size="sm" label={ia.summary} />
                </div>
                <FindingList findings={ia.findings} c={c} onQuestion={onQuestion} />
                {ia.exceptions.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {ia.exceptions.map((e) => (
                      <ExceptionCard key={e.code} e={e} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {j.actions.length > 0 && (
            <div className="border-t border-line pt-4">
              <SubHead>What to do</SubHead>
              <ol className="space-y-1.5 text-[13px] leading-snug text-fg">
                {j.actions.map((a, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span className="mt-px w-4 shrink-0 text-right text-[12px] font-medium tabular text-fg-3">{i + 1}.</span>
                    {a}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Detached({ j, c, onQuestion }: { j: JurisdictionAssessment; c: Case; onQuestion: (id: string, v: "yes" | "no" | "unknown") => void }) {
  const [open, setOpen] = useState(false);
  return (
    <section id={`law-${j.jurisdiction}`} className="scroll-mt-8">
      <button onClick={() => setOpen((x) => !x)} className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-fill-2">
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-medium text-fg-2">{J_LABEL[j.jurisdiction]?.name}</div>
          <div className="text-[12.5px] text-fg-3">Does not apply to this transaction</div>
        </div>
        <ChevronRight className={cx("size-4 text-fg-3 transition-transform", open && "rotate-90")} />
      </button>
      {open && (
        <div className="space-y-3 px-5 pb-4">
          <ul className="space-y-1 text-[13px] leading-relaxed text-fg-2">
            {j.nexus.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
          {j.findings.length > 0 && <FindingList findings={j.findings} c={c} onQuestion={onQuestion} />}
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
    <div className="space-y-2">
      {main.map((f) => (
        <FindingRow key={f.id} f={f} c={c} onQuestion={onQuestion} />
      ))}
      {passed.length > 0 &&
        (showPass ? (
          passed.map((f) => <FindingRow key={f.id} f={f} c={c} onQuestion={onQuestion} />)
        ) : (
          <button onClick={() => setShowPass(true)} className="flex items-center gap-2.5 text-[13px] text-fg-2 hover:text-fg">
            <StatusDot status="pass" className="mt-0" />
            {passed.length} check{passed.length > 1 ? "s" : ""} passed
            <span className="text-accent-text">Show</span>
          </button>
        ))}
    </div>
  );
}

export function currentAnswer(c: Case, qid: string): "yes" | "no" | "unknown" {
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
  const [expanded, setExpanded] = useState(f.status === "block" || f.status === "incomplete");
  const hasBody = !!(f.detail || f.evidence || f.citations.length || f.question);
  return (
    <div className="flex gap-2.5">
      <StatusDot status={f.status} />
      <div className="min-w-0 flex-1">
        <button
          onClick={() => hasBody && setExpanded((x) => !x)}
          className={cx("text-left text-[13.5px] leading-snug", f.status === "pass" || f.status === "info" ? "text-fg-2" : "font-medium text-fg", hasBody && "hover:underline decoration-fg-3/40 underline-offset-2")}
        >
          {f.title}
        </button>
        {expanded && (
          <div className="mt-1.5 space-y-2">
            {f.evidence && <Evidence e={f.evidence} />}
            {f.detail && <div className="whitespace-pre-line text-[13px] leading-relaxed text-fg-2">{f.detail}</div>}
            {f.question && (
              <div className="flex items-center gap-3 rounded-xl bg-panel-2 px-3 py-2.5">
                <span className="flex-1 text-[13px] leading-snug">{f.question.text}</span>
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
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-1 text-[12px] text-fg-3">Country Chart, {e.country}</span>
        {e.cells.map((cell) => (
          <span key={cell.column} className={cx("inline-flex h-5 items-center rounded-[5px] px-1.5 font-mono text-[11px]", cell.x ? "bg-orange-soft font-semibold text-orange-text" : "bg-fill-2 text-fg-3")}>
            {cell.column.replace(/(\d)$/, " $1")}
            {cell.x ? " ✕" : ""}
          </span>
        ))}
      </div>
    );
  if (e.kind === "deminimis") {
    const pct = Math.min(100, e.pct);
    return (
      <div className="rounded-xl bg-panel-2 px-3.5 py-2.5">
        <div className="flex justify-between text-[12px] text-fg-3">
          <span>
            Controlled US content <span className="font-semibold tabular text-fg">{e.pct.toFixed(1)}%</span>
          </span>
          <span>de minimis level {e.threshold}%</span>
        </div>
        <div className="relative mt-2 h-1.5 rounded-full bg-fill">
          <div className={cx("h-full rounded-full", e.pct > e.threshold ? "bg-orange" : "bg-green")} style={{ width: `${pct}%` }} />
          <div className="absolute -top-1 h-3.5 w-0.5 rounded-full bg-fg" style={{ left: `${e.threshold}%` }} />
        </div>
      </div>
    );
  }
  if (e.kind === "screening")
    return (
      <div className="text-[12.5px] text-fg-3">
        Matched <span className="font-medium text-fg-2">{e.name}</span> · score {Math.round(e.score)}
      </div>
    );
  return null;
}

function ExceptionCard({ e }: { e: ExceptionCandidate }) {
  return (
    <div className="rounded-xl bg-panel-2 px-4 py-3">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[12.5px] font-semibold">{e.code}</span>
        <span className="text-[13.5px] font-medium">{e.name}</span>
        <span className="ml-auto whitespace-nowrap text-[12px] text-fg-3">{e.strength === "likely" ? "Likely available" : "Possibly available"}</span>
      </div>
      <div className="mt-1 text-[12.5px] leading-snug text-fg-2">{e.basis}</div>
      <div className="mt-2.5 text-[12.5px] font-semibold text-fg-2">Before relying on it, confirm</div>
      <ul className="mt-1 space-y-1 text-[13px] leading-snug">
        {e.conditions.map((cond, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="mt-[3px] size-3.5 shrink-0 rounded-[4px] ring-[1.5px] ring-inset ring-fg-3/60" />
            {cond}
          </li>
        ))}
      </ul>
      <div className="mt-2 flex gap-3">
        {e.citations.map((ci, i) => (
          <CiteLink key={i} cite={ci} />
        ))}
      </div>
    </div>
  );
}
