import { useQueryClient } from "@tanstack/react-query";
import { Check, Database, KeyRound, Loader2, RefreshCw, User } from "lucide-react";
import { useEffect, useState } from "react";
import { Page, useMeta } from "../components/AppShell.tsx";
import { Badge, Button, Card, CardHeader, Field, Input, Select, toast } from "../components/ui/index.tsx";
import { api, streamPost, type ChangeEntry, type Settings } from "../lib/api.ts";
import { cx, fmtDate, relTime } from "../lib/format.ts";

const BULK = ["一般包括許可", "特別一般包括許可", "特定包括許可", "特定子会社包括許可", "特別返品等包括許可"];
const MODELS = [
  { id: "claude-opus-5", label: "Claude Opus 5 (recommended)" },
  { id: "claude-opus-5-5", label: "Claude Opus 5.5" },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5 (faster, lower cost)" },
  { id: "claude-fable-5-1", label: "Claude Fable 5.1 (most capable)" },
];

export function SettingsPage() {
  const meta = useMeta();
  const qc = useQueryClient();
  const s = meta.data?.settings;
  const [form, setForm] = useState<Settings | null>(null);
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (s && !form) setForm(s);
  }, [s, form]);
  useEffect(() => {
    if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
  }, [form]);

  const save = async (patch: Partial<Settings> & { anthropicApiKey?: string }) => {
    setSaving(true);
    try {
      const next = await api.put<Settings>("/settings", patch);
      setForm(next);
      await qc.invalidateQueries({ queryKey: ["meta"] });
      toast("Settings saved", { tone: "success" });
    } catch (e) {
      toast("Could not save", { detail: (e as Error).message, tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  if (!form) return <Page><div /></Page>;
  return (
    <Page>
      <h1 className="mb-6 text-[22px] font-semibold tracking-tight">Settings</h1>
      <div className="space-y-6">
        <Card>
          <CardHeader title="Profile" subtitle="Your name is recorded on every decision, disposition and change in the audit trail." icon={<User className="size-4" />} />
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <Field label="Your name">
              <Input value={form.userName} onChange={(e) => setForm({ ...form, userName: e.target.value })} placeholder="e.g. Tatsuya Sugiyama" />
            </Field>
            <Field label="Company">
              <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
            </Field>
            <Field label="Bulk licenses held (包括許可)" className="sm:col-span-2" hint="Used to surface bulk-license options on list-controlled items. Eligibility by 項 and destination is still for you to confirm.">
              <div className="flex flex-wrap gap-2">
                {BULK.map((b) => {
                  const on = form.bulkLicenses.includes(b);
                  return (
                    <button key={b} onClick={() => setForm({ ...form, bulkLicenses: on ? form.bulkLicenses.filter((x) => x !== b) : [...form.bulkLicenses, b] })} className={cx("inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] ring-1 ring-inset", on ? "bg-accent-soft text-accent-text ring-accent/30" : "text-fg-2 ring-line-strong hover:bg-panel-2")}>
                      {on && <Check className="size-3" />}
                      {b}
                    </button>
                  );
                })}
              </div>
            </Field>
          </div>
          <div className="flex justify-end border-t border-line px-4 py-3">
            <Button variant="primary" loading={saving} onClick={() => save({ userName: form.userName, company: form.company, bulkLicenses: form.bulkLicenses })}>
              Save profile
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="AI assistance"
            subtitle="Classification, document intake and Q&A use Claude through your own Anthropic API key. The key is stored only in this installation's local database."
            icon={<KeyRound className="size-4" />}
            actions={form.aiConfigured ? <Badge tone="green" dot>Configured{form.aiKeySource === "env" ? " (environment)" : ""}</Badge> : <Badge tone="gray">Not configured</Badge>}
          />
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <Field label="Anthropic API key" hint={form.aiKeySource === "env" ? "Currently read from ANTHROPIC_API_KEY. A key saved here takes precedence." : "Starts with sk-ant-"}>
              <Input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={form.aiConfigured ? "•••••••••••••••• (saved)" : "sk-ant-…"} autoComplete="off" />
            </Field>
            <Field label="Model">
              <Select value={form.aiModel} onChange={(e) => setForm({ ...form, aiModel: e.target.value })}>
                {MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="flex justify-between border-t border-line px-4 py-3">
            {form.aiKeySource === "settings" ? (
              <Button variant="danger" onClick={() => save({ anthropicApiKey: "" })}>
                Remove saved key
              </Button>
            ) : (
              <span />
            )}
            <Button variant="primary" loading={saving} onClick={() => (save({ aiModel: form.aiModel, ...(key ? { anthropicApiKey: key } : {}) }), setKey(""))}>
              Save
            </Button>
          </div>
        </Card>

        <DataCard />

        <Card>
          <CardHeader title="Screening & conversions" />
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <Field label="Minimum match score for case screening" hint="Lower finds more variants and more false positives. 85 is a sensible default.">
              <Input type="number" min={60} max={100} value={form.screeningThreshold} onChange={(e) => setForm({ ...form, screeningThreshold: Number(e.target.value) })} className="w-28 tabular" />
            </Field>
            <Field label="Exchange rates as of" hint="Used for the LVS value limit and the Japanese small-value exception.">
              <Input type="date" value={form.fxAsOf} onChange={(e) => setForm({ ...form, fxAsOf: e.target.value })} className="w-44" />
            </Field>
            <div className="sm:col-span-2">
              <div className="mb-1 text-[12px] font-medium text-fg-2">Units per 1 USD</div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {Object.entries(form.fxPerUsd)
                  .filter(([k]) => k !== "USD")
                  .map(([k, v]) => (
                    <label key={k} className="flex items-center gap-2 rounded-lg bg-panel-2/60 px-2 py-1 ring-1 ring-line">
                      <span className="w-9 font-mono text-[12px] text-fg-3">{k}</span>
                      <input type="number" step="any" value={v} onChange={(e) => setForm({ ...form, fxPerUsd: { ...form.fxPerUsd, [k]: Number(e.target.value) } })} className="w-full bg-transparent text-right text-[13px] tabular outline-none" />
                    </label>
                  ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end border-t border-line px-4 py-3">
            <Button variant="primary" loading={saving} onClick={() => save({ screeningThreshold: form.screeningThreshold, fxPerUsd: form.fxPerUsd, fxAsOf: form.fxAsOf })}>
              Save
            </Button>
          </div>
        </Card>
      </div>
    </Page>
  );
}

function DataCard() {
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
        { label: "US EAR — 15 CFR Parts 730–774 (eCFR)", stamp: m.stamps.ccl, target: "ear" },
        { label: "Japan — 輸出令, 貨物等省令, 外為法, おそれ省令 (e-Gov)", stamp: m.stamps.jp, target: "jp" },
        ...m.stamps.screening.map((s) => ({ label: /METI/.test(s.source) ? "METI End User List (外国ユーザーリスト)" : /MOFCOM/.test(s.source) ? "China — MOFCOM designations (管控名单 / 关注名单 / UEL / 反制)" : "US Consolidated Screening List (trade.gov)", stamp: s, target: "screening" })),
      ]
    : [];
  return (
    <Card id="data">
      <CardHeader
        title="Regulatory data"
        subtitle="Kanmon keeps its own copy of every source so assessments are reproducible. Updating compares the new data with the previous copy and records what changed."
        icon={<Database className="size-4" />}
        actions={
          <Button variant="primary" size="sm" icon={<RefreshCw className="size-3.5" />} loading={running === "ear,jp,screening"} disabled={!!running} onClick={() => sync("ear,jp,screening")}>
            Update all
          </Button>
        }
      />
      <div className="divide-y divide-line">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-4 px-4 py-2.5 text-[13px]">
            <div className="min-w-0 flex-1">
              <div className="font-medium">{r.label}</div>
              <div className="text-[12px] text-fg-3">
                Reflects {fmtDate(r.stamp.asOf)} · downloaded {relTime(r.stamp.fetchedAt)} ·{" "}
                <a href={r.stamp.url} target="_blank" rel="noreferrer" className="hover:underline">
                  source
                </a>
              </div>
            </div>
            <Button size="sm" variant="ghost" disabled={!!running} loading={running === r.target} onClick={() => sync(r.target)}>
              Update
            </Button>
          </div>
        ))}
        {m && !m.stamps.screening.some((s) => /Consolidated/.test(s.source)) && (
          <div className="flex items-center gap-4 px-4 py-2.5 text-[13px]">
            <div className="flex-1">
              <div className="font-medium">US Consolidated Screening List</div>
              <div className="text-[12px] text-amber-text">Not downloaded yet (about 30 MB)</div>
            </div>
            <Button size="sm" variant="primary" disabled={!!running} loading={running === "screening"} onClick={() => sync("screening")}>
              Download
            </Button>
          </div>
        )}
      </div>
      {(log.length > 0 || changes) && (
        <div className="border-t border-line bg-panel-2/50 px-4 py-3 font-mono text-[11.5px] leading-relaxed text-fg-2">
          {log.map((l, i) => (
            <div key={i} className="flex items-center gap-2">
              {i === log.length - 1 && running ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3 text-green" />}
              {l}
            </div>
          ))}
          {changes && (
            <div className="mt-2 font-sans text-[12.5px]">
              {changes.length === 0 ? "No changes since the previous update." : `${changes.length} change${changes.length > 1 ? "s" : ""} detected — see Regulatory updates.`}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
