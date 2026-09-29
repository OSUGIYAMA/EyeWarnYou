import { ChevronDown, Plus, ScanSearch, ShieldAlert, ShieldCheck, ShieldQuestion, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { Case, Party } from "../../lib/api.ts";
import { cx, LIST_NAMES, relTime } from "../../lib/format.ts";
import { Button, Card, Empty, IconButton, Input, Section, Select } from "../ui/index.tsx";
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
  lead,
  onChange,
  onScreen,
  onDisposition,
  screening,
}: {
  c: Case;
  lead?: ReactNode;
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
    <Section
      id="parties"
      title="Parties"
      lead={lead}
      description="Everyone involved, each screened against US, Japanese and Chinese lists."
      actions={
        <>
          <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={add}>
            Add party
          </Button>
          <Button size="sm" icon={<ScanSearch className="size-3.5" />} onClick={onScreen} loading={screening} disabled={!c.parties.some((p) => p.name.trim())}>
            Screen all
          </Button>
        </>
      }
    >
      <Card className="k-list overflow-hidden">
        {c.parties.length === 0 ? (
          <Empty title="No parties yet" action={<Button variant="primary" icon={<Plus className="size-3.5" />} onClick={add}>Add a party</Button>}>
            Start with the end user, then the purchaser and any consignees.
          </Empty>
        ) : (
          c.parties.map((p, idx) => (
            <PartyRow
              key={p.id}
              c={c}
              party={p}
              onEdit={(fn, imm) => onChange((k) => fn(k.parties[idx]), imm)}
              onRemove={() => onChange((k) => void k.parties.splice(idx, 1), true)}
              onDisposition={onDisposition}
              onOpenEntry={setEntry}
            />
          ))
        )}
      </Card>
      <EntrySheet id={entry} onClose={() => setEntry(null)} />
    </Section>
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
  const pending = scr?.hits.filter((h) => h.disposition === "pending").length ?? 0;
  const confirmed = scr?.hits.filter((h) => h.disposition === "confirmed").length ?? 0;
  const [open, setOpen] = useState(pending > 0);
  return (
    <div className="px-4 py-3.5">
      <div className="grid grid-cols-[168px_1fr_200px_auto] items-center gap-2">
        <Select value={party.role} onChange={(e) => onEdit((p) => void (p.role = e.target.value as Party["role"]), true)}>
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </Select>
        <Input value={party.name} onChange={(e) => onEdit((p) => void (p.name = e.target.value))} placeholder="Legal name, as in the contract" />
        <CountryPicker value={party.country} onChange={(v) => onEdit((p) => void (p.country = v), true)} placeholder="Country" />
        <IconButton label="Remove party" onClick={onRemove}>
          <Trash2 className="size-3.5" />
        </IconButton>
      </div>
      <div className="mt-2 flex items-center gap-2 pl-[176px] text-[13px]">
        {!party.name.trim() ? null : !scr ? (
          <span className="flex items-center gap-1.5 text-fg-3">
            <span className="size-2 rounded-full ring-[1.5px] ring-inset ring-fg-3" /> Not screened yet
          </span>
        ) : scr.hits.length === 0 ? (
          <span className="flex items-center gap-1.5 text-fg-2">
            <ShieldCheck className="size-4 text-green" /> No list matches · screened {relTime(scr.ranAt)}
          </span>
        ) : (
          <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 text-left">
            {confirmed > 0 ? <ShieldAlert className="size-4 text-red" /> : <ShieldQuestion className="size-4 text-orange" />}
            <span className="font-medium">
              {confirmed > 0 ? `On ${confirmed} restricted list${confirmed > 1 ? "s" : ""}` : `${pending} possible match${pending > 1 ? "es" : ""} to review`}
            </span>
            <span className="text-fg-3">
              {confirmed > 0 && pending > 0 ? `· ${pending} more to review ` : ""}· {relTime(scr.ranAt)}
            </span>
            <ChevronDown className={cx("size-3.5 text-fg-3 transition-transform", !open && "-rotate-90")} />
          </button>
        )}
      </div>
      {scr && scr.hits.length > 0 && open && (
        <div className="k-list ml-[176px] mt-2.5 overflow-hidden rounded-xl bg-panel-2" style={{ ["--inset" as string]: "12px" }}>
          {scr.hits.map((h) => {
            const list = LIST_NAMES[h.list];
            return (
              <div key={h.entryId} className={cx("flex items-center gap-3 px-3 py-2.5", h.disposition === "cleared" && "opacity-50")}>
                <ScoreBar score={h.score} />
                <div className="min-w-0 flex-1">
                  <button onClick={() => onOpenEntry(h.entryId)} className="block max-w-full truncate text-left text-[13.5px] font-medium hover:underline">
                    {h.matchedName}
                  </button>
                  <div className="truncate text-[12.5px] text-fg-3">
                    <span className={cx(list?.tone === "red" && "text-red-text")}>
                      {list?.agency ?? ""} {list?.name ?? h.list}
                    </span>
                    {h.countries.length > 0 && ` · ${h.countries.slice(0, 3).join(", ")}`}
                    {h.by && h.disposition !== "pending" && ` · ${h.disposition === "cleared" ? "cleared" : "confirmed"} by ${h.by}`}
                  </div>
                </div>
                {h.disposition === "pending" ? (
                  <div className="flex shrink-0 gap-1.5">
                    <Button size="sm" onClick={() => onDisposition(party.id, h.entryId, "cleared", "Different entity")}>
                      Not a match
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => onDisposition(party.id, h.entryId, "confirmed")}>
                      Same entity
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
  const tone = score >= 95 ? "text-red" : score >= 88 ? "text-orange" : "text-amber";
  const r = 13;
  const len = 2 * Math.PI * r;
  return (
    <div className="relative size-9 shrink-0" title={`Match score ${Math.round(score)} of 100`}>
      <svg viewBox="0 0 32 32" className="size-9 -rotate-90">
        <circle cx="16" cy="16" r={r} fill="none" stroke="var(--fill)" strokeWidth="3" />
        <circle cx="16" cy="16" r={r} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${(score / 100) * len} ${len}`} className={tone} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold tabular">{Math.round(score)}</span>
    </div>
  );
}
