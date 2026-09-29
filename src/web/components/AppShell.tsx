import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import {
  BookOpen,
  BookText,
  CalendarClock,
  CircleCheck,
  CircleX,
  Factory,
  FolderClosed,
  House,
  MessagesSquare,
  Moon,
  Package,
  Plus,
  ScanSearch,
  ScrollText,
  Search,
  Settings,
  Sun,
  Tag,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api, type CaseSummary, type Meta } from "../lib/api.ts";
import { cx, fmtDate, relTime } from "../lib/format.ts";
import { subscribe, type ToastItem } from "./ui/toast.ts";
import { useRegSheet } from "./RegSheet.tsx";
import { useCountries } from "./CountryPicker.tsx";

export function useMeta() {
  return useQuery({ queryKey: ["meta"], queryFn: () => api.get<Meta>("/meta"), staleTime: 60_000 });
}

type NavItem = { to: string; label: string; icon: ReactNode; end?: boolean; match?: string };
const NAV: { label?: string; items: NavItem[] }[] = [
  {
    items: [
      { to: "/", label: "Home", icon: <House />, end: true },
      { to: "/cases", label: "Cases", icon: <FolderClosed /> },
      { to: "/screening", label: "Screening", icon: <ScanSearch /> },
      { to: "/intelligence", label: "What’s changing", icon: <CalendarClock /> },
    ],
  },
  {
    label: "Tools",
    items: [
      { to: "/classify", label: "Classify a product", icon: <Tag /> },
      { to: "/ask", label: "Ask the regulations", icon: <MessagesSquare /> },
      { to: "/exposure", label: "Supply-chain exposure", icon: <Factory /> },
      { to: "/products", label: "Product master", icon: <Package /> },
    ],
  },
  {
    label: "Reference",
    items: [
      { to: "/regulations/ccl", label: "Regulations", icon: <BookText />, match: "/regulations" },
      { to: "/audit", label: "Audit trail", icon: <ScrollText /> },
    ],
  },
];

/** The reference pages share one sidebar entry and switch with a segmented control. */
const REG_NAV = [
  { to: "/regulations/ccl", label: "Control List" },
  { to: "/regulations/chart", label: "Country Chart" },
  { to: "/regulations/countries", label: "Countries" },
  { to: "/regulations/japan", label: "Japan" },
  { to: "/regulations/library", label: "Library" },
  { to: "/regulations/updates", label: "Changes" },
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
  const { pathname } = useLocation();
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
  const onRegs = pathname.startsWith("/regulations");

  return (
    <div className="flex min-h-screen">
      <aside className="no-print sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-line bg-sidebar lg:flex">
        <Link to="/" className="flex h-[60px] items-center gap-2.5 px-5">
          <Logo />
          <span className="text-[16px] font-semibold tracking-tight">Kanmon</span>
        </Link>
        <div className="px-3 pb-3">
          <button onClick={() => setPaletteOpen(true)} className="flex h-8 w-full items-center gap-2 rounded-[9px] bg-fill-2 px-2.5 text-[13px] text-fg-3 transition-colors hover:bg-fill">
            <Search className="size-3.5" />
            Search
            <span className="ml-auto text-[12px] tracking-wide text-fg-3">⌘K</span>
          </button>
        </div>
        <nav className="scroll-thin flex-1 overflow-y-auto px-3 pb-3">
          {NAV.map((group, gi) => (
            <div key={gi} className={cx(gi > 0 && "mt-5")}>
              {group.label && <div className="mb-1 px-2.5 text-[12px] font-semibold text-fg-3">{group.label}</div>}
              {group.items.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.end}
                  className={({ isActive }) =>
                    cx(
                      "flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[14px] transition-colors [&>svg]:size-[17px] [&>svg]:shrink-0 [&>svg]:text-accent",
                      isActive || (n.match && pathname.startsWith(n.match)) ? "bg-fill font-semibold text-fg" : "text-fg hover:bg-fill-2",
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
        <div className="border-t border-line px-3 py-3">
          <NavLink
            to="/settings"
            className={({ isActive }) => cx("flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[14px] transition-colors [&>svg]:size-[17px] [&>svg]:text-accent", isActive ? "bg-fill font-semibold" : "hover:bg-fill-2")}
          >
            <Settings />
            Settings
          </NavLink>
          <div className="mt-2 flex items-center gap-2 px-2.5">
            <NavLink to="/settings#data" className="min-w-0 flex-1 text-[12px] leading-snug text-fg-3 hover:text-fg-2">
              <span className="flex items-center gap-1.5">
                <span className={cx("size-1.5 shrink-0 rounded-full", csl ? "bg-green" : "bg-amber")} />
                <span className="truncate">{csl ? `Lists updated ${relTime(csl.fetchedAt)}` : "Lists not downloaded"}</span>
              </span>
              <span className="block truncate pl-3">EAR as of {ecfr ? fmtDate(ecfr) : "…"}</span>
            </NavLink>
            <button onClick={toggle} className="rounded-full p-1.5 text-fg-3 hover:bg-fill hover:text-fg" aria-label={dark ? "Light appearance" : "Dark appearance"}>
              {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        <MobileBar onSearch={() => setPaletteOpen(true)} />
        {onRegs && <RegToolbar />}
        <Outlet />
      </main>
      <Palette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <Toaster />
    </div>
  );
}

function RegToolbar() {
  return (
    <div className="no-print material sticky top-0 z-20 flex h-[52px] items-center justify-center border-b border-line px-4">
      <nav className="inline-flex h-8 rounded-[9px] bg-fill p-[2px]" aria-label="Regulations">
        {REG_NAV.map((r) => (
          <NavLink
            key={r.to}
            to={r.to}
            className={({ isActive }) => cx("flex items-center whitespace-nowrap rounded-[7px] px-3 text-[13px] font-medium transition-all", isActive ? "bg-thumb text-fg shadow-thumb" : "text-fg-2 hover:text-fg")}
          >
            {r.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function MobileBar({ onSearch }: { onSearch: () => void }) {
  return (
    <div className="no-print material sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-line px-4 lg:hidden">
      <Link to="/" className="flex items-center gap-2">
        <Logo />
        <span className="font-semibold">Kanmon</span>
      </Link>
      <button onClick={onSearch} className="ml-auto rounded-full p-1.5 text-fg-2 hover:bg-fill" aria-label="Search">
        <Search className="size-4" />
      </button>
    </div>
  );
}

/** A gate (関門): two posts and a lintel, with the goods passing through. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cx("size-7 shrink-0", className)} aria-hidden>
      <rect width="32" height="32" rx="7.5" className="fill-fg" />
      <path d="M9.5 24V10.5h13V24" fill="none" className="stroke-bg" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.5 18.5h5" fill="none" className="stroke-bg" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

export function Page({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return <div className={cx("mx-auto px-5 pb-16 pt-10 sm:px-10", wide ? "max-w-[1400px]" : "max-w-[1080px]")}>{children}</div>;
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
  const item = "flex cursor-pointer items-center gap-3 rounded-[10px] px-3 py-2 text-[14px] aria-selected:bg-accent aria-selected:text-white [&[aria-selected=true]_*]:!text-white [&>svg]:size-4 [&>svg]:text-accent";
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 px-4 pt-[16vh] dark:bg-black/50" onClick={() => onOpenChange(false)}>
      <Command shouldFilter={false} className="w-full max-w-[680px] overflow-hidden rounded-[18px] bg-panel/[0.97] shadow-float backdrop-blur-2xl animate-in" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === "Escape" && onOpenChange(false)}>
        <div className="flex items-center gap-3 px-5">
          <Search className="size-5 text-fg-3" />
          <Command.Input autoFocus value={q} onValueChange={setQ} placeholder="Search cases, ECCNs, countries, regulations — or type a company name" className="h-14 flex-1 bg-transparent text-[19px] tracking-tight outline-none placeholder:text-fg-3" />
        </div>
        <Command.List className="scroll-thin max-h-[56vh] overflow-y-auto border-t border-line p-2 empty:hidden">
          {!debounced && (
            <Command.Group heading={<GroupHeading>Actions</GroupHeading>}>
              <Command.Item className={item} onSelect={() => go("/cases/new")}>
                <Plus /> New case
              </Command.Item>
              <Command.Item className={item} onSelect={() => go("/screening")}>
                <ScanSearch /> Screen a party
              </Command.Item>
              <Command.Item className={item} onSelect={() => go("/classify")}>
                <Tag /> Classify a product
              </Command.Item>
              <Command.Item className={item} onSelect={() => go("/ask")}>
                <MessagesSquare /> Ask the regulations
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
                  <span className="w-14 shrink-0 font-mono text-[12.5px] font-medium">{e.id}</span>
                  <span className="truncate text-fg-2">{e.heading}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}
          {countryHits.length > 0 && (
            <Command.Group heading={<GroupHeading>Countries</GroupHeading>}>
              {countryHits.map((c) => (
                <Command.Item key={c.iso2} value={`country ${c.iso2}`} className={item} onSelect={() => go(`/regulations/countries/${c.iso2}`)}>
                  <span className="w-14 shrink-0 text-[12.5px] font-medium text-fg-3">{c.iso2}</span>
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
                  <FolderClosed />
                  <span className="font-mono text-[12px] text-fg-3">{c.ref}</span>
                  <span className="truncate">{c.title}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}
        </Command.List>
      </Command>
    </div>
  );
}

function GroupHeading({ children }: { children: ReactNode }) {
  return <div className="px-3 pb-1 pt-2 text-[12px] font-semibold text-fg-3">{children}</div>;
}

// ---------------------------------------------------------------------------

function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => subscribe(setItems), []);
  return (
    <div className="no-print pointer-events-none fixed right-4 top-4 z-[60] flex w-[340px] flex-col gap-2">
      {items.map((t) => (
        <div key={t.id} className="material pointer-events-auto flex gap-3 rounded-2xl px-4 py-3 shadow-float animate-in">
          {t.tone === "error" ? <CircleX className="mt-0.5 size-4 shrink-0 text-red" /> : t.tone === "success" ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-green" /> : null}
          <div className="min-w-0">
            <div className="text-[13.5px] font-semibold">{t.title}</div>
            {t.detail && <div className="mt-0.5 text-[13px] text-fg-2">{t.detail}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
