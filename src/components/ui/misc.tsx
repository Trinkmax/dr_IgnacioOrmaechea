"use client";

import { useId, type CSSProperties, type ReactNode } from "react";
import { motion } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { avatarColor, colorVars } from "@/lib/colors";
import { STATUS_META, type AppointmentStatus } from "@/lib/types";

// ---------------------------------------------------------------------------
export function Card({ className, children, as: As = "div" }: { className?: string; children: ReactNode; as?: "div" | "section" | "article" }) {
  return <As className={cn("rounded-card border border-line/80 bg-surface shadow-card", className)}>{children}</As>;
}

export function SectionTitle({ title, action, className, subtitle }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

// ---------------------------------------------------------------------------
const toneClass = {
  neutral: "bg-sunken text-ink-2",
  info: "bg-info-soft text-info",
  accent: "bg-accent-soft text-accent-ink",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  dark: "bg-brand text-white",
} as const;

export type Tone = keyof typeof toneClass;

export function Badge({ tone = "neutral", children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium", toneClass[tone], className)}>
      {dot ? <span className="size-1.5 rounded-full bg-current" aria-hidden /> : null}
      {children}
    </span>
  );
}

export function StatusBadge({ status, className }: { status: AppointmentStatus; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <Badge tone={meta.tone} dot className={className}>
      {meta.label}
    </Badge>
  );
}

export function TreatmentTag({ name, color, className }: { name: string; color: string | null | undefined; className?: string }) {
  return (
    <span
      style={colorVars(color)}
      className={cn(
        "inline-flex h-6 max-w-full items-center gap-1.5 truncate rounded-full bg-[var(--tc-soft)] px-2.5 text-xs font-medium text-[var(--tc-ink)]",
        className,
      )}
    >
      <span className="size-1.5 shrink-0 rounded-full bg-[var(--tc)]" aria-hidden />
      <span className="truncate">{name}</span>
    </span>
  );
}

export function ColorDot({ color, className }: { color: string | null | undefined; className?: string }) {
  return <span style={colorVars(color)} className={cn("inline-block size-2.5 shrink-0 rounded-full bg-[var(--tc)]", className)} aria-hidden />;
}

// ---------------------------------------------------------------------------
export function Avatar({ name, size = 36, className }: { name: string | null | undefined; size?: number; className?: string }) {
  const c = avatarColor(name);
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, background: c.soft, color: c.ink, fontSize: Math.round(size * 0.36) } as CSSProperties}
      className={cn("inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold tracking-wide ring-1 ring-black/[0.03]", className)}
    >
      {initials(name)}
    </span>
  );
}

// ---------------------------------------------------------------------------
export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div className={cn("skeleton", className)} style={style} aria-hidden />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      {icon ? (
        <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-sunken text-muted [&_svg]:size-5">{icon}</div>
      ) : null}
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
export function Progress({ value, className, tone = "success" }: { value: number; className?: string; tone?: "success" | "accent" | "warning" | "danger" }) {
  const pct = Math.max(0, Math.min(100, value));
  const bar = { success: "bg-success", accent: "bg-accent", warning: "bg-warning", danger: "bg-danger" }[tone];
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-sunken", className)} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full transition-[width] duration-500 ease-out", bar)} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors duration-200 ease-out disabled:opacity-50",
        checked ? "bg-success" : "bg-line-strong",
      )}
    >
      <span
        className={cn(
          "inline-block size-5 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.25)] transition-transform duration-200 ease-out",
          checked ? "translate-x-[18px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
/** Control segmentado con indicador animado. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "md",
  stretch,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: ReactNode; count?: number }[];
  className?: string;
  size?: "sm" | "md";
  stretch?: boolean;
}) {
  const layoutId = useId();
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-xl bg-sunken p-1",
        stretch && "flex w-full",
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "relative inline-flex items-center justify-center gap-1.5 rounded-[9px] font-medium transition-colors duration-150",
              size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-[13px]",
              stretch && "flex-1",
              active ? "text-ink" : "text-muted hover:text-ink-2",
            )}
          >
            {active ? (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-[9px] bg-surface shadow-[0_1px_2px_rgb(30_25_22/0.08),0_1px_6px_-2px_rgb(30_25_22/0.1)]"
                transition={{ type: "spring", duration: 0.35, bounce: 0.15 }}
              />
            ) : null}
            <span className="relative z-10 whitespace-nowrap">{opt.label}</span>
            {opt.count != null && opt.count > 0 ? (
              <span className={cn("relative z-10 rounded-full px-1.5 text-[10px] font-semibold tabular-nums", active ? "bg-accent-soft text-accent-ink" : "bg-line text-ink-2")}>
                {opt.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
export function PeriodNav({
  label,
  onPrev,
  onNext,
  onToday,
  todayLabel = "Hoy",
  className,
}: {
  label: ReactNode;
  onPrev: () => void;
  onNext: () => void;
  onToday?: () => void;
  todayLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      {onToday ? (
        <button
          type="button"
          onClick={onToday}
          className="h-9 rounded-xl border border-line bg-surface px-3 text-[13px] font-medium text-ink shadow-card transition-colors hover:bg-subtle active:scale-[0.97]"
        >
          {todayLabel}
        </button>
      ) : null}
      <div className="flex items-center rounded-xl border border-line bg-surface shadow-card">
        <button type="button" onClick={onPrev} aria-label="Anterior" className="flex size-9 items-center justify-center rounded-l-xl text-ink-2 transition-colors hover:bg-subtle active:bg-sunken">
          <ChevronLeft className="size-4" />
        </button>
        <span className="min-w-0 px-1 text-center text-[13px] font-semibold capitalize text-ink">{label}</span>
        <button type="button" onClick={onNext} aria-label="Siguiente" className="flex size-9 items-center justify-center rounded-r-xl text-ink-2 transition-colors hover:bg-subtle active:bg-sunken">
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
/** Encabezado de página: título serif + acciones. */
export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-x-4 gap-y-3", className)}>
      <div className="min-w-0">
        <h1 className="font-display text-[34px] leading-[1.05] tracking-[-0.01em] text-ink md:text-[40px]">{title}</h1>
        {subtitle ? <p className="mt-1.5 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Kpi({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: "neutral" | "success" | "danger" | "warning" | "accent";
  className?: string;
}) {
  const iconTone = {
    neutral: "bg-sunken text-ink-2",
    success: "bg-success-soft text-success",
    danger: "bg-danger-soft text-danger",
    warning: "bg-warning-soft text-warning",
    accent: "bg-accent-soft text-accent-ink",
  }[tone];
  return (
    <Card className={cn("flex min-w-0 flex-col gap-3 p-4 md:p-5", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[13px] font-medium text-muted">{label}</span>
        {icon ? <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-xl [&_svg]:size-4", iconTone)}>{icon}</span> : null}
      </div>
      <div className="truncate font-display text-[26px] leading-none tracking-[-0.01em] tabular-nums text-ink sm:text-[28px] md:text-[32px]">{value}</div>
      {hint ? <div className="line-clamp-2 text-xs leading-snug text-muted">{hint}</div> : null}
    </Card>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-line bg-subtle px-1 font-sans text-[11px] font-medium text-muted">
      {children}
    </kbd>
  );
}
