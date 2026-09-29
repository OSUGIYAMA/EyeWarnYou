// What only the exporter can know: end use, end user, government notices, and BIS red flags.
import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { Assessment } from "@/shared/assessment.ts";
import type { Case, Question } from "../../lib/api.ts";
import { cx } from "../../lib/format.ts";
import { AnswerToggle, Button, Card, Section } from "../ui/index.tsx";
import { CiteLink } from "../RegSheet.tsx";
import { currentAnswer } from "./Determination.tsx";

const GROUPS: { key: Question["group"]; label: string }[] = [
  { key: "notice", label: "Government notices" },
  { key: "end_use", label: "End use" },
  { key: "end_user", label: "End user" },
];

const J_TITLE: Record<string, string> = {
  JP: "Japan · catch-all controls and export approvals",
  US: "United States · end-use and end-user controls",
  CN: "China · end-user commitments and prohibitions",
};

interface ItemQuestion {
  id: string;
  jurisdiction: string;
  item: string;
  text: string;
  answer: Question["answer"];
  cite?: Question["cite"];
}

/** Questions the engine raised about specific items (scope carve-outs, FDP tests, Russia lists). */
function itemQuestions(c: Case, a: Assessment, known: Set<string>): ItemQuestion[] {
  const out = new Map<string, ItemQuestion>();
  for (const j of a.jurisdictions) {
    if (j.nexus.attaches === false) continue;
    for (const ia of j.items)
      for (const f of ia.findings)
        if (f.question && !known.has(f.question.id) && !out.has(f.question.id))
          out.set(f.question.id, { id: f.question.id, jurisdiction: j.jurisdiction, item: c.items.find((i) => i.id === ia.itemId)?.name || "Item", text: f.question.text, answer: currentAnswer(c, f.question.id), cite: f.citations[0] });
  }
  return [...out.values()];
}

export function QuestionsCard({ c, assessment, questions, onAnswer, onAnswerMany, lead }: { c: Case; assessment: Assessment; questions: Question[]; onAnswer: (id: string, v: Question["answer"]) => void; onAnswerMany: (ids: string[], v: Question["answer"]) => void; lead?: ReactNode }) {
  const items = itemQuestions(c, assessment, new Set(questions.map((q) => q.id)));
  const juris = (["JP", "US", "CN"] as const).filter((j) => questions.some((q) => q.jurisdiction === j) || items.some((q) => q.jurisdiction === j));
  const open = questions.filter((q) => q.answer === "unknown" && q.group !== "red_flag").length + items.filter((q) => q.answer === "unknown").length;
  const flagsOpen = questions.filter((q) => q.group === "red_flag" && q.answer === "unknown").length;
  return (
    <Section
      id="questions"
      title="Questions"
      lead={lead}
      description={
        <>
          What you know about the end use and the end user. <span className="text-fg">“Yes” is always the answer that raises a concern.</span>
        </>
      }
      actions={<span className={cx("text-[13px]", open || flagsOpen ? "font-medium text-accent-text" : "text-fg-3")}>{open > 0 ? `${open} unanswered` : flagsOpen ? `${flagsOpen} red flag${flagsOpen > 1 ? "s" : ""} to review` : "All answered"}</span>}
    >
      <div className="space-y-4">
        {juris.map((j) => {
          const qs = questions.filter((q) => q.jurisdiction === j);
          return (
            <Card key={j} className="overflow-hidden">
              <div className="px-4 pb-1 pt-3.5 text-[13px] font-semibold text-fg-2">{J_TITLE[j]}</div>
              {items.some((q) => q.jurisdiction === j) && (
                <div>
                  <div className="px-4 pb-1 pt-3 text-[12px] font-medium text-fg-3">About the goods</div>
                  <div className="k-list">
                    {items
                      .filter((q) => q.jurisdiction === j)
                      .map((q) => (
                        <div key={q.id} data-open={q.answer === "unknown" || undefined} className={cx("flex items-start gap-3 px-4 py-3", q.answer === "yes" && "bg-red-soft/60")}>
                          <span className={cx("mt-[7px] size-2 shrink-0 rounded-full", q.answer === "unknown" ? "bg-accent" : "bg-transparent")} />
                          <div className="min-w-0 flex-1">
                            <div className="text-[12.5px] font-medium text-fg-3">{q.item}</div>
                            <div className="text-[14px] leading-snug">{q.text}</div>
                            {q.cite && <CiteLink cite={q.cite} className="mt-1 text-[12.5px]" />}
                          </div>
                          <AnswerToggle value={q.answer} onChange={(v) => onAnswer(q.id, v)} />
                        </div>
                      ))}
                  </div>
                </div>
              )}
              {GROUPS.map((g) => {
                const list = qs.filter((q) => q.group === g.key);
                if (!list.length) return null;
                return (
                  <div key={g.key}>
                    <div className="px-4 pb-1 pt-3 text-[12px] font-medium text-fg-3">{g.label}</div>
                    <div className="k-list">
                      {list.map((q) => (
                        <QuestionRow key={q.id} q={q} onAnswer={onAnswer} />
                      ))}
                    </div>
                  </div>
                );
              })}
              <RedFlags flags={qs.filter((q) => q.group === "red_flag")} onAnswer={onAnswer} onAnswerMany={onAnswerMany} />
            </Card>
          );
        })}
      </div>
    </Section>
  );
}

function RedFlags({ flags, onAnswer, onAnswerMany }: { flags: Question[]; onAnswer: (id: string, v: Question["answer"]) => void; onAnswerMany: (ids: string[], v: Question["answer"]) => void }) {
  const unanswered = flags.filter((f) => f.answer === "unknown");
  const [open, setOpen] = useState(unanswered.length > 0 && unanswered.length < flags.length);
  if (!flags.length) return null;
  const present = flags.filter((f) => f.answer === "yes").length;
  return (
    <div className="mt-2 border-t border-line">
      <div data-open={(!open && unanswered.length > 0) || undefined} className="flex items-center gap-3 px-4 py-3">
        <button onClick={() => setOpen((o) => !o)} className="flex flex-1 items-center gap-2 text-left">
          <ChevronDown className={cx("size-4 text-fg-3 transition-transform", !open && "-rotate-90")} />
          <span className="text-[14px] font-medium">BIS “Know Your Customer” red flags</span>
          <span className="text-[13px] text-fg-3">
            {flags.length - unanswered.length} of {flags.length} reviewed
            {present > 0 && <span className="text-red-text"> · {present} present</span>}
          </span>
        </button>
        {unanswered.length > 0 && (
          <Button size="sm" onClick={() => onAnswerMany(unanswered.map((f) => f.id), "no")}>
            None of the rest apply
          </Button>
        )}
      </div>
      {open && (
        <div className="k-list border-t border-line">
          {flags.map((q) => (
            <QuestionRow key={q.id} q={q} onAnswer={onAnswer} compact />
          ))}
        </div>
      )}
    </div>
  );
}

function QuestionRow({ q, onAnswer, compact }: { q: Question; onAnswer: (id: string, v: Question["answer"]) => void; compact?: boolean }) {
  return (
    <div data-open={q.answer === "unknown" || undefined} className={cx("flex items-start gap-3 px-4 py-3", q.answer === "yes" && "bg-red-soft/60")}>
      <span className={cx("mt-[7px] size-2 shrink-0 rounded-full", q.answer === "unknown" ? "bg-accent" : "bg-transparent")} aria-label={q.answer === "unknown" ? "Unanswered" : undefined} />
      <div className="min-w-0 flex-1">
        <div className={cx("leading-snug", compact ? "text-[13px] text-fg" : "text-[14px]")}>{q.text}</div>
        {!compact && (
          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[12.5px] leading-snug text-fg-3">
            {q.help && <span>{q.help}</span>}
            <CiteLink cite={q.cite} className="text-[12.5px]" />
          </div>
        )}
      </div>
      <AnswerToggle value={q.answer} onChange={(v) => onAnswer(q.id, v)} size={compact ? "sm" : "md"} />
    </div>
  );
}
