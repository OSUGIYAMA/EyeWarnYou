import { ChevronDown, ListChecks } from "lucide-react";
import { useState } from "react";
import type { Question } from "../../lib/api.ts";
import { cx } from "../../lib/format.ts";
import { AnswerToggle, Badge, Button, Card, CardHeader } from "../ui/index.tsx";
import { CiteLink } from "../RegSheet.tsx";

const GROUPS: { key: Question["group"]; label: string }[] = [
  { key: "notice", label: "Government notifications" },
  { key: "end_use", label: "End use" },
  { key: "end_user", label: "End user" },
];

export function QuestionsCard({ questions, onAnswer, onAnswerMany }: { questions: Question[]; onAnswer: (id: string, v: Question["answer"]) => void; onAnswerMany: (ids: string[], v: Question["answer"]) => void }) {
  const [flagsOpen, setFlagsOpen] = useState(false);
  const juris = (["JP", "US", "CN"] as const).filter((j) => questions.some((q) => q.jurisdiction === j));
  const open = questions.filter((q) => q.answer === "unknown" && q.group !== "red_flag").length;
  return (
    <Card id="questions">
      <CardHeader
        title="Knowledge questions"
        subtitle="What you know about the end use and end user. 'Yes' is always the adverse answer."
        icon={<ListChecks className="size-4" />}
        actions={open > 0 ? <Badge tone="amber">{open} open</Badge> : <Badge tone="green">All answered</Badge>}
      />
      <div className="divide-y divide-line">
        {juris.map((j) => {
          const qs = questions.filter((q) => q.jurisdiction === j);
          const flags = qs.filter((q) => q.group === "red_flag");
          const unanswered = flags.filter((f) => f.answer === "unknown");
          return (
            <div key={j} className="px-4 py-3">
              <div className="mb-2 text-[12px] font-semibold text-fg-2">{j === "JP" ? "Japan — FEFTA catch-all and approvals" : j === "US" ? "United States — EAR Part 744 and General Prohibitions" : "China"}</div>
              {GROUPS.map((g) => {
                const list = qs.filter((q) => q.group === g.key);
                if (!list.length) return null;
                return (
                  <div key={g.key} className="mb-3 last:mb-0">
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-3">{g.label}</div>
                    <div className="space-y-1">
                      {list.map((q) => (
                        <QuestionRow key={q.id} q={q} onAnswer={onAnswer} />
                      ))}
                    </div>
                  </div>
                );
              })}
              {flags.length > 0 && (
                <div className="mt-2 rounded-lg ring-1 ring-line">
                  <div className="flex items-center gap-2 px-3 py-2">
                    <button onClick={() => setFlagsOpen((o) => !o)} className="flex flex-1 items-center gap-2 text-left text-[12.5px] font-medium">
                      <ChevronDown className={cx("size-3.5 transition-transform", !flagsOpen && "-rotate-90")} />
                      BIS &ldquo;Know Your Customer&rdquo; red flags
                      <span className="font-normal text-fg-3">
                        {flags.length - unanswered.length}/{flags.length} reviewed
                        {flags.some((f) => f.answer === "yes") && <span className="ml-1 text-red-text">· {flags.filter((f) => f.answer === "yes").length} present</span>}
                      </span>
                    </button>
                    {unanswered.length > 0 && (
                      <Button size="sm" variant="ghost" onClick={() => onAnswerMany(unanswered.map((f) => f.id), "no")}>
                        Mark remaining “No”
                      </Button>
                    )}
                  </div>
                  {flagsOpen && (
                    <div className="space-y-1 border-t border-line px-3 py-2">
                      {flags.map((q) => (
                        <QuestionRow key={q.id} q={q} onAnswer={onAnswer} compact />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function QuestionRow({ q, onAnswer, compact }: { q: Question; onAnswer: (id: string, v: Question["answer"]) => void; compact?: boolean }) {
  return (
    <div className={cx("flex items-start gap-3 rounded-lg px-2 py-1.5", q.answer === "yes" && "bg-red-soft/60", q.answer === "unknown" && !compact && "bg-panel-2/60")}>
      <div className="min-w-0 flex-1">
        <div className={cx("leading-snug", compact ? "text-[12.5px] text-fg-2" : "text-[13px]")}>{q.text}</div>
        {!compact && (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-fg-3">
            {q.help && <span>{q.help}</span>}
            <CiteLink cite={q.cite} className="text-[11.5px]" />
          </div>
        )}
      </div>
      <AnswerToggle value={q.answer} onChange={(v) => onAnswer(q.id, v)} size={compact ? "sm" : "md"} />
    </div>
  );
}
