// Design-system primitives. Quiet, dense and legible — built for people who read regulations all day.
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Loader2, X } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import type { Outcome, Status } from "@/shared/assessment.ts";
import { cx, OUTCOME, STATUS_TONE, TONE_CLASSES, TONE_DOT, type Tone } from "../../lib/format.ts";

// ---------------------------------------------------------------------------
// Button

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
const BUTTON: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-fg hover:bg-accent-hover shadow-sm",
  secondary: "bg-panel text-fg ring-1 ring-inset ring-line-strong hover:bg-panel-2 shadow-sm",
  subtle: "bg-panel-2 text-fg hover:bg-panel-3",
  ghost: "text-fg-2 hover:text-fg hover:bg-panel-2",
  danger: "bg-panel text-red-text ring-1 ring-inset ring-line-strong hover:bg-red-soft",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "sm" | "md" | "lg"; loading?: boolean; icon?: ReactNode }
>(function Button({ variant = "secondary", size = "md", loading, icon, className, children, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-7 px-2.5 text-[12.5px]" : size === "lg" ? "h-10 px-4 text-[14px]" : "h-8 px-3 text-[13px]",
        BUTTON[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-3.5 animate-spin" /> : icon}
      {children}
    </button>
  );
});

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <Tooltip content={label}>
      <button aria-label={label} className={cx("inline-flex size-7 items-center justify-center rounded-md text-fg-3 transition-colors hover:bg-panel-2 hover:text-fg", className)} {...rest}>
        {children}
      </button>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// Badges & pills

export function Badge({ tone = "gray", children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cx("inline-flex h-5 items-center gap-1 rounded-md px-1.5 text-[11.5px] font-medium ring-1 ring-inset", TONE_CLASSES[tone], className)}>
      {dot && <span className={cx("size-1.5 rounded-full", TONE_DOT[tone])} />}
      {children}
    </span>
  );
}

export function OutcomePill({ outcome, size = "md", label }: { outcome: Outcome; size?: "sm" | "md" | "lg"; label?: string }) {
  const o = OUTCOME[outcome];
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full font-medium ring-1 ring-inset",
        TONE_CLASSES[o.tone],
        outcome === "incomplete" && "ring-dashed",
        size === "sm" ? "h-5 px-2 text-[11px]" : size === "lg" ? "h-8 px-3.5 text-[13.5px]" : "h-6 px-2.5 text-[12px]",
      )}
    >
      <span className={cx("rounded-full", TONE_DOT[o.tone], size === "lg" ? "size-2" : "size-1.5")} />
      {label ?? o.label}
    </span>
  );
}

export function StatusDot({ status }: { status: Status }) {
  return <span className={cx("mt-[7px] size-2 shrink-0 rounded-full", TONE_DOT[STATUS_TONE[status]], status === "incomplete" && "bg-transparent ring-[1.5px] ring-fg-3")} />;
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("font-mono text-[12.5px]", className)}>{children}</span>;
}

export function Code({ children }: { children: ReactNode }) {
  return <span className="rounded bg-panel-2 px-1 py-px font-mono text-[12px] text-fg ring-1 ring-inset ring-line">{children}</span>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line-strong bg-panel px-1 font-sans text-[11px] text-fg-3">{children}</kbd>;
}

// ---------------------------------------------------------------------------
// Surfaces

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("rounded-xl border border-line bg-panel shadow-card", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, actions, icon, className }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <div className={cx("flex items-start gap-3 border-b border-line px-4 py-3", className)}>
      {icon && <div className="mt-0.5 text-fg-3">{icon}</div>}
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold tracking-tight">{title}</div>
        {subtitle && <div className="mt-0.5 text-[12.5px] text-fg-3">{subtitle}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </div>
  );
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-3", className)}>{children}</div>;
}

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-[12px] font-medium text-fg-3">{eyebrow}</div>}
        <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[13.5px] text-fg-2">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-panel-2 text-fg-3 ring-1 ring-line">{icon}</div>}
      <div className="text-[14px] font-medium">{title}</div>
      {children && <div className="mt-1 max-w-sm text-[13px] text-fg-3">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx("size-4 animate-spin text-fg-3", className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton h-4", className)} />;
}

// ---------------------------------------------------------------------------
// Form controls

/** Drop the default full width when the caller sets its own width. */
const sized = (className?: string) => (/(^|\s)!?w-/.test(className ?? "") ? control.replace("w-full ", "") : control);

const control =
  "w-full rounded-lg border border-line-strong bg-panel px-2.5 text-[13.5px] text-fg shadow-sm transition-colors placeholder:text-fg-3 hover:border-fg-3/50 focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/15 disabled:opacity-60";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx(sized(className), "h-8", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx(sized(className), "min-h-20 py-2 leading-relaxed", className)} {...rest} />;
});

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(sized(className), "h-8 appearance-none bg-[length:12px] bg-[right_8px_center] bg-no-repeat pr-7", className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238b8b94' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }} {...rest}>
      {children}
    </select>
  );
}

export function Field({ label, hint, children, className, htmlFor }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1 block text-[12px] font-medium text-fg-2">
        {label}
      </label>
      {children}
      {hint && <div className="mt-1 text-[11.5px] text-fg-3">{hint}</div>}
    </div>
  );
}

/** Yes / No / Unknown toggle for knowledge questions ("yes" is always adverse). */
export function AnswerToggle({ value, onChange, size = "md" }: { value: "yes" | "no" | "unknown"; onChange: (v: "yes" | "no" | "unknown") => void; size?: "sm" | "md" }) {
  const opts: { v: "yes" | "no" | "unknown"; label: string; on: string }[] = [
    { v: "no", label: "No", on: "bg-panel text-green-text shadow-sm ring-1 ring-line-strong" },
    { v: "yes", label: "Yes", on: "bg-red-soft text-red-text shadow-sm ring-1 ring-red/30" },
    { v: "unknown", label: "?", on: "bg-panel text-fg-2 shadow-sm ring-1 ring-line-strong" },
  ];
  return (
    <div className={cx("inline-flex shrink-0 rounded-lg bg-panel-2 p-0.5 ring-1 ring-inset ring-line", size === "sm" ? "h-6" : "h-7")}>
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={cx("min-w-8 rounded-md px-2 text-[12px] font-medium transition-all", value === o.v ? o.on : "text-fg-3 hover:text-fg-2")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div className={cx("inline-flex h-8 rounded-lg bg-panel-2 p-0.5 ring-1 ring-inset ring-line", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx("rounded-md px-2.5 text-[12.5px] font-medium transition-all", value === o.value ? "bg-panel text-fg shadow-sm ring-1 ring-line-strong" : "text-fg-3 hover:text-fg-2")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overlays

export const TooltipProvider = TooltipPrimitive.Provider;

export function Tooltip({ content, children, side = "top" }: { content: ReactNode; children: ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  if (!content) return <>{children}</>;
  return (
    <TooltipPrimitive.Root delayDuration={250}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content side={side} sideOffset={6} className="z-50 max-w-xs rounded-md bg-fg px-2 py-1 text-[12px] leading-snug text-bg shadow-float animate-in">
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

export function Dialog({ open, onOpenChange, title, description, children, footer, wide }: { open: boolean; onOpenChange: (o: boolean) => void; title: ReactNode; description?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px] animate-in dark:bg-black/60" />
        <DialogPrimitive.Content className={cx("fixed left-1/2 top-[12vh] z-50 max-h-[76vh] w-[calc(100vw-32px)] -translate-x-1/2 overflow-hidden rounded-2xl border border-line bg-panel shadow-float animate-in focus:outline-none", wide ? "max-w-3xl" : "max-w-lg")}>
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <DialogPrimitive.Title className="text-[15px] font-semibold tracking-tight">{title}</DialogPrimitive.Title>
              {description && <DialogPrimitive.Description className="mt-0.5 text-[13px] text-fg-3">{description}</DialogPrimitive.Description>}
            </div>
            <DialogPrimitive.Close className="rounded-md p-1 text-fg-3 hover:bg-panel-2 hover:text-fg">
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>
          <div className="scroll-thin max-h-[calc(76vh-130px)] overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-line bg-panel-2/50 px-5 py-3">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function Sheet({ open, onOpenChange, title, subtitle, children, actions, width = "max-w-2xl" }: { open: boolean; onOpenChange: (o: boolean) => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; actions?: ReactNode; width?: string }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/20 dark:bg-black/50" />
        <DialogPrimitive.Content className={cx("fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-line bg-panel shadow-float focus:outline-none", width)} style={{ animation: "fade-in .2s ease-out" }}>
          <div className="flex items-start gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="text-[15px] font-semibold tracking-tight">{title}</DialogPrimitive.Title>
              {subtitle && <DialogPrimitive.Description className="mt-0.5 text-[12.5px] text-fg-3">{subtitle}</DialogPrimitive.Description>}
            </div>
            {actions}
            <DialogPrimitive.Close className="rounded-md p-1 text-fg-3 hover:bg-panel-2 hover:text-fg">
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>
          <div className="scroll-thin flex-1 overflow-y-auto">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function Tabs({ value, onValueChange, tabs, children, className }: { value: string; onValueChange: (v: string) => void; tabs: { value: string; label: ReactNode; count?: number }[]; children: ReactNode; className?: string }) {
  return (
    <TabsPrimitive.Root value={value} onValueChange={onValueChange} className={className}>
      <TabsPrimitive.List className="flex gap-1 border-b border-line">
        {tabs.map((t) => (
          <TabsPrimitive.Trigger
            key={t.value}
            value={t.value}
            className="-mb-px inline-flex h-9 items-center gap-1.5 border-b-2 border-transparent px-2.5 text-[13px] font-medium text-fg-3 transition-colors hover:text-fg-2 data-[state=active]:border-fg data-[state=active]:text-fg"
          >
            {t.label}
            {t.count !== undefined && <span className="rounded-full bg-panel-2 px-1.5 text-[11px] tabular text-fg-3 ring-1 ring-line">{t.count}</span>}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {children}
    </TabsPrimitive.Root>
  );
}
export const TabPanel = TabsPrimitive.Content;

// ---------------------------------------------------------------------------
// Tiny toast

import { create } from "./toast.ts";
export const toast = create;
