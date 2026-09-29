// Side sheet that shows the regulation text behind any citation, with the cited paragraph highlighted.
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { api, type Citation, type EccnDetail, type RegSection } from "../lib/api.ts";
import { cx } from "../lib/format.ts";
import { Badge, Sheet, Skeleton } from "./ui/index.tsx";
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
        subtitle={target?.kind === "eccn" ? "Commerce Control List — 15 CFR Part 774, Supp. No. 1" : undefined}
        actions={
          target?.kind === "eccn" ? (
            <Link to={`/regulations/ccl/${target.id}`} onClick={() => setTarget(null)} className="mr-1 text-[12.5px] font-medium text-accent-text hover:underline">
              Open full page
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
  if (!q.data) return <div className="space-y-2 p-5">{[1, 2, 3, 4].map((i) => <Skeleton key={i} />)}</div>;
  return (
    <div className="p-5">
      <EccnBody eccn={q.data} highlight={paragraph} compact />
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

export function SectionBody({ id, highlight }: { id: string; highlight?: string }) {
  const q = useQuery({ queryKey: ["section", id], queryFn: () => api.get<RegSection>(`/library/section?id=${encodeURIComponent(id)}`) });
  const ref = useRef<HTMLDivElement>(null);
  const hi = useMemo(() => (q.data ? findHighlight(q.data.paragraphs, highlight) : -1), [q.data, highlight]);
  useEffect(() => {
    if (hi >= 0) ref.current?.querySelector(`[data-p="${hi}"]`)?.scrollIntoView({ block: "center" });
  }, [hi]);
  if (q.isError) return <div className="p-5 text-[13px] text-fg-3">This section is not in the local library.</div>;
  if (!q.data) return <div className="space-y-2 p-5">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} />)}</div>;
  const s = q.data;
  return (
    <div ref={ref} className="p-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone={s.source === "jp" ? "violet" : "blue"}>{s.source === "jp" ? "Japan" : "US EAR"}</Badge>
        <span className="text-[13px] font-medium">{s.cite}</span>
        <span className="text-[13px] text-fg-3">{s.title}</span>
        <a href={s.url} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-[12px] text-fg-3 hover:text-fg">
          Official text <ExternalLink className="size-3" />
        </a>
      </div>
      <div className={cx("reg-text space-y-1.5", s.source === "jp" && "tracking-wide")}>
        {s.paragraphs.map((p, i) => (
          <p
            key={i}
            data-p={i}
            className={cx("rounded-md px-2 py-0.5 text-fg-2", i === hi && "bg-amber-soft text-fg ring-1 ring-amber/30")}
            style={{ marginLeft: `${Math.min(p.depth, 5) * 16}px` }}
          >
            {p.label && !p.text.startsWith(p.label) && <span className="mr-1.5 font-medium text-fg">{p.label}</span>}
            {p.text}
          </p>
        ))}
      </div>
    </div>
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
