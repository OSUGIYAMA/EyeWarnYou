// Minimal toast store (no dependency).
export interface ToastItem {
  id: number;
  title: string;
  detail?: string;
  tone: "default" | "error" | "success";
}

type Listener = (t: ToastItem[]) => void;
let items: ToastItem[] = [];
const listeners = new Set<Listener>();
let seq = 0;

export function subscribe(l: Listener) {
  listeners.add(l);
  return () => void listeners.delete(l);
}

function emit() {
  for (const l of listeners) l(items);
}

export function create(title: string, opts: { detail?: string; tone?: ToastItem["tone"] } = {}) {
  const t: ToastItem = { id: ++seq, title, detail: opts.detail, tone: opts.tone ?? "default" };
  items = [...items, t].slice(-4);
  emit();
  setTimeout(() => {
    items = items.filter((x) => x.id !== t.id);
    emit();
  }, opts.tone === "error" ? 7000 : 3500);
}
