import { useQuery } from "@tanstack/react-query";
import { BookOpen, ChevronDown, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Case, FdpInfo, Item } from "../../lib/api.ts";
import { api } from "../../lib/api.ts";
import type { ItemAssessment } from "@/shared/assessment.ts";
import { cx } from "../../lib/format.ts";
import { AnswerToggle, Card, Field, IconButton, Input, OutcomeDot, Segmented, Select, Textarea } from "../ui/index.tsx";
import { CountryPicker } from "../CountryPicker.tsx";
import { useRegSheet } from "../RegSheet.tsx";
import { EccnInput, KouPicker } from "./pickers.tsx";
import { ITEM_DATA } from "@/shared/progress.ts";
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
  const LAW: Record<string, string> = { JP: "Japan", US: "United States", CN: "China" };
  const missing = assessments.flatMap(({ jurisdiction, a }) =>
    (a?.findings ?? []).filter((f) => f.status === "incomplete" && ITEM_DATA.has(f.id)).map((f) => ({ key: `${jurisdiction}.${f.id}`, law: LAW[jurisdiction] ?? jurisdiction, title: f.title })),
  );

  return (
    <Card>
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={() => setOpen((o) => !o)} className="flex size-7 items-center justify-center rounded-full text-fg-3 hover:bg-fill" aria-label={open ? "Collapse" : "Expand"}>
          <ChevronDown className={cx("size-4 transition-transform", !open && "-rotate-90")} />
        </button>
        <span className="text-[13px] tabular text-fg-3">{index + 1}</span>
        <input
          value={item.name}
          onChange={(e) => onChange((i) => void (i.name = e.target.value))}
          placeholder="What is it? e.g. Spectrum analyzer, 26.5 GHz"
          className="min-w-0 flex-1 rounded-md bg-transparent text-[15px] font-semibold tracking-tight outline-none placeholder:font-normal placeholder:text-fg-3 focus:bg-fill-2"
        />
        <div className="flex shrink-0 items-center gap-3">
          {assessments.map(({ jurisdiction, a }) => a && a.outcome !== "not_applicable" && (
            <span key={jurisdiction} className="flex items-center gap-1.5 text-[12px] font-medium text-fg-3" title={`${jurisdiction}: ${a.summary}`}>
              <OutcomeDot outcome={a.outcome} />
              {jurisdiction}
            </span>
          ))}
        </div>
        <IconButton label="Remove item" onClick={onRemove}>
          <Trash2 className="size-3.5" />
        </IconButton>
      </div>
      {open && (
        <div className="border-t border-line px-5 pb-5 pt-4">
          {missing.length > 0 && (
            <div className="mb-5 rounded-xl bg-accent-soft px-4 py-3">
              <div className="text-[13px] font-semibold text-accent-text">To complete this item</div>
              <ul className="mt-1 space-y-0.5 text-[13px] leading-snug text-fg">
                {missing.map((m) => (
                  <li key={m.key} className="flex gap-2">
                    <span className="w-24 shrink-0 text-fg-2">{m.law}</span>
                    <span>{m.title}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="grid grid-cols-2 gap-x-3 gap-y-4 md:grid-cols-4">
            <Field label="Model / part no.">
              <Input value={item.model ?? ""} onChange={(e) => onChange((i) => void (i.model = e.target.value))} />
            </Field>
            <Field label="Manufacturer">
              <Input value={item.manufacturer ?? ""} onChange={(e) => onChange((i) => void (i.manufacturer = e.target.value))} />
            </Field>
            <Field label="Type">
              <Select value={item.kind} onChange={(e) => onChange((i) => void (i.kind = e.target.value as Item["kind"]), true)}>
                <option value="commodity">Goods</option>
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
                <Input type="number" min={0} value={item.unitValue ?? ""} onChange={(e) => onChange((i) => void (i.unitValue = e.target.value === "" ? undefined : Number(e.target.value)))} className="min-w-0 flex-1 tabular" />
                <Select value={item.currency} onChange={(e) => onChange((i) => void (i.currency = e.target.value as Item["currency"]), true)} className="w-[68px] shrink-0 pr-5">
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
                  <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-fg-2">
                    <span className="inline-flex items-center gap-1.5">
                      <span className={cx("size-1.5 rounded-full", hsInfo.data.jpCatchAll === "16-1" ? "bg-orange" : "bg-fg-3/50")} />
                      {hsInfo.data.jpCatchAll === "16-1" ? "Japan catch-all 16の項（1）: sensitive goods" : hsInfo.data.jpCatchAll === "16-2" ? "Japan catch-all 16の項（2）" : "Outside Japan’s catch-all"}
                    </span>
                    {(hsInfo.data.russia.supp4 || hsInfo.data.russia.supp5) && (
                      <span className="inline-flex items-center gap-1.5">
                        <span className={cx("size-1.5 rounded-full", russiaScope ? "bg-red" : "bg-fg-3/50")} />
                        {russiaScope ? "License needed to Russia/Belarus even as EAR99" : "On the EAR Russia HTS list"} (Supp. {hsInfo.data.russia.supp4 ? "4" : "5"} to Part 746)
                      </span>
                    )}
                    {hsInfo.data.russia.supp7 && (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="size-1.5 rounded-full bg-fg-3/50" />
                        EAR Supp. 7 (FDP / Iran)
                      </span>
                    )}
                  </span>
                ) : (
                  "Six digits or more. Drives Japan’s catch-all scope and the EAR Russia lists."
                )
              }
            >
              <Input value={item.hsCode ?? ""} onChange={(e) => onChange((i) => void (i.hsCode = e.target.value))} placeholder="8542.31" className="font-mono" />
            </Field>
          </div>
          <Field label="Description and key specifications" className="mt-4">
            <Textarea rows={2} value={item.description ?? ""} onChange={(e) => onChange((i) => void (i.description = e.target.value))} placeholder="Function, performance parameters, encryption, operating temperature… (used for classification)" />
          </Field>

          <div className="mt-6 flex items-center justify-between gap-3 border-t border-line pt-5">
            <div className="text-[14px] font-semibold">Classification</div>
            <Link to={`/classify?case=${c.id}&item=${item.id}`} className="ml-auto text-[13px] font-medium text-accent-text hover:underline">
              Suggest from the description
            </Link>
          </div>
          <div className="mt-3">
            <Segmented
              value={tab}
              onChange={setTab}
              options={[
                { value: "jp", label: "Japan" },
                { value: "us", label: "United States" },
                { value: "cn", label: "China" },
              ]}
            />
          </div>

          {tab === "us" && (
            <div className="mt-4 space-y-4">
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
                <div className="rounded-xl bg-panel-2 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 text-[13px]">
                      <div className="font-medium">Foreign Direct Product rules (§734.9)</div>
                      <div className="mt-0.5 text-fg-2">{fdp.gate.text}</div>
                    </div>
                    <AnswerToggle value={item.us.fdp.gate ?? "unknown"} onChange={(v) => onChange((i) => void (i.us.fdp.gate = v), true)} />
                  </div>
                  {item.us.fdp.gate === "yes" && (
                    <div className="mt-3 space-y-3 border-t border-line pt-3">
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
              <div className="grid grid-cols-[1fr_110px_150px] gap-3">
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
                  <button onClick={() => openReg({ kind: "eccn", id: item.us.eccn, paragraph: item.us.paragraph || undefined })} className="inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-full bg-fill px-3.5 text-[13px] font-medium text-fg hover:bg-panel-3">
                    <BookOpen className="size-3.5" /> Read entry
                  </button>
                )}
              </div>
            </div>
          )}

          {tab === "cn" && (
            <div className="mt-4 space-y-4">
              <Field label="China-origin controlled materials in or supplied with this item" hint="Each links to the MOFCOM measure that controls it; status (in force / suspended) is evaluated on the ship date.">
                <div className="flex flex-wrap gap-1.5">
                  {CN_MATERIALS.map((m) => {
                    const on = item.cn.materials.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => onChange((i) => void (i.cn.materials = on ? i.cn.materials.filter((x) => x !== m.id) : [...i.cn.materials, m.id]), true)}
                        className={cx("h-7 rounded-full px-3 text-[12.5px] font-medium transition-colors", on ? "bg-fg text-bg" : "bg-fill-2 text-fg-2 hover:bg-fill")}
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
                <div className="grid grid-cols-[1fr_150px] gap-3">
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
            <div className="mt-4 space-y-4">
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
                <div className="flex items-start gap-3 rounded-xl bg-panel-2 p-4">
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
    </Card>
  );
}
