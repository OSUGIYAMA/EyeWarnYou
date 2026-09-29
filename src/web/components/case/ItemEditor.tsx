import { useQuery } from "@tanstack/react-query";
import { BookOpen, ChevronDown, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Case, FdpInfo, Item } from "../../lib/api.ts";
import { api } from "../../lib/api.ts";
import type { ItemAssessment } from "@/shared/assessment.ts";
import { cx } from "../../lib/format.ts";
import { AnswerToggle, Badge, Field, IconButton, Input, OutcomePill, Segmented, Select, Textarea } from "../ui/index.tsx";
import { CountryPicker } from "../CountryPicker.tsx";
import { useRegSheet } from "../RegSheet.tsx";
import { EccnInput, KouPicker } from "./pickers.tsx";
import { CN_MATERIALS } from "@/engine/cn/measures.ts";

const CURRENCIES = ["USD", "JPY", "EUR", "CNY", "GBP", "KRW", "TWD"] as const;

function useDebounced<T>(v: T, ms = 300) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

export function ItemEditor({
  c,
  item,
  index,
  fdp,
  assessments,
  onChange,
  onRemove,
  defaultOpen,
}: {
  c: Case;
  item: Item;
  index: number;
  fdp?: FdpInfo;
  assessments: { jurisdiction: string; a?: ItemAssessment }[];
  onChange: (fn: (i: Item) => void, immediate?: boolean) => void;
  onRemove: () => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? true);
  const [tab, setTab] = useState<"us" | "jp" | "cn">(c.shipFrom === "JP" ? "jp" : c.shipFrom === "CN" ? "cn" : "us");
  const openReg = useRegSheet();
  const hs = useDebounced(item.hsCode ?? "");
  const hsInfo = useQuery({
    queryKey: ["hs", hs],
    queryFn: () => api.get<{ jpCatchAll: string; russia: Record<string, boolean> }>(`/hs/${hs.replace(/\D/g, "")}`),
    enabled: hs.replace(/\D/g, "").length >= 4,
  });
  const russiaScope = ["RU", "BY"].includes(c.destination);

  return (
    <div className="rounded-xl border border-line bg-panel shadow-card">
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={() => setOpen((o) => !o)} className="flex size-6 items-center justify-center rounded-md text-fg-3 hover:bg-panel-2" aria-label={open ? "Collapse" : "Expand"}>
          <ChevronDown className={cx("size-4 transition-transform", !open && "-rotate-90")} />
        </button>
        <span className="font-mono text-[11.5px] text-fg-3">#{index + 1}</span>
        <input
          value={item.name}
          onChange={(e) => onChange((i) => void (i.name = e.target.value))}
          placeholder="Item name"
          className="min-w-0 flex-1 bg-transparent text-[14px] font-medium outline-none placeholder:text-fg-3"
        />
        <div className="flex shrink-0 items-center gap-1.5">
          {assessments.map(({ jurisdiction, a }) => a && a.outcome !== "not_applicable" && (
            <span key={jurisdiction} className="flex items-center gap-1">
              <span className="text-[10.5px] font-semibold text-fg-3">{jurisdiction}</span>
              <OutcomePill outcome={a.outcome} size="sm" />
            </span>
          ))}
        </div>
        <IconButton label="Remove item" onClick={onRemove}>
          <Trash2 className="size-3.5" />
        </IconButton>
      </div>
      {open && (
        <div className="border-t border-line px-4 pb-4 pt-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Field label="Model / part no.">
              <Input value={item.model ?? ""} onChange={(e) => onChange((i) => void (i.model = e.target.value))} />
            </Field>
            <Field label="Manufacturer">
              <Input value={item.manufacturer ?? ""} onChange={(e) => onChange((i) => void (i.manufacturer = e.target.value))} />
            </Field>
            <Field label="Type">
              <Select value={item.kind} onChange={(e) => onChange((i) => void (i.kind = e.target.value as Item["kind"]), true)}>
                <option value="commodity">Commodity (goods)</option>
                <option value="software">Software</option>
                <option value="technology">Technology</option>
              </Select>
            </Field>
            <Field label="Country of origin">
              <CountryPicker value={item.countryOfOrigin} onChange={(v) => onChange((i) => void (i.countryOfOrigin = v), true)} placeholder="Made in…" />
            </Field>
            <Field label="Quantity">
              <Input type="number" min={1} value={item.quantity} onChange={(e) => onChange((i) => void (i.quantity = Math.max(1, Number(e.target.value) || 1)))} className="tabular" />
            </Field>
            <Field label="Unit value">
              <div className="flex gap-1.5">
                <Input type="number" min={0} value={item.unitValue ?? ""} onChange={(e) => onChange((i) => void (i.unitValue = e.target.value === "" ? undefined : Number(e.target.value)))} className="tabular" />
                <Select value={item.currency} onChange={(e) => onChange((i) => void (i.currency = e.target.value as Item["currency"]), true)} className="w-[76px] shrink-0">
                  {CURRENCIES.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </Select>
              </div>
            </Field>
            <Field
              label="HS code"
              className="col-span-2"
              hint={
                hsInfo.data ? (
                  <span className="flex flex-wrap gap-1">
                    <Badge tone={hsInfo.data.jpCatchAll === "16-1" ? "orange" : hsInfo.data.jpCatchAll === "16-2" ? "blue" : "gray"}>
                      {hsInfo.data.jpCatchAll === "16-1" ? "JP 16の項（1）sensitive goods" : hsInfo.data.jpCatchAll === "16-2" ? "JP 16の項（2）" : "Outside JP catch-all"}
                    </Badge>
                    {hsInfo.data.russia.supp4 && <Badge tone="red">EAR Russia Supp. 4</Badge>}
                    {hsInfo.data.russia.supp5 && <Badge tone="red">EAR Russia Supp. 5</Badge>}
                    {hsInfo.data.russia.supp7 && <Badge tone="amber">EAR Supp. 7 (FDP / Iran)</Badge>}
                  </span>
                ) : (
                  "6 digits or more — drives the Japanese catch-all scope and EAR99 sanctions lists"
                )
              }
            >
              <Input value={item.hsCode ?? ""} onChange={(e) => onChange((i) => void (i.hsCode = e.target.value))} placeholder="8542.31" className="font-mono" />
            </Field>
          </div>
          <Field label="Description & key specifications" className="mt-3">
            <Textarea rows={2} value={item.description ?? ""} onChange={(e) => onChange((i) => void (i.description = e.target.value))} placeholder="Function, performance parameters, encryption, operating temperature… (used for classification)" />
          </Field>

          <div className="mt-4 flex items-center justify-between">
            <Segmented
              value={tab}
              onChange={setTab}
              options={[
                { value: "jp", label: "Japan — FEFTA" },
                { value: "us", label: "United States — EAR" },
                { value: "cn", label: "China — ECL" },
              ]}
            />
            <Link
              to={`/classify?case=${c.id}&item=${item.id}`}
              className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-medium text-accent-text hover:bg-accent-soft"
            >
              <Sparkles className="size-3.5" /> Classify with AI
            </Link>
          </div>

          {tab === "us" && (
            <div className="mt-3 space-y-3 rounded-lg bg-panel-2/60 p-3 ring-1 ring-line">
              <Field label="Relationship to the United States (15 CFR 734.3)">
                <Segmented
                  value={item.us.origin}
                  onChange={(v) => onChange((i) => void (i.us.origin = v), true)}
                  options={[
                    { value: "us_origin", label: "US-origin" },
                    { value: "foreign_with_us_content", label: "Foreign-made, US content" },
                    { value: "foreign_no_us_content", label: "Foreign-made, no US content" },
                    { value: "unknown", label: "Unknown" },
                  ]}
                />
              </Field>
              {item.us.origin === "foreign_with_us_content" && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label={`Controlled US content value (${item.currency}, per unit)`} hint="Only US content that would need a license to this destination (Supp. No. 2 to Part 734)">
                    <Input type="number" min={0} value={item.us.usContentValue ?? ""} onChange={(e) => onChange((i) => void (i.us.usContentValue = e.target.value === "" ? undefined : Number(e.target.value)))} className="tabular" />
                  </Field>
                  <Field label="ECCNs of the US content" hint="Comma-separated; drives 0% de minimis rules (e.g. 9A515.a, 3A090)">
                    <Input value={item.us.usContentEccns.join(", ")} onChange={(e) => onChange((i) => void (i.us.usContentEccns = e.target.value.split(/[,\s]+/).filter(Boolean)))} className="font-mono" />
                  </Field>
                </div>
              )}
              {(item.us.origin === "foreign_with_us_content" || item.us.origin === "foreign_no_us_content") && fdp && (
                <div className="rounded-lg bg-panel p-3 ring-1 ring-line">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 text-[13px]">
                      <div className="font-medium">Foreign Direct Product rules (§734.9)</div>
                      <div className="mt-0.5 text-fg-2">{fdp.gate.text}</div>
                    </div>
                    <AnswerToggle value={item.us.fdp.gate ?? "unknown"} onChange={(v) => onChange((i) => void (i.us.fdp.gate = v), true)} />
                  </div>
                  {item.us.fdp.gate === "yes" && (
                    <div className="mt-3 space-y-2 border-t border-line pt-3">
                      {fdp.rules.length === 0 && <div className="text-[12.5px] text-fg-3">No FDP rule reaches this destination from this shipping country.</div>}
                      {fdp.rules.map((r) => (
                        <div key={r.id} className="flex items-start gap-3">
                          <div className="flex-1 text-[12.5px]">
                            <button onClick={() => openReg({ kind: "section", id: "734.9", label: `15 CFR ${r.para}` })} className="font-medium hover:underline">
                              {r.name} <span className="font-normal text-fg-3">§{r.para}</span>
                            </button>
                            <div className="text-fg-2">{r.product}</div>
                            <div className="text-fg-3">{r.scope}</div>
                          </div>
                          <AnswerToggle size="sm" value={item.us.fdp[r.id] ?? "unknown"} onChange={(v) => onChange((i) => void (i.us.fdp[r.id] = v), true)} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="grid grid-cols-[1fr_120px_150px] gap-3">
                <Field label="ECCN">
                  <EccnInput value={item.us.eccn} onChange={(v) => onChange((i) => void (i.us.eccn = v), true)} />
                </Field>
                <Field label="Paragraph">
                  <Input value={item.us.paragraph} onChange={(e) => onChange((i) => void (i.us.paragraph = e.target.value.replace(/^\./, "").trim()))} placeholder="b.2" className="font-mono" disabled={item.us.eccn === "EAR99"} />
                </Field>
                <Field label="Status">
                  <Select value={item.us.classification} onChange={(e) => onChange((i) => void (i.us.classification = e.target.value as Item["us"]["classification"]), true)}>
                    <option value="confirmed">Confirmed</option>
                    <option value="provisional">Provisional</option>
                    <option value="unclassified">Unclassified</option>
                  </Select>
                </Field>
              </div>
              <div className="flex items-start gap-2">
                <Textarea rows={2} value={item.us.classificationBasis ?? ""} onChange={(e) => onChange((i) => void (i.us.classificationBasis = e.target.value))} placeholder="Basis: manufacturer's ECCN statement, CCATS number, internal determination…" className="text-[13px]" />
                {/^\d[A-E]\d{3}$/.test(item.us.eccn) && (
                  <button onClick={() => openReg({ kind: "eccn", id: item.us.eccn, paragraph: item.us.paragraph || undefined })} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-medium text-fg-2 ring-1 ring-line-strong hover:bg-panel">
                    <BookOpen className="size-3.5" /> Entry
                  </button>
                )}
              </div>
            </div>
          )}

          {tab === "cn" && (
            <div className="mt-3 space-y-3 rounded-lg bg-panel-2/60 p-3 ring-1 ring-line">
              <Field label="China-origin controlled materials in or supplied with this item" hint="Each links to the MOFCOM measure that controls it; status (in force / suspended) is evaluated on the ship date.">
                <div className="flex flex-wrap gap-1.5">
                  {CN_MATERIALS.map((m) => {
                    const on = item.cn.materials.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => onChange((i) => void (i.cn.materials = on ? i.cn.materials.filter((x) => x !== m.id) : [...i.cn.materials, m.id]), true)}
                        className={cx("h-6 rounded-md px-2 text-[12px] ring-1 ring-inset transition-colors", on ? "bg-orange-soft text-orange-text ring-orange/30" : "bg-panel text-fg-2 ring-line hover:ring-line-strong")}
                        title={`CN ${m.code} · ${m.measure}`}
                      >
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </Field>
              {item.cn.materials.some((id) => CN_MATERIALS.find((m) => m.id === id)?.magnet) && (
                <Field label="China-origin controlled rare-earth content (% of item value)" hint="The test in MOFCOM 2025 No. 61 (currently suspended) is ≥ 0.1%.">
                  <Input type="number" min={0} max={100} step="0.01" value={item.cn.cnControlledContentPct ?? ""} onChange={(e) => onChange((i) => void (i.cn.cnControlledContentPct = e.target.value === "" ? undefined : Number(e.target.value)))} className="w-32 tabular" />
                </Field>
              )}
              {c.shipFrom === "CN" && (
                <div className="grid grid-cols-[1fr_160px] gap-3">
                  <Field label="China's Dual-Use Items Export Control List">
                    <Segmented
                      value={item.cn.listStatus}
                      onChange={(v) => onChange((i) => void (i.cn.listStatus = v), true)}
                      options={[
                        { value: "listed", label: "Listed" },
                        { value: "not_listed", label: "Not listed" },
                        { value: "unclassified", label: "Unclassified" },
                      ]}
                    />
                  </Field>
                  <Field label="CN control code">
                    <Input value={item.cn.cnCode} onChange={(e) => onChange((i) => void (i.cn.cnCode = e.target.value.trim()))} placeholder="3C001" className="font-mono" />
                  </Field>
                </div>
              )}
            </div>
          )}

          {tab === "jp" && (
            <div className="mt-3 space-y-3 rounded-lg bg-panel-2/60 p-3 ring-1 ring-line">
              <Field label="該非判定 — 輸出令別表第一 1〜15の項">
                <Segmented
                  value={item.jp.listStatus}
                  onChange={(v) => onChange((i) => void (i.jp.listStatus = v), true)}
                  options={[
                    { value: "listed", label: "Listed (該当)" },
                    { value: "not_listed", label: "Not listed (非該当)" },
                    { value: "unclassified", label: "Unclassified" },
                  ]}
                />
              </Field>
              {item.jp.listStatus === "listed" && (
                <Field label="項番">
                  <KouPicker value={item.jp.kou} onChange={(v) => onChange((i) => void (i.jp.kou = v), true)} />
                </Field>
              )}
              {item.jp.listStatus !== "listed" && (
                <Field label="Catch-all scope (16の項)" hint="Derived from the HS code unless you override it">
                  <Select value={item.jp.catchAllScope} onChange={(e) => onChange((i) => void (i.jp.catchAllScope = e.target.value as Item["jp"]["catchAllScope"]), true)}>
                    <option value="unknown">Auto from HS code{hsInfo.data ? ` — ${hsInfo.data.jpCatchAll === "16-1" ? "16の項（1）" : hsInfo.data.jpCatchAll === "16-2" ? "16の項（2）" : "outside 16の項"}` : ""}</option>
                    <option value="16-1">16の項（1）— HS-designated sensitive goods</option>
                    <option value="16-2">16の項（2）— other catch-all goods</option>
                    <option value="out_of_scope">Outside 16の項</option>
                  </Select>
                </Field>
              )}
              {(russiaScope || item.jp.appendix2_3 !== "unknown") && (
                <div className="flex items-start gap-3 rounded-lg bg-panel p-3 ring-1 ring-line">
                  <div className="flex-1 text-[13px]">
                    <div className="font-medium">Russia / Belarus export-approval list (別表第二の三)</div>
                    <div className="text-fg-2">Do the goods fall under 輸出令別表第二の三? List-controlled goods always do.</div>
                  </div>
                  <AnswerToggle value={item.jp.appendix2_3} onChange={(v) => onChange((i) => void (i.jp.appendix2_3 = v), true)} />
                </div>
              )}
              <Textarea rows={2} value={item.jp.classificationBasis ?? ""} onChange={(e) => onChange((i) => void (i.jp.classificationBasis = e.target.value))} placeholder="Basis: 該非判定書 no., パラメータシート, manufacturer statement…" className="text-[13px]" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
