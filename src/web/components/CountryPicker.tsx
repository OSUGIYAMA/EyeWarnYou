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
  else if (c.jp.groupA) t.push({ label: "Group A", tone: "text-fg-3" });
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
            "@container flex h-[34px] w-full items-center gap-2 rounded-[9px] border border-transparent bg-fill-2 px-3 text-left text-[14px] transition-[background-color,border-color,box-shadow] hover:bg-fill focus:border-accent focus:bg-panel focus:outline-none focus:ring-4 focus:ring-accent/15",
            compact && "h-8 text-[13px]",
          )}
        >
          {current ? (
            <>
              <span className="w-5 shrink-0 text-[12px] font-medium tabular text-fg-3">{current.iso2}</span>
              <span className="min-w-0 truncate">{current.en}</span>
              <span className="ml-auto hidden shrink-0 gap-1.5 whitespace-nowrap text-[11.5px] font-medium @[17rem]:flex">
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
        <Popover.Content align="start" sideOffset={4} className="z-50 w-[var(--radix-popover-trigger-width)] min-w-72 overflow-hidden rounded-xl bg-panel shadow-float animate-in">
          <Command
            filter={(v, search) => {
              // Ignore case, spaces and punctuation so "viet nam", "Viet-Nam" and "vietnam" all match.
              const norm = (x: string) => x.toLowerCase().replace(/[\s.,'’()-]/g, "");
              const hay = norm(v);
              const s = norm(search);
              return hay.includes(s) ? (hay.startsWith(s) ? 1 : 0.6) : 0;
            }}
          >
            <Command.Input autoFocus placeholder="Search country, code or 国名…" className="h-10 w-full border-b border-line bg-transparent px-3.5 text-[14px] outline-none placeholder:text-fg-3" />
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
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13.5px] data-[selected=true]:bg-fill"
                  >
                    <span className="w-6 text-[12px] font-medium tabular text-fg-3">{c.iso2}</span>
                    <span className="truncate">{c.en}</span>
                    <span className="truncate text-[12px] text-fg-3">{c.ja}</span>
                    <span className="ml-auto flex gap-1.5 text-[11.5px] font-medium">
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
      {withCode && <span className="text-[12px] font-medium tabular text-fg-3">{iso2}</span>}
      <span>{c?.en ?? iso2}</span>
    </span>
  );
}
