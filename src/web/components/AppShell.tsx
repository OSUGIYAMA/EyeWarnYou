import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import {
  BookOpen,
  Boxes,
  Factory,
  FileSearch,
  FolderKanban,
  Globe2,
  Grid3x3,
  History,
  Landmark,
  LayoutDashboard,
  ListTree,
  MessageSquareText,
  Moon,
  Plus,
  Radar,
  ScanSearch,
  ScrollText,
  Search,
  Settings2,
  Sparkles,
  Sun,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { api, type CaseSummary, type Meta } from "../lib/api.ts";
import { cx, relTime } from "../lib/format.ts";
import { Kbd } from "./ui/index.tsx";
import { subscribe, type ToastItem } from "./ui/toast.ts";
import { useRegSheet } from "./RegSheet.tsx";
import { useCountries } from "./CountryPicker.tsx";

export function useMeta() {
  return useQuery({ queryKey: ["meta"], queryFn: () => api.get<Meta>("/meta"), staleTime: 60_000 });
}

const NAV: { label?: string; items: { to: string; label: string; icon: ReactNode; end?: boolean }[] }[] = [
  {
    items: [
      { to: "/", label: "Overview", icon: <LayoutDashboard />, end: true },
      { to: "/intelligence", label: "Intelligence", icon: <Radar /> },
      { to: "/ask", label: "Ask the regulations", icon: <MessageSquareText /> },
    ],
  },
  {
    label: "Trade controls",
    items: [
      { to: "/cases", label: "Cases", icon: <FolderKanban /> },
      { to: "/classify", label: "Classify", icon: <FileSearch /> },
    ],
  },
  {
    label: "Parties & supply chain",
    items: [
      { to: "/screening", label: "Screening", icon: <ScanSearch /> },
      { to: "/exposure", label: "Exposure", icon: <Factory /> },
      { to: "/products", label: "Product master", icon: <Boxes /> },
    ],
  },
  {
    label: "Reference",
    items: [
      { to: "/regulations/ccl", label: "Commerce Control List", icon: <ListTree /> },
      { to: "/regulations/chart", label: "Country Chart", icon: <Grid3x3 /> },
      { to: "/regulations/countries", label: "Countries", icon: <Globe2 /> },
      { to: "/regulations/japan", label: "Japan (FEFTA)", icon: <Landmark /> },
      { to: "/regulations/library", label: "Regulation library", icon: <BookOpen /> },
      { to: "/regulations/updates", label: "Detected changes", icon: <History /> },
    ],
  },
  {
    items: [
      { to: "/audit", label: "Audit trail", icon: <ScrollText /> },
      { to: "/settings", label: "Settings", icon: <Settings2 /> },
    ],
  },
];

function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("kanmon.theme", next ? "dark" : "light");
    } catch {
      /* private mode */
    }
    setDark(next);
  };
  return { dark, toggle };
}

export function AppShell() {
  const { dark, toggle } = useTheme();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const meta = useMeta();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const ecfr = meta.data?.stamps.ccl.asOf;
  const csl = meta.data?.stamps.screening.find((s) => /Consolidated/.test(s.source));

  return (
    <div className="flex min-h-screen">
      <aside className="no-print sticky top-0 hidden h-screen w-[244px] shrink-0 flex-col border-r border-line bg-panel lg:flex">
        <div className="flex h-14 items-center gap-2.5 px-4">
          <Logo />
          <div className="leading-tight">
            <div className="text-[14px] font-semibold tracking-tight">Kanmon</div>
            <div className="text-[11px] text-fg-3">Economic security platform</div>
          </div>
        </div>
        <div className="px-3 pb-2">
          <button onClick={() => setPaletteOpen(true)} className="flex h-8 w-full items-center gap-2 rounded-lg border border-line bg-panel-2/60 px-2.5 text-[12.5px] text-fg-3 transition-colors hover:border-line-strong hover:text-fg-2">
            <Search className="size-3.5" />
            Search everything
            <span className="ml-auto flex gap-0.5">
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </span>
          </button>
        </div>
        <nav className="scroll-thin flex-1 overflow-y-auto px-3 py-1">
          {NAV.map((group, gi) => (
            <div key={gi} className={cx(gi > 0 && (group.label ? "mt-5" : "mt-4 border-t border-line pt-4"))}>
              {group.label && <div className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-3">{group.label}</div>}
              {group.items.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.end}
                  className={({ isActive }) =>
                    cx(
                      "group flex h-8 items-center gap-2.5 rounded-lg px-2 text-[13px] transition-colors [&>svg]:size-4 [&>svg]:shrink-0",
                      isActive ? "bg-panel-2 font-medium text-fg ring-1 ring-line [&>svg]:text-fg" : "text-fg-2 hover:bg-panel-2/70 hover:text-fg [&>svg]:text-fg-3",
                    )
                  }
                >
                  {n.icon}
                  {n.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="border-t border-line p-3">
          <NavLink to="/settings#data" className="block rounded-lg px-2 py-1.5 text-[11.5px] leading-relaxed text-fg-3 hover:bg-panel-2">
            <div className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-green" />
              eCFR as of <span className="text-fg-2">{ecfr ?? "…"}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={cx("size-1.5 rounded-full", csl ? "bg-green" : "bg-amber")} />
              Screening lists {csl ? <span className="text-fg-2">{relTime(csl.fetchedAt)}</span> : <span className="text-amber-text">not downloaded</span>}
            </div>
          </NavLink>
          <div className="mt-2 flex items-center justify-between px-2">
            <span className="truncate text-[12px] text-fg-2">{meta.data?.settings.userName || "Set your name in Settings"}</span>
            <button onClick={toggle} className="rounded-md p-1 text-fg-3 hover:bg-panel-2 hover:text-fg" aria-label="Toggle theme">
              {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        <MobileBar onSearch={() => setPaletteOpen(true)} />
        <Outlet />
      </main>
      <Palette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <Toaster />
    </div>
  );
}

function MobileBar({ onSearch }: { onSearch: () => void }) {
  return (
    <div className="no-print flex h-12 items-center gap-2 border-b border-line bg-panel px-4 lg:hidden">
      <Logo />
      <span className="font-semibold">Kanmon</span>
      <button onClick={onSearch} className="ml-auto rounded-md p-1.5 text-fg-2 hover:bg-panel-2">
        <Search className="size-4" />
      </button>
    </div>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cx("size-7 shrink-0", className)} aria-hidden>
      <rect width="32" height="32" rx="8" className="fill-fg" />
      <path d="M9.5 8v16M22.5 8v16M9.5 12.5h13M9.5 19.5h13" className="stroke-bg" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function Page({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return <div className={cx("mx-auto px-4 py-7 sm:px-8", wide ? "max-w-[1480px]" : "max-w-[1180px]")}>{children}</div>;
}

// ---------------------------------------------------------------------------
// Command palette

function Palette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const nav = useNavigate();
  const openReg = useRegSheet();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 140);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    if (!open) setQ("");
  }, [open]);
  const cases = useQuery({ queryKey: ["cases"], queryFn: () => api.get<CaseSummary[]>("/cases"), enabled: open });
  const eccns = useQuery({ queryKey: ["ccl-search", debounced], queryFn: () => api.get<{ results: { id: string; heading: string }[] }>(`/ccl?q=${encodeURIComponent(debounced)}`), enabled: open && debounced.length > 1 });
  const lib = useQuery({ queryKey: ["lib-search", debounced], queryFn: () => api.get<{ results: { id: string; sectionId: string; cite: string; title: string }[] }>(`/library/search?q=${encodeURIComponent(debounced)}`), enabled: open && debounced.length > 2 });
  const countries = useCountries();
  if (!open) return null;
  const go = (to: string) => {
    onOpenChange(false);
    nav(to);
  };
  const lower = debounced.toLowerCase();
  const countryHits = debounced.length > 1 ? (countries.data ?? []).filter((c) => c.en.toLowerCase().includes(lower) || c.iso2.toLowerCase() === lower || c.ja.includes(debounced)).slice(0, 5) : [];
  const caseHits = (cases.data ?? []).filter((c) => !debounced || c.title.toLowerCase().includes(lower) || c.ref.toLowerCase().includes(lower)).slice(0, 5);
  const item = "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] data-[selected=true]:bg-panel-2 [&>svg]:size-4 [&>svg]:text-fg-3";
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 px-4 pt-[14vh] backdrop-blur-[2px] dark:bg-black/60" onClick={() => onOpenChange(false)}>
      <Command shouldFilter={false} className="w-full max-w-[620px] overflow-hidden rounded-2xl border border-line bg-panel shadow-float animate-in" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === "Escape" && onOpenChange(false)}>
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search className="size-4 text-fg-3" />
          <Command.Input autoFocus value={q} onValueChange={setQ} placeholder="Search ECCNs, countries, regulations, cases… or screen a name" className="h-12 flex-1 bg-transparent text-[14px] outline-none placeholder:text-fg-3" />
        </div>
        <Command.List className="scroll-thin max-h-[56vh] overflow-y-auto p-2">
          {!debounced && (
            <Command.Group heading={<GroupHeading>Actions</GroupHeading>}>
              <Command.Item className={item} onSelect={() => go("/cases/new")}>
                <Plus /> New case
              </Command.Item>
              <Command.Item className={item} onSelect={() => go("/screening")}>
                <ScanSearch /> Screen a party
              </Command.Item>
              <Command.Item className={item} onSelect={() => go("/classify")}>
                <Sparkles /> Classify a product
              </Command.Item>
              <Command.Item className={item} onSelect={() => go("/ask")}>
                <MessageSquareText /> Ask the regulations
              </Command.Item>
            </Command.Group>
          )}
          {debounced && (
            <Command.Group heading={<GroupHeading>Screen</GroupHeading>}>
              <Command.Item className={item} value={`screen ${debounced}`} onSelect={() => go(`/screening?q=${encodeURIComponent(debounced)}`)}>
                <ScanSearch /> Screen “{debounced}” against restricted-party lists
              </Command.Item>
            </Command.Group>
          )}
          {(eccns.data?.results.length ?? 0) > 0 && (
            <Command.Group heading={<GroupHeading>Commerce Control List</GroupHeading>}>
              {eccns.data!.results.slice(0, 6).map((e) => (
                <Command.Item key={e.id} value={`eccn ${e.id}`} className={item} onSelect={() => go(`/regulations/ccl/${e.id}`)}>
                  <span className="w-12 font-mono text-[12px] font-medium">{e.id}</span>
                  <span className="truncate text-fg-2">{e.heading}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}
          {countryHits.length > 0 && (
            <Command.Group heading={<GroupHeading>Countries</GroupHeading>}>
              {countryHits.map((c) => (
                <Command.Item key={c.iso2} value={`country ${c.iso2}`} className={item} onSelect={() => go(`/regulations/countries/${c.iso2}`)}>
                  <span className="w-12 font-mono text-[12px] text-fg-3">{c.iso2}</span>
                  {c.en} <span className="text-fg-3">{c.ja}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}
          {(lib.data?.results.length ?? 0) > 0 && (
            <Command.Group heading={<GroupHeading>Regulations</GroupHeading>}>
              {lib.data!.results.slice(0, 6).map((r) => (
                <Command.Item
                  key={r.id}
                  value={`lib ${r.id}`}
                  className={item}
                  onSelect={() => {
                    onOpenChange(false);
                    openReg({ kind: "section", id: r.sectionId, label: r.cite });
                  }}
                >
                  <BookOpen />
                  <span className="shrink-0 font-medium">{r.cite}</span>
                  <span className="truncate text-fg-3">{r.title}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}
          {caseHits.length > 0 && (
            <Command.Group heading={<GroupHeading>Cases</GroupHeading>}>
              {caseHits.map((c) => (
                <Command.Item key={c.id} value={`case ${c.id}`} className={item} onSelect={() => go(`/cases/${c.id}`)}>
                  <FolderKanban />
                  <span className="font-mono text-[12px] text-fg-3">{c.ref}</span>
                  <span className="truncate">{c.title}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}
        </Command.List>
        <div className="flex items-center gap-3 border-t border-line bg-panel-2/50 px-4 py-2 text-[11.5px] text-fg-3">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> navigate
          </span>
          <span className="flex items-center gap-1">
            <Kbd>↵</Kbd> open
          </span>
          <span className="flex items-center gap-1">
            <Kbd>esc</Kbd> close
          </span>
        </div>
      </Command>
    </div>
  );
}

function GroupHeading({ children }: { children: ReactNode }) {
  return <div className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-3">{children}</div>;
}

// ---------------------------------------------------------------------------

function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => subscribe(setItems), []);
  return (
    <div className="no-print pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2">
      {items.map((t) => (
        <div key={t.id} className={cx("pointer-events-auto rounded-xl border bg-panel px-4 py-3 shadow-float animate-in", t.tone === "error" ? "border-red/30" : "border-line")}>
          <div className={cx("text-[13px] font-medium", t.tone === "error" && "text-red-text", t.tone === "success" && "text-green-text")}>{t.title}</div>
          {t.detail && <div className="mt-0.5 text-[12.5px] text-fg-3">{t.detail}</div>}
        </div>
      ))}
    </div>
  );
}
