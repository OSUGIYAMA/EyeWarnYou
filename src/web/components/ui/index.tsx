// Design-system primitives. Quiet by default: typography carries the hierarchy, colour carries
// meaning, and every surface earns its place. See src/web/DESIGN.md.
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { ChevronsUpDown, CircleAlert, CircleCheck, CircleDashed, CircleMinus, CircleX, Info, Loader2, OctagonX, TriangleAlert, X } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import type { Outcome, Status } from "@/shared/assessment.ts";
import { cx, OUTCOME, TONE_CLASSES, TONE_DOT, type Tone } from "../../lib/format.ts";

// ---------------------------------------------------------------------------
// Buttons

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
const BUTTON: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-fg hover:bg-accent-hover",
  secondary: "bg-fill text-fg hover:bg-panel-3",
  subtle: "bg-fill text-fg hover:bg-panel-3",
  ghost: "text-accent-text hover:bg-accent-soft",
  danger: "bg-fill text-red-text hover:bg-red-soft",
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
        "inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-medium transition-[background-color,opacity,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40",
        size === "sm" ? "h-7 px-3 text-[12.5px]" : size === "lg" ? "h-11 px-6 text-[15px]" : "h-[34px] px-4 text-[13.5px]",
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
      <button aria-label={label} className={cx("inline-flex size-7 items-center justify-center rounded-full text-fg-3 transition-colors hover:bg-fill hover:text-fg", className)} {...rest}>
        {children}
      </button>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// Status: outcomes of a determination and the status of a single finding.
// Colour sits on the symbol; the words stay in ink.

const OUTCOME_COLOR: Record<Outcome, string> = {
  prohibited: "text-red",
  license_required: "text-orange",
  exception_available: "text-amber",
  incomplete: "text-fg-3",
  no_license_required: "text-green",
  not_applicable: "text-fg-3",
};

export function OutcomeDot({ outcome, className }: { outcome: Outcome; className?: string }) {
  if (outcome === "incomplete") return <span className={cx("size-2 shrink-0 rounded-full ring-[1.5px] ring-inset ring-fg-3", className)} />;
  return <span className={cx("size-2 shrink-0 rounded-full bg-current", OUTCOME_COLOR[outcome], outcome === "not_applicable" && "opacity-40", className)} />;
}

/** Large glyph for the headline verdict. */
export function OutcomeIcon({ outcome, className }: { outcome: Outcome; className?: string }) {
  const cls = cx("shrink-0", OUTCOME_COLOR[outcome], className);
  const filled = { fill: "currentColor", stroke: "var(--panel)", strokeWidth: 2 } as const;
  switch (outcome) {
    case "prohibited":
      return <OctagonX className={cls} {...filled} />;
    case "license_required":
    case "exception_available":
      return <CircleAlert className={cls} {...filled} />;
    case "no_license_required":
      return <CircleCheck className={cls} {...filled} />;
    case "incomplete":
      return <CircleDashed className={cls} strokeWidth={2} />;
    default:
      return <CircleMinus className={cls} />;
  }
}

export function OutcomePill({ outcome, size = "md", label }: { outcome: Outcome; size?: "sm" | "md" | "lg"; label?: string }) {
  const o = OUTCOME[outcome];
  return (
    <span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap", size === "sm" ? "text-[12.5px] text-fg-2" : size === "lg" ? "text-[15px] font-semibold text-fg" : "text-[13px] font-medium text-fg")}>
      <OutcomeDot outcome={outcome} className={size === "lg" ? "size-2.5" : undefined} />
      {label ?? o.label}
    </span>
  );
}

/** Finding status as an SF-Symbols-style glyph. */
export function StatusDot({ status, className }: { status: Status; className?: string }) {
  const base = cx("mt-[2px] size-[15px] shrink-0", className);
  const filled = { fill: "currentColor", stroke: "var(--panel)", strokeWidth: 2 } as const;
  switch (status) {
    case "block":
      return <CircleX className={cx(base, "text-red")} {...filled} />;
    case "flag":
      return <TriangleAlert className={cx(base, "text-orange")} {...filled} />;
    case "incomplete":
      return <CircleDashed className={cx(base, "text-fg-3")} strokeWidth={2} />;
    case "pass":
      return <CircleCheck className={cx(base, "text-green")} {...filled} />;
    default:
      return <Info className={cx(base, "text-accent")} {...filled} />;
  }
}

export function Badge({ tone = "gray", children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cx("inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-[6px] px-1.5 text-[11.5px] font-medium", TONE_CLASSES[tone], className)}>
      {dot && <span className={cx("size-1.5 rounded-full", TONE_DOT[tone])} />}
      {children}
    </span>
  );
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("font-mono text-[12.5px]", className)}>{children}</span>;
}

export function Code({ children }: { children: ReactNode }) {
  return <span className="rounded-[5px] bg-fill px-1.5 py-px font-mono text-[12px] text-fg">{children}</span>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] bg-fill px-1 font-sans text-[11px] font-medium text-fg-3">{children}</kbd>;
}

// ---------------------------------------------------------------------------
// Surfaces

/**
 * A group of related content: a band on the white canvas, bounded by hairlines. Flat by design —
 * rounding is reserved for things you can press, and overlays.
 */
export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("border-y border-line bg-panel", className)} {...rest}>
      {children}
    </div>
  );
}
export const Group = Card;

export function CardHeader({ title, subtitle, actions, className }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <div className={cx("flex items-center gap-3 border-b border-line px-4 py-3", className)}>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold tracking-tight">{title}</div>
        {subtitle && <div className="mt-0.5 text-[13px] text-fg-2">{subtitle}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </div>
  );
}

/** A titled section: the heading sits above its group, as in System Settings. */
export function Section({ title, description, actions, children, id, className, lead }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; id?: string; className?: string; lead?: ReactNode }) {
  return (
    <section id={id} className={cx("scroll-mt-8", className)}>
      <div className="mb-2.5 flex items-end justify-between gap-4 px-1">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[17px] font-semibold tracking-tight">
            {lead}
            {title}
          </h2>
          {description && <p className="mt-0.5 text-[13px] leading-snug text-fg-2">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("text-[13px] font-semibold text-fg-2", className)}>{children}</div>;
}

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-[13px] font-medium text-fg-3">{eyebrow}</div>}
        <h1 className="text-[30px] font-bold leading-tight tracking-[-0.022em]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-fg-2">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-3 text-fg-3 [&>svg]:size-8 [&>svg]:stroke-[1.5]">{icon}</div>}
      <div className="text-[17px] font-semibold tracking-tight">{title}</div>
      {children && <div className="mt-1 max-w-sm text-[14px] leading-relaxed text-fg-2">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
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
  "w-full rounded-[9px] border border-transparent bg-fill-2 px-3 text-[14px] text-fg transition-[background-color,border-color,box-shadow] placeholder:text-fg-3 hover:bg-fill focus:border-accent focus:bg-panel focus:outline-none focus:ring-4 focus:ring-accent/15 disabled:opacity-50";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx(sized(className), "h-[34px]", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx(sized(className), "min-h-20 py-2 leading-relaxed", className)} {...rest} />;
});

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={cx("relative", /(^|\s)!?w-/.test(className ?? "") ? "shrink-0" : "w-full", className?.match(/(^|\s)(!?w-\S+)/)?.[2])}>
      <select className={cx(sized(className), "h-[34px] appearance-none pr-8", className?.replace(/(^|\s)!?w-\S+/g, ""))} {...rest}>
        {children}
      </select>
      <ChevronsUpDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-3" />
    </div>
  );
}

export function Field({ label, hint, children, className, htmlFor }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[12.5px] font-medium text-fg-2">
        {label}
      </label>
      {children}
      {hint && <div className="mt-1.5 text-[12px] leading-snug text-fg-3">{hint}</div>}
    </div>
  );
}

/**
 * Answer to a knowledge question. Unanswered shows neither option selected; choosing the selected
 * option again clears it. "Yes" is always the adverse answer.
 */
export function AnswerToggle({ value, onChange, size = "md" }: { value: "yes" | "no" | "unknown"; onChange: (v: "yes" | "no" | "unknown") => void; size?: "sm" | "md" }) {
  const opts: { v: "yes" | "no"; label: string }[] = [
    { v: "no", label: "No" },
    { v: "yes", label: "Yes" },
  ];
  return (
    <div role="radiogroup" className={cx("inline-flex shrink-0 rounded-[9px] bg-fill p-[2px]", size === "sm" ? "h-7" : "h-8")}>
      {opts.map((o) => {
        const on = value === o.v;
        return (
          <button
            key={o.v}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(on ? "unknown" : o.v)}
            className={cx(
              "min-w-11 rounded-[7px] px-2.5 text-[12.5px] font-medium transition-all duration-150",
              on ? cx("bg-thumb shadow-thumb", o.v === "yes" ? "text-red-text" : "text-fg") : "text-fg-2 hover:text-fg",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div role="radiogroup" className={cx("inline-flex h-8 rounded-[9px] bg-fill p-[2px]", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx("whitespace-nowrap rounded-[7px] px-3 text-[13px] font-medium transition-all duration-150", value === o.value ? "bg-thumb text-fg shadow-thumb" : "text-fg-2 hover:text-fg")}
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
    <TooltipPrimitive.Root delayDuration={350}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content side={side} sideOffset={6} className="z-50 max-w-xs rounded-lg bg-[#1d1d1f]/92 px-2.5 py-1.5 text-[12px] leading-snug text-white shadow-float animate-in dark:bg-[#3a3a3c]">
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

function CloseButton() {
  return (
    <DialogPrimitive.Close aria-label="Close" className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-fill text-fg-2 transition-colors hover:bg-panel-3 hover:text-fg">
      <X className="size-3.5" strokeWidth={2.25} />
    </DialogPrimitive.Close>
  );
}

export function Dialog({ open, onOpenChange, title, description, children, footer, wide }: { open: boolean; onOpenChange: (o: boolean) => void; title: ReactNode; description?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/25 animate-in dark:bg-black/60" />
        <DialogPrimitive.Content className={cx("fixed left-1/2 top-[12vh] z-50 max-h-[76vh] w-[calc(100vw-32px)] -translate-x-1/2 overflow-hidden rounded-2xl bg-panel shadow-float animate-in focus:outline-none", wide ? "max-w-3xl" : "max-w-lg")}>
          <div className="flex items-start justify-between gap-4 px-6 pb-2 pt-5">
            <div>
              <DialogPrimitive.Title className="text-[17px] font-semibold tracking-tight">{title}</DialogPrimitive.Title>
              {description && <DialogPrimitive.Description className="mt-1 text-[13.5px] leading-snug text-fg-2">{description}</DialogPrimitive.Description>}
            </div>
            <CloseButton />
          </div>
          <div className="scroll-thin max-h-[calc(76vh-130px)] overflow-y-auto px-6 py-3">{children}</div>
          {footer && <div className="flex justify-end gap-2 px-6 pb-5 pt-3">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function Sheet({ open, onOpenChange, title, subtitle, children, actions, width = "max-w-2xl" }: { open: boolean; onOpenChange: (o: boolean) => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; actions?: ReactNode; width?: string }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/15 dark:bg-black/50" />
        <DialogPrimitive.Content className={cx("fixed inset-y-2 right-2 z-50 flex w-[calc(100%-16px)] flex-col overflow-hidden rounded-2xl bg-panel shadow-float focus:outline-none", width)} style={{ animation: "slide-in .24s cubic-bezier(.2,.8,.2,1)" }}>
          <div className="flex items-start gap-3 border-b border-line px-6 py-4">
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="text-[17px] font-semibold tracking-tight">{title}</DialogPrimitive.Title>
              {subtitle && <DialogPrimitive.Description className="mt-0.5 text-[13px] text-fg-2">{subtitle}</DialogPrimitive.Description>}
            </div>
            {actions}
            <CloseButton />
          </div>
          <div className="scroll-thin flex-1 overflow-y-auto">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** View switcher, drawn as a segmented control. */
export function Tabs({ value, onValueChange, tabs, children, className }: { value: string; onValueChange: (v: string) => void; tabs: { value: string; label: ReactNode; count?: number }[]; children: ReactNode; className?: string }) {
  return (
    <TabsPrimitive.Root value={value} onValueChange={onValueChange} className={className}>
      <TabsPrimitive.List className="inline-flex h-8 rounded-[9px] bg-fill p-[2px]">
        {tabs.map((t) => (
          <TabsPrimitive.Trigger
            key={t.value}
            value={t.value}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-[7px] px-3 text-[13px] font-medium text-fg-2 transition-all duration-150 hover:text-fg data-[state=active]:bg-thumb data-[state=active]:text-fg data-[state=active]:shadow-thumb"
          >
            {t.label}
            {t.count !== undefined && <span className="tabular text-[12px] font-normal text-fg-3">{t.count}</span>}
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
