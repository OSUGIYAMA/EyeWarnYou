// Structured rendering of a CCL entry: destination check, license requirements, license exceptions,
// related controls and the list of items. Used by the ECCN page and by the citation sheet (compact).
import { useQueries, useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { api, type EccnDetail } from "../lib/api.ts";
import { cx, TONE_DOT, type Tone } from "../lib/format.ts";
import { Badge, Card, Skeleton, Tooltip } from "./ui/index.tsx";
import { CountryName, CountryPicker } from "./CountryPicker.tsx";

export const REASONS: Record<string, string> = {
  NS: "National security",
  MT: "Missile technology",
  NP: "Nuclear nonproliferation",
  CB: "Chemical & biological weapons",
  RS: "Regional stability",
  CC: "Crime control",
  AT: "Anti-terrorism",
  FC: "Firearms convention",
  UN: "United Nations embargo",
  EI: "Encryption items",
  SL: "Surreptitious listening",
  SS: "Short supply",
  CW: "Chemical Weapons Convention",
  SI: "Significant items",
};

export const CATEGORY_SHORT: Record<string, string> = {
  "0": "Nuclear & miscellaneous",
  "1": "Materials, chemicals & toxins",
  "2": "Materials processing",
  "3": "Electronics",
  "4": "Computers",
  "5": "Telecom & information security",
  "6": "Sensors & lasers",
  "7": "Navigation & avionics",
  "8": "Marine",
  "9": "Aerospace & propulsion",
};

export const GROUPS: Record<string, string> = {
  A: "Systems, equipment & components",
  B: "Test, inspection & production equipment",
  C: "Materials",
  D: "Software",
  E: "Technology",
};

// ---------------------------------------------------------------------------
// Destination check

export interface CheckRow {
  index: number;
  reason: string;
  scope: string;
  chart: string;
  applies: "yes" | "no" | "maybe";
  appliesWhy: string;
  licenseRequired: "yes" | "no" | "unknown";
  cells: { reason: string; column: string; x: boolean }[];
  note?: string;
}
export interface CheckResult {
  dest: string;
  groups: string[];
  rows: CheckRow[];
}

export interface Verdict {
  tone: Tone;
  /** Short label for lists. */
  label: string;
  /** Sentence-case headline for the selected destination. */
  headline: string;
  reasons: string[];
  detail: string;
}

/** Collapse a row-by-row Country Chart result into one verdict for the entry as a whole. */
export function summarize(rows: CheckRow[]): Verdict {
  if (!rows.length) return { tone: "neutral", label: "No table", headline: "No license table", reasons: [], detail: "This entry has no EAR License Requirements table." };
  const live = rows.filter((r) => r.applies !== "no");
  const hard = live.filter((r) => r.applies === "yes" && r.licenseRequired === "yes");
  const soft = live.filter((r) => r.applies === "maybe" && r.licenseRequired === "yes");
  const unknown = live.filter((r) => r.licenseRequired === "unknown");
  const uniq = (xs: CheckRow[]) => [...new Set(xs.map((r) => r.reason))];
  if (hard.length) {
    const extra = uniq(soft).filter((r) => !uniq(hard).includes(r));
    return {
      tone: "orange",
      label: "License",
      headline: "License required",
      reasons: [...uniq(hard), ...extra],
      detail: `Required for ${uniq(hard).join(", ")} across the whole entry${extra.length ? `; also for ${extra.join(", ")} on some paragraphs or conditions` : ""}.`,
    };
  }
  if (soft.length)
    return {
      tone: "amber",
      label: "Depends",
      headline: "Depends on the paragraph",
      reasons: uniq(soft),
      detail: `Required for ${uniq(soft).join(", ")} only for some paragraphs or under a stated condition — classify to the paragraph.`,
    };
  if (unknown.length && unknown.every((r) => /not found on the Commerce Country Chart/i.test(r.note ?? "")))
    return { tone: "neutral", label: "Not on chart", headline: "Not on the Country Chart", reasons: [], detail: "This destination has no row on the Commerce Country Chart." };
  if (unknown.length) return { tone: "gray", label: "Read text", headline: "Read the entry text", reasons: uniq(unknown), detail: unknown.map((r) => r.note ?? r.chart).join(" · ") };
  return { tone: "green", label: "No license", headline: "No license required", reasons: [], detail: "No Country Chart license requirement for any reason on this entry." };
}

export function ToneDot({ tone, className }: { tone: Tone; className?: string }) {
  if (tone === "neutral") return <span className={cx("size-2 shrink-0 rounded-full ring-[1.5px] ring-inset ring-fg-3", className)} />;
  return <span className={cx("size-2 shrink-0 rounded-full", TONE_DOT[tone], className)} />;
}

const QUICK_DESTS = ["CN", "RU", "IN", "VN", "TH", "AE", "KR", "US"];

function CommonDestinations({ id, dest, onPick }: { id: string; dest: string; onPick: (iso: string) => void }) {
  const results = useQueries({
    queries: QUICK_DESTS.map((d) => ({
      queryKey: ["eccn-check", id, d, ""],
      queryFn: () => api.get<CheckResult>(`/ccl/${id}/check?dest=${d}&para=`),
      staleTime: 5 * 60_000,
    })),
  });
  return (
    <div className="grid grid-cols-2 gap-1 p-2 sm:grid-cols-4">
      {QUICK_DESTS.map((d, i) => {
        const r = results[i];
        const s = r.data ? summarize(r.data.rows) : null;
        return (
          <Tooltip key={d} content={s ? `${s.headline}. ${s.detail}` : null}>
            <button
              type="button"
              onClick={() => onPick(d)}
              aria-pressed={dest === d}
              className={cx("flex min-w-0 items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors", dest === d ? "bg-fill" : "hover:bg-fill-2")}
            >
              {s ? <ToneDot tone={s.tone} /> : <span className="size-2 shrink-0" />}
              <span className="min-w-0 flex-1 truncate text-[13.5px]">
                <CountryName iso2={d} withCode={false} />
              </span>
              <span className="shrink-0 text-[12px] text-fg-3">{r.isError ? "—" : s ? s.label : <Skeleton className="h-3 w-10" />}</span>
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------

const cleanHeading = (h: string) => h.replace(/\s*\(see List of Items Controlled\)\.?/i, "").trim();
const sentence = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

const DETAIL_FIELDS: { match: RegExp; label: string }[] = [
  { match: /^Unit/i, label: "Unit" },
  { match: /^Related Controls/i, label: "Related controls" },
  { match: /^Related Definitions/i, label: "Related definitions" },
  { match: /^Technical Note/i, label: "Technical note" },
  { match: /^Reporting Requirements/i, label: "Reporting" },
  { match: /^License Requirements$/i, label: "Additional requirements" },
  { match: /^STA$/i, label: "Special conditions for STA" },
];

function linkifyEccns(text: string, known: Set<string>, self: string): ReactNode[] {
  return text.split(/(\b\d[A-E]\d{3}\b)/g).map((part, i) =>
    i % 2 === 1 && known.has(part) && part !== self ? (
      <Link key={i} to={`/regulations/ccl/${part}`} className="font-mono text-[12.5px] text-accent-text hover:underline">
        {part}
      </Link>
    ) : (
      part
    ),
  );
}

function Clamped({ children, long }: { children: ReactNode; long: boolean }) {
  const [more, setMore] = useState(false);
  return (
    <>
      <div className={cx(long && !more && "line-clamp-4")}>{children}</div>
      {long && (
        <button type="button" onClick={() => setMore((m) => !m)} className="mt-1 text-[12.5px] font-medium text-accent-text hover:underline">
          {more ? "Show less" : "Show all"}
        </button>
      )}
    </>
  );
}

function Group({ compact, children, className }: { compact?: boolean; children: ReactNode; className?: string }) {
  return compact ? <div className={cx("k-list border-y border-line [--inset:0px]", className)}>{children}</div> : <Card className={cx("k-list overflow-hidden", className)}>{children}</Card>;
}

function Heading({ compact, children, description }: { compact?: boolean; children: ReactNode; description?: ReactNode }) {
  return (
    <div className={cx("mb-2.5", !compact && "px-1")}>
      <h2 className={cx("font-semibold tracking-tight", compact ? "text-[15px]" : "text-[17px]")}>{children}</h2>
      {description && <p className="mt-0.5 text-[13px] leading-snug text-fg-2">{description}</p>}
    </div>
  );
}

export function EccnBody({ eccn, highlight, compact, known, actions }: { eccn: EccnDetail; highlight?: string; compact?: boolean; known?: Set<string>; actions?: ReactNode }) {
  const [dest, setDest] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (highlight) ref.current?.querySelector(`[data-ref="${highlight}"]`)?.scrollIntoView({ block: "center" });
  }, [highlight, eccn.id]);
  useEffect(() => setDest(""), [eccn.id]);
  const check = useQuery({
    queryKey: ["eccn-check", eccn.id, dest, highlight ?? ""],
    queryFn: () => api.get<CheckResult>(`/ccl/${eccn.id}/check?dest=${dest}&para=${highlight ?? ""}`),
    enabled: !!dest,
  });
  const verdict = check.data && check.data.dest === dest ? summarize(check.data.rows) : null;

  const details = useMemo(() => {
    const fields = eccn.blocks.filter((b) => b.kind === "field") as { kind: "field"; label: string; text: string }[];
    return DETAIL_FIELDS.flatMap((d) => {
      const text = fields.find((x) => d.match.test(x.label.trim()))?.text.trim();
      return text && !/^N\/?A\.?$/i.test(text) ? [{ label: d.label, text }] : [];
    });
  }, [eccn]);
  const refs = useMemo(() => {
    const text = details.find((d) => d.label === "Related controls")?.text ?? "";
    return known ? [...new Set(text.match(/\b\d[A-E]\d{3}\b/g) ?? [])].filter((r) => known.has(r) && r !== eccn.id) : [];
  }, [details, known, eccn.id]);

  const reasons = [...new Set(eccn.controls.map((c) => c.reason))];
  const shownReasons = reasons.length ? reasons : eccn.reasonForControl.filter((r) => /^[A-Z]{2,3}$/.test(r));
  const flags: { label: string; tip: string }[] = [
    eccn.series600 && { label: "600 series", tip: "Munitions items moved from the USML or on the Wassenaar Munitions List." },
    eccn.series515 && { label: "9x515", tip: "Spacecraft and related items moved from USML Category XV." },
    eccn.meuSupp2 && { label: "MEU item", tip: "Listed in Supplement No. 2 to Part 744 — military end-use and end-user controls apply." },
    eccn.itar && { label: "Subject to the ITAR", tip: "The heading refers to items subject to the ITAR; there is no EAR license table." },
  ].filter(Boolean) as { label: string; tip: string }[];

  const px = compact ? "px-0" : "px-4";

  const items = eccn.blocks.filter((b) => b.kind === "para" || b.kind === "note" || b.kind === "table");

  return (
    <div ref={ref} className={compact ? "space-y-7" : "space-y-9"}>
      {/* Heading */}
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          {!compact && <h1 className="font-mono text-[30px] font-semibold leading-tight tracking-[-0.02em]">{eccn.id}</h1>}
          <p className={cx("max-w-3xl leading-snug text-fg", compact ? "text-[15px] font-medium" : "mt-1 text-[17px]")}>{eccn.reserved ? "[Reserved]" : cleanHeading(eccn.heading)}</p>
          <p className="mt-1.5 text-[13px] text-fg-2">
            <Tooltip content={eccn.categoryTitle.replace(/[“”"]/g, "")}>
              <span className="cursor-default">{CATEGORY_SHORT[eccn.category] ?? eccn.categoryTitle.replace(/\s*\(.*$/, "").replace(/[“”"]/g, "")}</span>
            </Tooltip>{" "}
            · {GROUPS[eccn.group] ?? `Group ${eccn.group}`}
            {shownReasons.length > 0 && (
              <>
                {" · "}Controlled for{" "}
                {shownReasons.map((r, i) => (
                  <span key={r}>
                    {i > 0 && ", "}
                    <Tooltip content={REASONS[r]}>
                      <span className="cursor-default font-medium text-fg">{r}</span>
                    </Tooltip>
                  </span>
                ))}
              </>
            )}
          </p>
          {flags.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {flags.map((f) => (
                <Tooltip key={f.label} content={f.tip}>
                  <span>
                    <Badge tone="gray">{f.label}</Badge>
                  </span>
                </Tooltip>
              ))}
            </div>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>

      {/* Destination check */}
      {eccn.controls.length > 0 && (
        <section>
          <Heading compact={compact} description={compact ? undefined : "Country Chart result for this entry. End-use, end-user and embargo controls (Parts 744 and 746) apply separately."}>Check a destination</Heading>
          <Group compact={compact} className="[&>*+*::before]:!left-0">
            <div className={cx("flex flex-wrap items-center gap-x-5 gap-y-3 py-3", px)}>
              <div className="w-full sm:w-64">
                <CountryPicker value={dest} onChange={setDest} placeholder="Choose a destination" />
              </div>
              {dest ? (
                <div className="min-w-0 flex-1">
                  {verdict ? (
                    <>
                      <div className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
                        <ToneDot tone={verdict.tone} className="size-2.5" />
                        {verdict.headline}
                      </div>
                      <div className="mt-0.5 text-[13px] leading-snug text-fg-2">
                        {verdict.detail}{" "}
                        {!compact && (
                          <Link to={`/regulations/countries/${dest}`} className="inline-flex items-center whitespace-nowrap text-accent-text hover:underline">
                            All controls for this destination
                            <ChevronRight className="size-3.5" />
                          </Link>
                        )}
                      </div>
                    </>
                  ) : check.isError ? (
                    <div className="text-[13px] text-fg-3">The check could not be run.</div>
                  ) : (
                    <Skeleton className="h-5 w-56" />
                  )}
                </div>
              ) : (
                <div className="text-[13px] text-fg-3">{compact ? "Pick a country to see whether this entry needs a license." : "Or pick a common destination below."}</div>
              )}
            </div>
            {!compact && <CommonDestinations id={eccn.id} dest={dest} onPick={setDest} />}
          </Group>
        </section>
      )}

      {/* License requirements */}
      {eccn.controls.length > 0 && (
        <section>
          <Heading compact={compact}>License requirements</Heading>
          <Group compact={compact} className={compact ? undefined : "[--inset:64px]"}>
            {eccn.controls.map((c, i) => {
              const row = dest ? check.data?.rows.find((r) => r.index === i) : undefined;
              return (
                <div key={i} className={cx("flex gap-4 py-3", px)}>
                  <Tooltip content={REASONS[c.reason]}>
                    <span className="w-8 shrink-0 cursor-default pt-px font-mono text-[13px] font-semibold">{c.reason}</span>
                  </Tooltip>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] leading-snug">{sentence(c.scope.replace(/^[A-Z]{2,3}\s+/, ""))}</div>
                    <div className="mt-1 text-[13px] leading-snug text-fg-2">{c.chart}</div>
                    {row?.note && <div className="mt-1 text-[12.5px] leading-snug text-fg-3">{row.note}</div>}
                  </div>
                  {dest && (
                    <div className="w-36 shrink-0 pt-px text-right text-[13px]">
                      {!row ? (
                        <Skeleton className="ml-auto h-4 w-20" />
                      ) : row.applies === "no" ? (
                        <Tooltip content={row.appliesWhy}>
                          <span className="cursor-default text-fg-3">Not in scope</span>
                        </Tooltip>
                      ) : row.licenseRequired === "yes" ? (
                        <Tooltip content={row.appliesWhy}>
                          <span className="inline-flex cursor-default items-center gap-1.5 font-medium">
                            <ToneDot tone="orange" />
                            {row.applies === "maybe" ? "If in scope" : "License"}
                          </span>
                        </Tooltip>
                      ) : row.licenseRequired === "no" ? (
                        <span className="inline-flex items-center gap-1.5 font-medium">
                          <ToneDot tone="green" />
                          No license
                        </span>
                      ) : (
                        <span className="text-fg-3">Read the text</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </Group>
        </section>
      )}

      {/* License exceptions */}
      {eccn.licenseExceptions.length > 0 && (
        <section>
          <Heading compact={compact}>License exceptions</Heading>
          <Group compact={compact} className={compact ? undefined : "[--inset:112px]"}>
            {eccn.licenseExceptions.map((le) => (
              <div key={le.code} className={cx("flex gap-4 py-2.5", px)}>
                <span className={cx("w-20 shrink-0 pt-px font-mono text-[13px] font-medium", le.status === "no" && "text-fg-3")}>{le.code}</span>
                <span className={cx("min-w-0 flex-1 text-[13.5px] leading-relaxed", le.status === "no" ? "text-fg-3" : "text-fg-2")}>{le.text}</span>
              </div>
            ))}
          </Group>
        </section>
      )}

      {/* Related controls, definitions, unit, notes */}
      {details.length > 0 && (
        <section>
          <Heading compact={compact}>Related controls and notes</Heading>
          <Group compact={compact}>
            {details.map((d) => (
              <div key={d.label} className={cx("flex flex-col gap-1 py-3 sm:flex-row sm:gap-4", px)}>
                <div className="w-44 shrink-0 text-[13px] text-fg-2">{d.label}</div>
                <div className="min-w-0 flex-1 text-[13.5px] leading-relaxed">
                  {d.label === "Related controls" && refs.length > 0 && (
                    <div className="mb-1.5 flex flex-wrap gap-x-3 gap-y-1">
                      {refs.map((r) => (
                        <Link key={r} to={`/regulations/ccl/${r}`} className="font-mono text-[12.5px] font-medium text-accent-text hover:underline">
                          {r}
                        </Link>
                      ))}
                    </div>
                  )}
                  <Clamped long={d.text.length > 360}>{d.label === "Related controls" && known ? linkifyEccns(d.text, known, eccn.id) : d.text}</Clamped>
                </div>
              </div>
            ))}
          </Group>
        </section>
      )}

      {/* Items */}
      {items.length > 0 && (
        <section>
          <Heading compact={compact}>Items controlled</Heading>
          <div className={cx(!compact && "border-y border-line px-4 py-5")}>
            <div className="max-w-[80ch] text-[14px] leading-[1.7]">
              {items.map((b, i) => {
                if (b.kind === "note")
                  return (
                    <div key={i} className="my-3 border-l-2 border-line-strong py-0.5 pl-3.5 text-[13px] leading-relaxed text-fg-2">
                      {b.title && <div className="mb-0.5 font-medium text-fg">{b.title}</div>}
                      <div className="whitespace-pre-line">{b.text}</div>
                    </div>
                  );
                if (b.kind === "table")
                  return (
                    <div key={i} className="scroll-thin my-3 overflow-x-auto">
                      <table className="w-full border-y border-line text-[12.5px]">
                        <tbody>
                          {b.rows.map((r, j) => (
                            <tr key={j} className="border-t border-line first:border-0">
                              {r.map((cell, k) => (
                                <td key={k} className="px-2 py-1.5 align-top text-fg-2 first:pl-0">
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                if (b.kind !== "para") return null;
                const hi = !!highlight && !!b.ref && (b.ref === highlight || b.ref.startsWith(`${highlight}.`));
                return (
                  <p
                    key={i}
                    data-ref={b.ref}
                    className={cx("-mx-2 py-[3px] pr-2 transition-colors", hi && "bg-amber-soft")}
                    style={{ paddingLeft: `${8 + Math.max(0, (b.depth || 1) - 1) * 20}px` }}
                  >
                    {b.ref && <span className="mr-1.5 font-mono text-[12.5px] font-semibold">{b.ref}.</span>}
                    {b.text}
                  </p>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <p className={cx("text-[12px] text-fg-3", !compact && "px-1")}>Source: eCFR, 15 CFR Part 774 Supp. No. 1, as amended to {eccn.stamp.asOf}.</p>
    </div>
  );
}
