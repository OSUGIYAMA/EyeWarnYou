// Searchable country combobox with regulatory context (Country Groups, Japan tiers).
import * as Popover from "@radix-ui/react-popover";
import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import { Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import { api, type CountryInfo } from "../lib/api.ts";
import { cx } from "../lib/format.ts";

export function useCountries() {
  return useQuery({ queryKey: ["countries"], queryFn: () => api.get<CountryInfo[]>("/countries"), staleTime: Infinity });
}

export function countryTags(c: CountryInfo): { label: string; tone: string }[] {
  const t: { label: string; tone: string }[] = [];
  if (c.groups.includes("E:1") || c.groups.includes("E:2")) t.push({ label: c.groups.includes("E:1") ? "E:1" : "E:2", tone: "text-red-text" });
  else if (c.groups.includes("D:5")) t.push({ label: "D:5", tone: "text-orange-text" });
  if (c.jp.concern) t.push({ label: "懸念国", tone: "text-red-text" });
  else if (c.jp.unArmsEmbargo) t.push({ label: "武器禁輸", tone: "text-orange-text" });
  else if (c.jp.groupA) t.push({ label: "Group A", tone: "text-green-text" });
  return t;
}

export function CountryPicker({ value, onChange, placeholder = "Select country", compact, exclude }: { value: string; onChange: (iso2: string) => void; placeholder?: string; compact?: boolean; exclude?: string[] }) {
  const { data = [] } = useCountries();
  const [open, setOpen] = useState(false);
  const current = data.find((c) => c.iso2 === value);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cx(
            "flex h-8 w-full items-center gap-2 rounded-lg border border-line-strong bg-panel px-2.5 text-left text-[13.5px] shadow-sm transition-colors hover:border-fg-3/50 focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/15",
            compact && "h-7 text-[12.5px]",
          )}
        >
          {current ? (
            <>
              <span className="rounded bg-panel-2 px-1 font-mono text-[11px] text-fg-2 ring-1 ring-line">{current.iso2}</span>
              <span className="truncate">{current.en}</span>
              <span className="ml-auto flex gap-1.5 text-[10.5px] font-medium">
                {!compact && countryTags(current).map((t) => <span key={t.label} className={t.tone}>{t.label}</span>)}
              </span>
            </>
          ) : (
            <span className="text-fg-3">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-auto size-3.5 shrink-0 text-fg-3" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={4} className="z-50 w-[var(--radix-popover-trigger-width)] min-w-72 overflow-hidden rounded-xl border border-line bg-panel shadow-float animate-in">
          <Command
            filter={(v, search) => {
              const s = search.toLowerCase();
              return v.toLowerCase().includes(s) ? (v.toLowerCase().startsWith(s) ? 1 : 0.6) : 0;
            }}
          >
            <Command.Input autoFocus placeholder="Search country, code or 国名…" className="h-9 w-full border-b border-line bg-transparent px-3 text-[13px] outline-none placeholder:text-fg-3" />
            <Command.List className="scroll-thin max-h-72 overflow-y-auto p-1">
              <Command.Empty className="px-3 py-6 text-center text-[12.5px] text-fg-3">No country found</Command.Empty>
              {data
                .filter((c) => !exclude?.includes(c.iso2))
                .map((c) => (
                  <Command.Item
                    key={c.iso2}
                    value={`${c.en} ${c.iso2} ${c.ja} ${c.earName ?? ""}`}
                    onSelect={() => {
                      onChange(c.iso2);
                      setOpen(false);
                    }}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] data-[selected=true]:bg-panel-2"
                  >
                    <span className="w-6 font-mono text-[11px] text-fg-3">{c.iso2}</span>
                    <span className="truncate">{c.en}</span>
                    <span className="truncate text-[12px] text-fg-3">{c.ja}</span>
                    <span className="ml-auto flex gap-1.5 text-[10.5px] font-medium">
                      {countryTags(c).map((t) => (
                        <span key={t.label} className={t.tone}>
                          {t.label}
                        </span>
                      ))}
                    </span>
                    {c.iso2 === value && <Check className="size-3.5 text-accent" />}
                  </Command.Item>
                ))}
            </Command.List>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function CountryName({ iso2, withCode = true }: { iso2: string; withCode?: boolean }) {
  const { data = [] } = useCountries();
  const c = data.find((x) => x.iso2 === iso2);
  if (!iso2) return <span className="text-fg-3">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      {withCode && <span className="rounded bg-panel-2 px-1 font-mono text-[10.5px] text-fg-2 ring-1 ring-line">{iso2}</span>}
      <span>{c?.en ?? iso2}</span>
    </span>
  );
}
