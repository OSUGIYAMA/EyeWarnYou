// Detail sheet for a restricted-party list entry, laid out as a plain record: who, which list, where, what it means.
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { api, type ScreeningEntry } from "../lib/api.ts";
import { fmtDate, LIST_NAMES } from "../lib/format.ts";
import { Sheet, Skeleton } from "./ui/index.tsx";
import { CountryName } from "./CountryPicker.tsx";

const CONCERN: Record<string, string> = { B: "Biological", C: "Chemical", M: "Missile", N: "Nuclear", CW: "Conventional weapons" };
const CN_STATUS: Record<string, string> = { active: "In force", suspended: "Measures suspended", stopped: "Measures stopped", removed: "Removed from the list" };

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:gap-4">
      <div className="w-36 shrink-0 pt-px text-[13px] text-fg-2">{label}</div>
      <div className="min-w-0 flex-1 text-[14px] leading-relaxed">{children}</div>
    </div>
  );
}

function Lines({ items, max }: { items: string[]; max: number }) {
  return (
    <>
      <ul className="space-y-1">
        {items.slice(0, max).map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ul>
      {items.length > max && <div className="mt-1 text-[13px] text-fg-3">and {items.length - max} more</div>}
    </>
  );
}

export function EntrySheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const q = useQuery({ queryKey: ["entry", id], queryFn: () => api.get<ScreeningEntry>(`/screen/entry/${encodeURIComponent(id!)}`), enabled: !!id });
  const e = q.data;
  const list = e ? LIST_NAMES[e.list] : undefined;
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()} title={e?.name ?? "List entry"} subtitle={e ? (list ? `${list.agency} ${list.name}` : e.list) : undefined} width="max-w-xl">
      {q.isError ? (
        <div className="px-6 py-6 text-[14px] text-fg-2">This entry could not be loaded.</div>
      ) : !e ? (
        <div className="space-y-3 px-6 py-6">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} />
          ))}
        </div>
      ) : (
        <div className="px-6 pb-8 pt-2">
          <div className="k-list [--inset:0px]">
            <Row label="List">
              {list?.name ?? e.list}
              {list && <span className="text-fg-3"> · {list.agency}</span>}
            </Row>
            {e.type && <Row label="Type">{e.type}</Row>}
            {e.countries.length > 0 && (
              <Row label={e.countries.length === 1 ? "Country" : "Countries"}>
                {e.countries.map((c, i) => (
                  <span key={c}>
                    {i > 0 && ", "}
                    <CountryName iso2={c} withCode={false} />
                  </span>
                ))}
              </Row>
            )}
            {e.licenseRequirement && <Row label="License requirement">{e.licenseRequirement}</Row>}
            {e.licensePolicy && <Row label="Review policy">{e.licensePolicy}</Row>}
            {e.cnStatus && (
              <Row label="Status">
                {CN_STATUS[e.cnStatus] ?? e.cnStatus}
                {e.cnStatusUntil && <span className="text-fg-3"> until {fmtDate(e.cnStatusUntil)}</span>}
              </Row>
            )}
            {e.concern && e.concern.length > 0 && <Row label="Concern type">{e.concern.map((c) => CONCERN[c] ?? c).join(", ")}</Row>}
            {e.programs.length > 0 && <Row label={e.programs.length === 1 ? "Program" : "Programs"}>{e.programs.join(", ")}</Row>}
            {(e.frNotice || e.startDate) && (
              <Row label="Listed">
                {e.startDate && fmtDate(e.startDate)}
                {e.frNotice && (
                  <span className={e.startDate ? "text-fg-3" : undefined}>
                    {e.startDate ? " · " : ""}
                    {e.frNotice}
                  </span>
                )}
              </Row>
            )}
            {e.altNames.length > 0 && (
              <Row label="Also known as">
                <Lines items={e.altNames} max={40} />
              </Row>
            )}
            {e.addresses.length > 0 && (
              <Row label={e.addresses.length === 1 ? "Address" : "Addresses"}>
                <Lines items={e.addresses} max={20} />
              </Row>
            )}
            {e.remarks && (
              <Row label="Remarks">
                <div className="whitespace-pre-line text-fg-2">{e.remarks}</div>
              </Row>
            )}
            <Row label="Record">
              <span className="font-mono text-[12.5px] text-fg-3">{e.id}</span>
            </Row>
          </div>
          {e.sourceUrl && (
            <a href={e.sourceUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1 text-[14px] text-accent-text hover:underline">
              Official source <ExternalLink className="size-3.5" />
            </a>
          )}
        </div>
      )}
    </Sheet>
  );
}
