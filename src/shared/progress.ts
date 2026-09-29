// Where a case stands in the review workflow, and the single next thing the reviewer should do.
// Shared by the server (case list) and the case page so both always agree.
import type { Assessment } from "./assessment.ts";
import type { Case } from "./case.ts";

export type StepId = "route" | "goods" | "parties" | "screen" | "matches" | "details" | "questions" | "submit" | "decide";

export interface Step {
  id: StepId;
  /** Imperative, as shown on the "Next" button: "Screen 2 parties". */
  label: string;
  /** Past-tense label once the step is done. */
  doneLabel: string;
  done: boolean;
  count?: number;
  /** Section of the case page where the step is carried out. */
  anchor: "transaction" | "items" | "parties" | "questions" | "review";
}

export interface Progress {
  steps: Step[];
  next: Step | null;
  done: number;
  total: number;
}

/** Incomplete findings that are fixed by editing the item itself (not by answering a question). */
export const ITEM_DATA = new Set(["jp.class", "jp.kou", "jp.ca.scope", "cn.class", "subject.unknown", "deminimis.missing", "fdp.open", "class.missing", "class.unknown", "dest.ru.hts"]);

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function caseProgress(c: Case, a: Assessment): Progress {
  const named = c.parties.filter((p) => p.name.trim());
  const unscreened = named.filter((p) => !c.screenings[p.id]).length;
  const pending = named.reduce((n, p) => n + (c.screenings[p.id]?.hits.filter((h) => h.disposition === "pending").length ?? 0), 0);
  const itemGaps = new Set(
    a.jurisdictions.flatMap((j) => (j.nexus.attaches === false ? [] : j.items.filter((i) => i.findings.some((f) => f.status === "incomplete" && ITEM_DATA.has(f.id))).map((i) => i.itemId))),
  ).size;
  const questions = new Set(a.openQuestions.map((q) => q.id)).size;
  // A partly finished red-flag review is also something only the reviewer can close.
  const redFlags = a.jurisdictions.some((j) => j.findings.some((f) => f.id === "us.redflags.unanswered"));
  const toAnswer = questions + (redFlags ? 1 : 0);
  const submitted = c.status !== "draft";
  const decided = c.status === "approved" || c.status === "rejected";

  const steps: Step[] = [
    { id: "route", label: "Choose the destination", doneLabel: "Route set", done: !!c.destination, anchor: "transaction" },
    { id: "goods", label: "Add the goods", doneLabel: plural(c.items.length, "item"), done: c.items.length > 0 && c.items.every((i) => i.name.trim()), anchor: "items" },
    { id: "parties", label: "Add the parties", doneLabel: plural(named.length, "party", "parties"), done: named.length > 0 && named.length === c.parties.length, anchor: "parties" },
    { id: "screen", label: unscreened ? `Screen ${plural(unscreened, "party", "parties")}` : "Screen the parties", doneLabel: "Parties screened", done: named.length > 0 && unscreened === 0, count: unscreened || undefined, anchor: "parties" },
    { id: "matches", label: `Review ${plural(pending, "possible match", "possible matches")}`, doneLabel: "Matches reviewed", done: pending === 0, count: pending || undefined, anchor: "parties" },
    { id: "details", label: itemGaps ? `Complete ${plural(itemGaps, "item")}` : "Complete the items", doneLabel: "Items classified", done: c.items.length > 0 && itemGaps === 0, count: itemGaps || undefined, anchor: "items" },
    { id: "questions", label: questions ? `Answer ${plural(toAnswer, "question")}` : "Finish the red-flag review", doneLabel: "Questions answered", done: toAnswer === 0, count: toAnswer || undefined, anchor: "questions" },
    { id: "submit", label: "Submit for review", doneLabel: "Submitted", done: submitted, anchor: "review" },
    { id: "decide", label: "Approve or reject", doneLabel: c.status === "rejected" ? "Rejected" : "Approved", done: decided, anchor: "review" },
  ];
  const next = c.status === "on_hold" ? null : (steps.find((s) => !s.done) ?? null);
  return { steps, next, done: steps.filter((s) => s.done).length, total: steps.length };
}
