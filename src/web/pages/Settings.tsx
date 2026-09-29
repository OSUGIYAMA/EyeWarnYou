import { useQueryClient } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Page, useMeta } from "../components/AppShell.tsx";
import { Button, Card, Input, PageHeader, Section, Select, toast } from "../components/ui/index.tsx";
import { api, streamPost, type ChangeEntry, type Settings } from "../lib/api.ts";
import { cx, fmtDate, relTime } from "../lib/format.ts";

const BULK: { id: string; en: string }[] = [
  { id: "一般包括許可", en: "General bulk license" },
  { id: "特別一般包括許可", en: "Special general bulk license" },
  { id: "特定包括許可", en: "Specified bulk license" },
  { id: "特定子会社包括許可", en: "Specified subsidiary bulk license" },
  { id: "特別返品等包括許可", en: "Special bulk license for returns and repairs" },
];
const MODELS = [
  { id: "claude-opus-5", label: "Claude Opus 5 (recommended)" },
  { id: "claude-opus-5-5", label: "Claude Opus 5.5" },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5 (faster, lower cost)" },
  { id: "claude-fable-5-1", label: "Claude Fable 5.1 (most capable)" },
];
const CURRENCY: Record<string, string> = {
  JPY: "Japanese yen",
  EUR: "Euro",
  CNY: "Chinese yuan",
  GBP: "British pound",
  KRW: "South Korean won",
  TWD: "New Taiwan dollar",
};

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function SettingsPage() {
  const meta = useMeta();
  const qc = useQueryClient();
  const s = meta.data?.settings;
  const [form, setForm] = useState<Settings | null>(null);
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  useEffect(() => {
    if (s && !form) setForm(s);
  }, [s, form]);
  useEffect(() => {
    if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
  }, [form]);

  const save = async (section: string, patch: Partial<Settings> & { anthropicApiKey?: string }) => {
    setSaving(section);
    try {
      const next = await api.put<Settings>("/settings", patch);
      setForm(next);
      await qc.invalidateQueries({ queryKey: ["meta"] });
      toast("Settings saved", { tone: "success" });
    } catch (e) {
      toast("Could not save", { detail: (e as Error).message, tone: "error" });
    } finally {
      setSaving(null);
    }
  };

  if (!form || !s) return <Page><div /></Page>;

  const youDirty = !same([form.userName, form.company, [...form.bulkLicenses].sort()], [s.userName, s.company, [...s.bulkLicenses].sort()]);
  const screeningDirty = form.screeningThreshold !== s.screeningThreshold;
  const currencyDirty = !same([form.fxPerUsd, form.fxAsOf], [s.fxPerUsd, s.fxAsOf]);
  const aiDirty = !!key || form.aiModel !== s.aiModel;
  const revert = (patch: Partial<Settings>) => setForm({ ...form, ...patch });

  return (
    <Page>
      <div className="mx-auto max-w-[700px]">
        <PageHeader title="Settings" />
        <div className="space-y-10">
          <Section title="You" description="Your name is recorded on every decision and change in the audit trail.">
            <Card className="k-list">
              <Row label="Name" htmlFor="set-name">
                <Input id="set-name" value={form.userName} onChange={(e) => setForm({ ...form, userName: e.target.value })} placeholder="e.g. Tatsuya Sugiyama" className="w-[280px] max-w-full" />
              </Row>
              <Row label="Company" htmlFor="set-company">
                <Input id="set-company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Printed on review records" className="w-[280px] max-w-full" />
              </Row>
            </Card>
            <div className="mb-2 mt-6 px-1 text-[13px] font-semibold text-fg-2">Bulk licenses held (包括許可)</div>
            <Card className="k-list">
              {BULK.map((b) => {
                const on = form.bulkLicenses.includes(b.id);
                const toggle = () => setForm({ ...form, bulkLicenses: on ? form.bulkLicenses.filter((x) => x !== b.id) : [...form.bulkLicenses, b.id] });
                return (
                  <Row key={b.id} label={b.id} sub={b.en}>
                    <Switch checked={on} onChange={toggle} label={b.id} />
                  </Row>
                );
              })}
            </Card>
            <Footer
              note="EyeWarnYou points out bulk-license options on list-controlled items. Whether a 項 and destination qualify is still yours to confirm."
              dirty={youDirty}
              saving={saving === "you"}
              onRevert={() => revert({ userName: s.userName, company: s.company, bulkLicenses: s.bulkLicenses })}
              onSave={() => save("you", { userName: form.userName, company: form.company, bulkLicenses: form.bulkLicenses })}
            />
          </Section>

          <Section title="Screening">
            <Card className="k-list">
              <Row label="Minimum match score" sub="For screening the parties on a case" htmlFor="set-threshold">
                <Input id="set-threshold" type="number" min={60} max={100} value={form.screeningThreshold} onChange={(e) => setForm({ ...form, screeningThreshold: Number(e.target.value) })} className="w-20 text-right tabular" />
              </Row>
            </Card>
            <Footer
              note="A lower score finds more spelling variants, and more false positives. 85 is a sensible default."
              dirty={screeningDirty}
              saving={saving === "screening"}
              onRevert={() => revert({ screeningThreshold: s.screeningThreshold })}
              onSave={() => save("screening", { screeningThreshold: form.screeningThreshold })}
            />
          </Section>

          <Section title="Currency" description="Used for the LVS value limit and Japan’s small-value exception.">
            <Card className="k-list">
              <Row label="Exchange rates as of" htmlFor="set-fxasof">
                <Input id="set-fxasof" type="date" value={form.fxAsOf} onChange={(e) => setForm({ ...form, fxAsOf: e.target.value })} className="w-44" />
              </Row>
              {Object.entries(form.fxPerUsd)
                .filter(([k]) => k !== "USD")
                .map(([k, v]) => (
                  <Row key={k} label={CURRENCY[k] ?? k} sub={`${k} per 1 US dollar`} htmlFor={`set-fx-${k}`}>
                    <Input
                      id={`set-fx-${k}`}
                      type="number"
                      step="any"
                      value={v}
                      onChange={(e) => setForm({ ...form, fxPerUsd: { ...form.fxPerUsd, [k]: Number(e.target.value) } })}
                      className="w-28 text-right tabular"
                    />
                  </Row>
                ))}
            </Card>
            <Footer dirty={currencyDirty} saving={saving === "currency"} onRevert={() => revert({ fxPerUsd: s.fxPerUsd, fxAsOf: s.fxAsOf })} onSave={() => save("currency", { fxPerUsd: form.fxPerUsd, fxAsOf: form.fxAsOf })} />
          </Section>

          <Section id="ai" title="AI" description="Classification, document intake and questions use Claude with your own Anthropic API key.">
            <Card className="k-list">
              <Row label="Status">
                <span className="inline-flex items-center gap-2 text-[14px] text-fg-2">
                  <span className={cx("size-2 rounded-full", form.aiConfigured ? "bg-green" : "ring-[1.5px] ring-inset ring-fg-3")} />
                  {form.aiConfigured ? (form.aiKeySource === "env" ? "On · key from ANTHROPIC_API_KEY" : "On") : "Off · no key"}
                </span>
              </Row>
              <Row label="Anthropic API key" sub={form.aiKeySource === "env" ? "A key saved here takes precedence." : "Starts with sk-ant-"} htmlFor="set-key">
                <Input id="set-key" type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={form.aiKeySource === "settings" ? "Saved · enter a new key to replace" : "sk-ant-…"} autoComplete="off" className="w-[280px] max-w-full" />
              </Row>
              <Row label="Model" htmlFor="set-model">
                <div className="w-[280px] max-w-full">
                  <Select id="set-model" value={form.aiModel} onChange={(e) => setForm({ ...form, aiModel: e.target.value })}>
                    {MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </Select>
                </div>
              </Row>
              {form.aiKeySource === "settings" && (
                <div className="flex min-h-11 items-center px-4 py-1.5">
                  <button onClick={() => save("ai-remove", { anthropicApiKey: "" })} disabled={!!saving} className="inline-flex items-center gap-2 text-[14px] text-red-text hover:underline disabled:opacity-40">
                    {saving === "ai-remove" && <Loader2 className="size-3.5 animate-spin" />}
                    Remove saved key
                  </button>
                </div>
              )}
            </Card>
            <Footer
              note="The key is stored only in this installation’s local database. Text you send goes only to the Anthropic API."
              dirty={aiDirty}
              saving={saving === "ai"}
              onRevert={() => {
                setKey("");
                revert({ aiModel: s.aiModel });
              }}
              onSave={() => (save("ai", { aiModel: form.aiModel, ...(key ? { anthropicApiKey: key } : {}) }), setKey(""))}
            />
          </Section>

          <DataSection />
        </div>
      </div>
    </Page>
  );
}

// ---------------------------------------------------------------------------

function Row({ label, sub, htmlFor, children }: { label: ReactNode; sub?: ReactNode; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-2">
      <label htmlFor={htmlFor} className="min-w-0">
        <span className="block text-[14px]">{label}</span>
        {sub && <span className="block text-[12.5px] text-fg-2">{sub}</span>}
      </label>
      <div className="flex min-w-0 shrink-0 items-center justify-end">{children}</div>
    </div>
  );
}

/** macOS-style switch. */
function Switch({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={cx("relative inline-flex h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-200", checked ? "bg-accent" : "bg-line-strong")}
    >
      <span className={cx("absolute top-[2px] size-[18px] rounded-full bg-white shadow-thumb transition-transform duration-200", checked ? "translate-x-[18px]" : "translate-x-[2px]")} />
    </button>
  );
}

/** The note under a group, and the save controls once something has changed. */
function Footer({ note, dirty, saving, onSave, onRevert }: { note?: ReactNode; dirty: boolean; saving: boolean; onSave: () => void; onRevert: () => void }) {
  if (!note && !dirty) return null;
  return (
    <div className="mt-2.5 flex min-h-[34px] items-start justify-between gap-4 px-1">
      <p className="pt-0.5 text-[12.5px] leading-snug text-fg-3">{note}</p>
      {dirty && (
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" onClick={onRevert} disabled={saving}>
            Revert
          </Button>
          <Button variant="primary" loading={saving} onClick={onSave}>
            Save
          </Button>
        </div>
      )}
    </div>
  );
}

function DataSection() {
  const meta = useMeta();
  const qc = useQueryClient();
  const [log, setLog] = useState<string[]>([]);
  const [running, setRunning] = useState<string | null>(null);
  const [changes, setChanges] = useState<ChangeEntry[] | null>(null);
  const sync = async (targets: string) => {
    setRunning(targets);
    setLog([]);
    setChanges(null);
    try {
      await streamPost(`/sync?targets=${targets}`, {}, (ev, data) => {
        const d = data as { step?: string; detail?: string; done?: number; total?: number; message?: string; changes?: ChangeEntry[] };
        if (ev === "progress") setLog((l) => [...l, `${d.detail ?? d.step}${d.total ? ` (${(d.done ?? 0) + 1}/${d.total})` : ""}`]);
        if (ev === "done") setChanges(d.changes ?? []);
        if (ev === "error") toast("Update failed", { detail: d.message, tone: "error" });
      });
      await qc.invalidateQueries();
    } finally {
      setRunning(null);
    }
  };
  const m = meta.data;
  const rows = m
    ? [
        { label: "US Export Administration Regulations", sub: "15 CFR Parts 730–774", source: "eCFR", stamp: m.stamps.ccl, target: "ear" },
        { label: "Japan export control law", sub: "輸出令, 貨物等省令, 外為法, おそれ省令", source: "e-Gov", stamp: m.stamps.jp, target: "jp" },
        ...m.stamps.screening.map((s) =>
          /METI/.test(s.source)
            ? { label: "METI End User List", sub: "外国ユーザーリスト", source: "METI", stamp: s, target: "screening" }
            : /MOFCOM/.test(s.source)
              ? { label: "China MOFCOM designations", sub: "管控名单, 关注名单, UEL, 反制", source: "MOFCOM", stamp: s, target: "screening" }
              : { label: "US Consolidated Screening List", sub: "All US restricted-party lists", source: "trade.gov", stamp: s, target: "screening" },
        ),
      ]
    : [];
  const cslMissing = !!m && !m.stamps.screening.some((s) => /Consolidated/.test(s.source));
  return (
    <Section
      id="data"
      title="Data"
      description="EyeWarnYou keeps its own copy of every source, so each assessment can be reproduced. Updating records what changed."
      actions={
        <Button size="sm" loading={running === "ear,jp,screening"} disabled={!!running} onClick={() => sync("ear,jp,screening")}>
          Update all
        </Button>
      }
    >
      <Card className="k-list">
        {rows.map((r) => (
          <div key={r.label} className="flex min-h-11 items-center gap-4 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="text-[14px]">{r.label}</div>
              <div className="text-[12.5px] text-fg-2">
                {r.sub} · as of {fmtDate(r.stamp.asOf)} · downloaded {relTime(r.stamp.fetchedAt)} ·{" "}
                <a href={r.stamp.url} target="_blank" rel="noreferrer" className="text-fg-2 underline decoration-line-strong underline-offset-2 hover:text-fg">
                  {r.source}
                </a>
              </div>
            </div>
            <Button size="sm" variant="ghost" disabled={!!running} loading={running === r.target} onClick={() => sync(r.target)}>
              Update
            </Button>
          </div>
        ))}
        {cslMissing && (
          <div className="flex min-h-11 items-center gap-4 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="text-[14px]">US Consolidated Screening List</div>
              <div className="text-[12.5px] text-fg-2">Not downloaded yet · about 30 MB</div>
            </div>
            <Button size="sm" variant="primary" disabled={!!running} loading={running === "screening"} onClick={() => sync("screening")}>
              Download
            </Button>
          </div>
        )}
      </Card>
      {(log.length > 0 || changes) && (
        <Card className="k-list mt-3" style={{ ["--inset" as string]: "42px" }}>
          {log.map((l, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2 text-[13px]">
              {i === log.length - 1 && running ? <Loader2 className="size-4 shrink-0 animate-spin text-fg-3" /> : <Check className="size-4 shrink-0 text-green" strokeWidth={2.25} />}
              <span className={cx("min-w-0", i === log.length - 1 && running ? "text-fg" : "text-fg-2")}>{l}</span>
            </div>
          ))}
          {changes && (
            <div className="px-4 py-2.5 pl-[42px] text-[13px] font-medium">
              {changes.length === 0 ? (
                "No changes since the previous update."
              ) : (
                <>
                  {changes.length} change{changes.length > 1 ? "s" : ""} detected.{" "}
                  <Link to="/regulations/updates" className="text-accent-text hover:underline">
                    See what changed
                  </Link>
                </>
              )}
            </div>
          )}
        </Card>
      )}
    </Section>
  );
}
