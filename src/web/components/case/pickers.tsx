import * as Popover from "@radix-ui/react-popover";
import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import { ChevronsUpDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, type JpAppendix1Row } from "../../lib/api.ts";
import { cx } from "../../lib/format.ts";

const trigger =
  "flex h-[34px] w-full items-center gap-2 rounded-[9px] border border-transparent bg-fill-2 px-3 text-left text-[14px] transition-[background-color,border-color,box-shadow] hover:bg-fill focus:border-accent focus:bg-panel focus:outline-none focus:ring-4 focus:ring-accent/15";

/** ECCN autocomplete backed by the CCL full-text index. Accepts "EAR99". */
export function EccnInput({ value, onChange }: { value: string; onChange: (eccn: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDq(q.trim()), 150);
    return () => clearTimeout(t);
  }, [q]);
  const res = useQuery({ queryKey: ["ccl-search", dq], queryFn: () => api.get<{ results: { id: string; heading: string }[] }>(`/ccl?q=${encodeURIComponent(dq)}`), enabled: open && dq.length > 1 });
  const current = useQuery({ queryKey: ["eccn", value], queryFn: () => api.get<{ heading: string }>(`/ccl/${value}`), enabled: /^\d[A-E]\d{3}$/.test(value) });
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button type="button" className={trigger}>
          {value ? (
            <>
              <span className="font-mono text-[12.5px] font-medium">{value}</span>
              <span className="truncate text-[12.5px] text-fg-3">{value === "EAR99" ? "Subject to the EAR, not on the CCL" : current.data?.heading}</span>
            </>
          ) : (
            <span className="text-fg-3">ECCN or EAR99</span>
          )}
          <ChevronsUpDown className="ml-auto size-3.5 shrink-0 text-fg-3" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={4} className="z-50 w-[480px] overflow-hidden rounded-xl bg-panel shadow-float animate-in">
          <Command shouldFilter={false}>
            <Command.Input autoFocus value={q} onValueChange={setQ} placeholder="Type an ECCN (3A001) or describe the item…" className="h-10 w-full border-b border-line bg-transparent px-3.5 text-[14px] outline-none placeholder:text-fg-3" />
            <Command.List className="scroll-thin max-h-72 overflow-y-auto p-1">
              <Command.Item value="EAR99" onSelect={() => (onChange("EAR99"), setOpen(false))} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] data-[selected=true]:bg-fill">
                <span className="w-14 font-mono text-[12px] font-medium">EAR99</span>
                <span className="text-fg-3">Subject to the EAR but not listed on the CCL</span>
              </Command.Item>
              {value && (
                <Command.Item value="__clear" onSelect={() => (onChange(""), setOpen(false))} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-fg-3 data-[selected=true]:bg-fill">
                  Clear classification
                </Command.Item>
              )}
              {(res.data?.results ?? []).map((r) => (
                <Command.Item key={r.id} value={r.id} onSelect={() => (onChange(r.id), setOpen(false))} className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-[13px] data-[selected=true]:bg-fill">
                  <span className="w-14 shrink-0 font-mono text-[12px] font-medium">{r.id}</span>
                  <span className="line-clamp-2 text-fg-2">{r.heading}</span>
                </Command.Item>
              ))}
            </Command.List>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function useJpList() {
  return useQuery({ queryKey: ["jp-list"], queryFn: () => api.get<{ appendix1: JpAppendix1Row[] }>("/jp/list"), staleTime: Infinity });
}

/** 項番 picker for 輸出令別表第一 (e.g. "7の項（1）"). */
export function KouPicker({ value, onChange }: { value: string; onChange: (kou: string) => void }) {
  const { data } = useJpList();
  const [open, setOpen] = useState(false);
  const rows = useMemo(() => (data?.appendix1 ?? []).filter((r) => r.kou !== "16" && r.sub && !r.sub.includes("-")), [data]);
  const current = rows.find((r) => r.label === value);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button type="button" className={trigger}>
          {value ? (
            <>
              <span className="shrink-0 text-[13px] font-medium">{value}</span>
              <span className="truncate text-[12.5px] text-fg-3">{current?.text}</span>
            </>
          ) : (
            <span className="text-fg-3">項番 (e.g. 7の項（1）)</span>
          )}
          <ChevronsUpDown className="ml-auto size-3.5 shrink-0 text-fg-3" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={4} className="z-50 w-[520px] overflow-hidden rounded-xl bg-panel shadow-float animate-in">
          <Command>
            <Command.Input autoFocus placeholder="Search 項番 or description (集積回路, 工作機械 …)" className="h-10 w-full border-b border-line bg-transparent px-3.5 text-[14px] outline-none placeholder:text-fg-3" />
            <Command.List className="scroll-thin max-h-80 overflow-y-auto p-1">
              <Command.Empty className="px-3 py-6 text-center text-[12.5px] text-fg-3">No match</Command.Empty>
              {rows.map((r) => (
                <Command.Item key={r.label} value={`${r.label} ${r.text}`} onSelect={() => (onChange(r.label), setOpen(false))} className={cx("flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-[13px] data-[selected=true]:bg-fill")}>
                  <span className="w-24 shrink-0 font-medium">{r.label}</span>
                  <span className="line-clamp-2 text-[12.5px] text-fg-2">{r.text}</span>
                </Command.Item>
              ))}
            </Command.List>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
