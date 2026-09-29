import { Check, ChevronDown, Plus, ScanSearch, ShieldCheck, Trash2, X } from "lucide-react";
import { useState } from "react";
import type { Case, Party } from "../../lib/api.ts";
import { cx, LIST_NAMES, relTime } from "../../lib/format.ts";
import { Badge, Button, Card, CardHeader, Empty, IconButton, Input, Select } from "../ui/index.tsx";
import { CountryPicker } from "../CountryPicker.tsx";
import { EntrySheet } from "../EntrySheet.tsx";

const ROLES: { value: Party["role"]; label: string }[] = [
  { value: "end_user", label: "End user" },
  { value: "consignee", label: "Ultimate consignee" },
  { value: "intermediate_consignee", label: "Intermediate consignee" },
  { value: "purchaser", label: "Purchaser" },
  { value: "forwarder", label: "Forwarder" },
  { value: "other", label: "Other" },
];

export function PartiesCard({
  c,
  onChange,
  onScreen,
  onDisposition,
  screening,
}: {
  c: Case;
  onChange: (fn: (c: Case) => void, immediate?: boolean) => void;
  onScreen: () => void;
  onDisposition: (partyId: string, entryId: string, disposition: "confirmed" | "cleared" | "pending", note?: string) => void;
  screening: boolean;
}) {
  const [entry, setEntry] = useState<string | null>(null);
  const add = () =>
    onChange((k) => {
      k.parties.push({ id: Math.random().toString(36).slice(2, 10), role: k.parties.some((p) => p.role === "end_user") ? "consignee" : "end_user", name: "", country: k.destination });
    });
  return (
    <Card>
      <CardHeader
        title="Parties"
        subtitle="Every party is screened against US, Japanese and other restricted-party lists"
        actions={
          <>
            <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={add}>
              Add
            </Button>
            <Button size="sm" icon={<ScanSearch className="size-3.5" />} onClick={onScreen} loading={screening} disabled={!c.parties.some((p) => p.name.trim())}>
              Screen all
            </Button>
          </>
        }
      />
      {c.parties.length === 0 ? (
        <Empty title="No parties yet" action={<Button size="sm" icon={<Plus className="size-3.5" />} onClick={add}>Add a party</Button>}>
          Add the purchaser, consignees and the end user. Screening results and your dispositions are kept on the case record.
        </Empty>
      ) : (
        <div className="divide-y divide-line">
          {c.parties.map((p, idx) => (
            <PartyRow
              key={p.id}
              c={c}
              party={p}
              onEdit={(fn, imm) => onChange((k) => fn(k.parties[idx]), imm)}
              onRemove={() => onChange((k) => void k.parties.splice(idx, 1), true)}
              onDisposition={onDisposition}
              onOpenEntry={setEntry}
            />
          ))}
        </div>
      )}
      <EntrySheet id={entry} onClose={() => setEntry(null)} />
    </Card>
  );
}

function PartyRow({
  c,
  party,
  onEdit,
  onRemove,
  onDisposition,
  onOpenEntry,
}: {
  c: Case;
  party: Party;
  onEdit: (fn: (p: Party) => void, immediate?: boolean) => void;
  onRemove: () => void;
  onDisposition: (partyId: string, entryId: string, d: "confirmed" | "cleared" | "pending", note?: string) => void;
  onOpenEntry: (id: string) => void;
}) {
  const scr = c.screenings[party.id];
  const [open, setOpen] = useState(true);
  const pending = scr?.hits.filter((h) => h.disposition === "pending").length ?? 0;
  const confirmed = scr?.hits.filter((h) => h.disposition === "confirmed").length ?? 0;
  return (
    <div className="px-4 py-3">
      <div className="grid grid-cols-[150px_1fr_190px_auto] items-center gap-2">
        <Select value={party.role} onChange={(e) => onEdit((p) => void (p.role = e.target.value as Party["role"]), true)} className="h-8 text-[12.5px]">
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </Select>
        <Input value={party.name} onChange={(e) => onEdit((p) => void (p.name = e.target.value))} placeholder="Legal name as in the contract" />
        <CountryPicker value={party.country} onChange={(v) => onEdit((p) => void (p.country = v), true)} placeholder="Country" />
        <IconButton label="Remove party" onClick={onRemove}>
          <Trash2 className="size-3.5" />
        </IconButton>
      </div>
      <div className="mt-2 flex items-center gap-2 pl-[158px] text-[12px]">
        {!scr ? (
          <span className="text-fg-3">Not screened</span>
        ) : scr.hits.length === 0 ? (
          <span className="inline-flex items-center gap-1 text-green-text">
            <ShieldCheck className="size-3.5" /> No potential matches ≥ {scr.threshold} · screened {relTime(scr.ranAt)} against lists as of {scr.dataAsOf}
          </span>
        ) : (
          <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1.5 font-medium">
            <ChevronDown className={cx("size-3.5 transition-transform", !open && "-rotate-90")} />
            {confirmed > 0 && <Badge tone="red">{confirmed} confirmed</Badge>}
            {pending > 0 && <Badge tone="amber">{pending} to review</Badge>}
            <span className="font-normal text-fg-3">
              {scr.hits.length} potential match{scr.hits.length > 1 ? "es" : ""} · {relTime(scr.ranAt)}
            </span>
          </button>
        )}
      </div>
      {scr && scr.hits.length > 0 && open && (
        <div className="ml-[158px] mt-2 overflow-hidden rounded-lg border border-line">
          {scr.hits.map((h) => {
            const list = LIST_NAMES[h.list];
            return (
              <div key={h.entryId} className={cx("flex items-center gap-3 border-t border-line px-3 py-2 first:border-0", h.disposition === "cleared" && "opacity-55")}>
                <ScoreBar score={h.score} />
                <div className="min-w-0 flex-1">
                  <button onClick={() => onOpenEntry(h.entryId)} className="block max-w-full truncate text-left text-[13px] font-medium hover:underline">
                    {h.matchedName}
                  </button>
                  <div className="flex items-center gap-1.5 text-[11.5px] text-fg-3">
                    <Badge tone={list?.tone ?? "gray"}>{list?.agency ?? ""} {list?.name ?? h.list}</Badge>
                    {h.countries.slice(0, 3).join(", ")}
                    {h.by && h.disposition !== "pending" && <span>· {h.disposition === "cleared" ? "cleared" : "confirmed"} by {h.by}</span>}
                  </div>
                </div>
                {h.disposition === "pending" ? (
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="ghost" icon={<X className="size-3.5" />} onClick={() => onDisposition(party.id, h.entryId, "cleared", "Different entity")}>
                      Not a match
                    </Button>
                    <Button size="sm" variant="danger" icon={<Check className="size-3.5" />} onClick={() => onDisposition(party.id, h.entryId, "confirmed")}>
                      Confirm
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => onDisposition(party.id, h.entryId, "pending")}>
                    Undo
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ScoreBar({ score }: { score: number }) {
  const tone = score >= 95 ? "bg-red" : score >= 88 ? "bg-orange" : "bg-amber";
  return (
    <div className="w-11 shrink-0">
      <div className="text-right font-mono text-[11.5px] tabular text-fg-2">{Math.round(score)}</div>
      <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-panel-3">
        <div className={cx("h-full rounded-full", tone)} style={{ width: `${Math.max(8, score)}%` }} />
      </div>
    </div>
  );
}
