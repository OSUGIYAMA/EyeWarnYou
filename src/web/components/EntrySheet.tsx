// Detail sheet for a restricted-party list entry.
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { api, type ScreeningEntry } from "../lib/api.ts";
import { LIST_NAMES } from "../lib/format.ts";
import { Badge, SectionLabel, Sheet, Skeleton } from "./ui/index.tsx";
import { CountryName } from "./CountryPicker.tsx";

export function EntrySheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const q = useQuery({ queryKey: ["entry", id], queryFn: () => api.get<ScreeningEntry>(`/screen/entry/${encodeURIComponent(id!)}`), enabled: !!id });
  const e = q.data;
  const list = e ? LIST_NAMES[e.list] : undefined;
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()} title={e?.name ?? "List entry"} subtitle={list ? `${list.agency} — ${list.name}` : undefined} width="max-w-xl">
      {!e ? (
        <div className="space-y-2 p-5">{[1, 2, 3].map((i) => <Skeleton key={i} />)}</div>
      ) : (
        <div className="space-y-5 p-5 text-[13px]">
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={list?.tone ?? "gray"}>{list?.name ?? e.list}</Badge>
            {e.type && <Badge tone="gray">{e.type}</Badge>}
            {e.programs.map((p) => (
              <Badge key={p} tone="neutral">
                {p}
              </Badge>
            ))}
          </div>
          {(e.licenseRequirement || e.licensePolicy) && (
            <div className="rounded-lg border border-line bg-panel-2/60 p-3">
              {e.licenseRequirement && (
                <div>
                  <SectionLabel>License requirement</SectionLabel>
                  <div className="mt-1">{e.licenseRequirement}</div>
                </div>
              )}
              {e.licensePolicy && (
                <div className="mt-3">
                  <SectionLabel>License review policy</SectionLabel>
                  <div className="mt-1">{e.licensePolicy}</div>
                </div>
              )}
              {e.frNotice && <div className="mt-3 text-[12px] text-fg-3">Federal Register: {e.frNotice}{e.startDate ? ` · listed ${e.startDate}` : ""}</div>}
            </div>
          )}
          {e.concern && e.concern.length > 0 && (
            <div>
              <SectionLabel>Concern type (懸念区分)</SectionLabel>
              <div className="mt-1 flex gap-1.5">
                {e.concern.map((c) => (
                  <Badge key={c} tone={c === "CW" ? "orange" : "violet"}>
                    {({ B: "Biological", C: "Chemical", M: "Missile", N: "Nuclear", CW: "Conventional weapons" } as Record<string, string>)[c] ?? c}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {e.altNames.length > 0 && (
            <div>
              <SectionLabel>Also known as</SectionLabel>
              <ul className="mt-1 space-y-0.5 text-fg-2">
                {e.altNames.slice(0, 40).map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          )}
          {e.countries.length > 0 && (
            <div>
              <SectionLabel>Countries</SectionLabel>
              <div className="mt-1 flex flex-wrap gap-3">
                {e.countries.map((c) => (
                  <CountryName key={c} iso2={c} />
                ))}
              </div>
            </div>
          )}
          {e.addresses.length > 0 && (
            <div>
              <SectionLabel>Addresses</SectionLabel>
              <ul className="mt-1 space-y-1 text-fg-2">
                {e.addresses.slice(0, 20).map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}
          {e.remarks && (
            <div>
              <SectionLabel>Remarks</SectionLabel>
              <div className="mt-1 whitespace-pre-line text-fg-2">{e.remarks}</div>
            </div>
          )}
          {e.sourceUrl && (
            <a href={e.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12.5px] text-accent-text hover:underline">
              Official source <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      )}
    </Sheet>
  );
}
