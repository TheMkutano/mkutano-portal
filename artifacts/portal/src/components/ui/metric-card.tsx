import { ReactNode } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface AccentIcon {
  icon: ReactNode;
  /** Background colour for the icon circle, e.g. "#E8F5EE" */
  bg: string;
  /** Foreground (icon) colour, e.g. "#2E7D5B" */
  fg: string;
}

interface MetricCardProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  trend?: number | null;
  className?: string;
  children?: ReactNode;
  /** Small tinted icon circle rendered in the top-right corner of the card */
  accentIcon?: AccentIcon;
}

export function MetricCard({ label, value, sub, trend, className, children, accentIcon }: MetricCardProps) {
  const hasTrend = trend != null && trend !== 0;
  const positive = trend != null && trend > 0;

  return (
    <div
      className={cn(
        "rounded-[10px] border border-[var(--brand-border)] bg-white px-5 py-4 shadow-none",
        className,
      )}
    >
      {/* Label row — icon floated to the right */}
      <div className="flex items-start justify-between mb-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--brand-text-secondary)]">
          {label}
        </p>
        {accentIcon && (
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full [&>svg]:h-3.5 [&>svg]:w-3.5"
            style={{ background: accentIcon.bg, color: accentIcon.fg }}
          >
            {accentIcon.icon}
          </div>
        )}
      </div>

      <div className="flex items-end justify-between gap-2">
        <div className="text-[26px] font-semibold tabular-nums leading-none text-[var(--brand-ink)]">
          {value}
        </div>
        {hasTrend && (
          <span
            className={cn(
              "flex items-center gap-0.5 text-xs font-semibold mb-0.5",
              positive ? "text-[var(--variance-fav)]" : "text-[var(--variance-adv)]",
            )}
          >
            {positive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            {positive ? "+" : ""}
            {trend}%
          </span>
        )}
      </div>

      {sub != null && (
        <p className="mt-1.5 text-xs text-[var(--brand-text-secondary)]">{sub}</p>
      )}

      {children}
    </div>
  );
}
