// Side sheet that shows the regulation text behind any citation, with the cited paragraph highlighted.
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { api, type Citation, type EccnDetail, type RegSection } from "../lib/api.ts";
import { cx } from "../lib/format.ts";
import { Sheet, Skeleton } from "./ui/index.tsx";
import { EccnBody } from "./EccnView.tsx";

type Target = { kind: "section"; id: string; highlight?: string; label?: string } | { kind: "eccn"; id: string; paragraph?: string };

const Ctx = createContext<(t: Target | Citation) => void>(() => {});
export const useRegSheet = () => useContext(Ctx);

function toTarget(t: Target | Citation): Target | null {
  if ("kind" in t) return t;
  const eccn = t.label.match(/ECCN\s+(\d[A-E]\d{3})(?:\.([a-z0-9.]+))?/);
  if (eccn) return { kind: "eccn", id: eccn[1], paragraph: eccn[2] };
  if (!t.section) return null;
  const para = t.label.match(/\d{3}(?:\.\d+[a-z]?)?((?:\([a-z0-9ivx]+\))+)/i)?.[1];
  return { kind: "section", id: t.section, highlight: para, label: t.label };
}

export function RegSheetProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<Target | null>(null);
  const [fallback, setFallback] = useState<Citation | null>(null);
  const open = (t: Target | Citation) => {
    const tt = toTarget(t);
    if (tt) setTarget(tt);
    else if ("url" in t && t.url) window.open(t.url, "_blank", "noopener");
    else setFallback(t as Citation);
  };
  return (
    <Ctx.Provider value={open}>
      {children}
      <Sheet
        open={!!target}
        onOpenChange={(o) => !o && setTarget(null)}
        title={target?.kind === "eccn" ? `ECCN ${target.id}` : (target?.label ?? target?.id ?? "")}
        subtitle={target?.kind === "eccn" ? "Commerce Control List, 15 CFR Part 774 Supp. No. 1" : undefined}
        actions={
          target?.kind === "eccn" ? (
            <Link to={`/regulations/ccl/${target.id}`} onClick={() => setTarget(null)} className="mr-2 self-center whitespace-nowrap text-[13px] font-medium text-accent-text hover:underline">
              Open full page
            </Link>
          ) : target?.kind === "section" ? (
            <Link to={`/regulations/library?s=${encodeURIComponent(target.id)}`} onClick={() => setTarget(null)} className="mr-2 self-center whitespace-nowrap text-[13px] font-medium text-accent-text hover:underline">
              Open in Library
            </Link>
          ) : null
        }
      >
        {target?.kind === "section" && <SectionBody id={target.id} highlight={target.highlight} />}
        {target?.kind === "eccn" && <EccnSheetBody id={target.id} paragraph={target.paragraph} />}
      </Sheet>
      {fallback && null}
    </Ctx.Provider>
  );
}

function EccnSheetBody({ id, paragraph }: { id: string; paragraph?: string }) {
  const q = useQuery({ queryKey: ["eccn", id], queryFn: () => api.get<EccnDetail>(`/ccl/${id}`) });
  if (q.isError) return <div className="px-6 py-6 text-[14px] text-fg-2">This entry could not be loaded.</div>;
  if (!q.data) return <DocSkeleton />;
  return (
    <div className="px-6 py-5">
      <EccnBody eccn={q.data} highlight={paragraph} compact />
    </div>
  );
}

function DocSkeleton() {
  return (
    <div className="space-y-3 px-6 py-6">
      <Skeleton className="h-6 w-1/2" />
      <Skeleton className="h-4 w-1/3" />
      <div className="h-3" />
      {[1, 2, 3, 4, 5].map((i) => (
        <Skeleton key={i} className={i % 2 ? "h-4" : "h-4 w-5/6"} />
      ))}
    </div>
  );
}

/** Walk flat paragraphs tracking the label path so "(a)(17)" finds (17) under (a). */
function findHighlight(paragraphs: RegSection["paragraphs"], path: string | undefined): number {
  if (!path) return -1;
  const parts = [...path.matchAll(/\([a-z0-9ivx]+\)/gi)].map((m) => m[0]);
  let depth = 0;
  for (let i = 0; i < paragraphs.length; i++) {
    const label = paragraphs[i].label ?? "";
    const groups = [...label.matchAll(/\([a-z0-9ivx]+\)/gi)].map((m) => m[0]);
    for (const g of groups) {
      if (g === parts[depth]) {
        depth++;
        if (depth === parts.length) return i;
      }
    }
  }
  return -1;
}

/**
 * Outline level of each EAR paragraph from its label, following the CFR hierarchy (a) → (1) → (i) → (A).
 * The synced depth is flat for most EAR sections, so the label is the better guide. A roman numeral
 * only nests under a numbered paragraph; directly after a letter it is the letter (i).
 */
function earLevels(paragraphs: RegSection["paragraphs"]): number[] {
  let prev = 0;
  return paragraphs.map((p) => {
    const first = p.label?.match(/^\(([^)]+)\)/)?.[1];
    if (!first) return prev;
    let level: number;
    if (/^\d+$/.test(first)) level = 1;
    else if (/^[A-Z]{1,2}$/.test(first)) level = 3;
    else if (/^[ivxl]+$/.test(first) && prev >= 1) level = 2;
    else if (/^[a-z]{1,2}$/.test(first)) level = 0;
    else level = prev;
    prev = level;
    return level;
  });
}

export function SectionBody({ id, highlight, className = "px-6 py-6 sm:px-8" }: { id: string; highlight?: string; className?: string }) {
  const q = useQuery({ queryKey: ["section", id], queryFn: () => api.get<RegSection>(`/library/section?id=${encodeURIComponent(id)}`) });
  const ref = useRef<HTMLDivElement>(null);
  const hi = useMemo(() => (q.data ? findHighlight(q.data.paragraphs, highlight) : -1), [q.data, highlight]);
  const levels = useMemo(() => (q.data ? (q.data.source === "ear" ? earLevels(q.data.paragraphs) : q.data.paragraphs.map((p) => p.depth)) : []), [q.data]);
  useEffect(() => {
    if (hi >= 0) ref.current?.querySelector(`[data-p="${hi}"]`)?.scrollIntoView({ block: "center" });
  }, [hi]);
  if (q.isError) return <div className="px-6 py-6 text-[14px] text-fg-2">This section is not in the local library.</div>;
  if (!q.data) return <DocSkeleton />;
  const s = q.data;
  const jp = s.source === "jp";
  return (
    <article ref={ref} className={className}>
      <header className="mb-6 max-w-[72ch]">
        <div className="text-[13px] text-fg-3">
          {jp ? "Japan" : "US Export Administration Regulations"} · {s.cite}
        </div>
        <h2 className="mt-1 text-[22px] font-semibold leading-snug tracking-tight">{s.title}</h2>
        <a href={s.url} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-[13px] text-accent-text hover:underline">
          Official text on {jp ? "e-Gov" : "eCFR"} <ExternalLink className="size-3" />
        </a>
      </header>
      <div className={cx("max-w-[72ch] space-y-2 text-[15px] leading-[1.7] text-fg", jp && "tracking-[0.02em]")}>
        {s.paragraphs.map((p, i) => (
          <p key={i} data-p={i} className={cx("-mx-2 rounded-md px-2 py-0.5 transition-colors", i === hi && "bg-amber-soft")} style={{ marginLeft: `${Math.min(levels[i] ?? 0, 5) * 22 - 8}px` }}>
            {p.label && !p.text.startsWith(p.label) && <span className="mr-1.5 font-semibold">{p.label}</span>}
            {p.text}
          </p>
        ))}
      </div>
    </article>
  );
}

export function CiteLink({ cite, className }: { cite: Citation; className?: string }) {
  const open = useRegSheet();
  return (
    <button type="button" onClick={() => open(cite)} className={cx("text-left text-[12px] text-accent-text decoration-accent/40 underline-offset-2 hover:underline", className)}>
      {cite.label}
    </button>
  );
}
