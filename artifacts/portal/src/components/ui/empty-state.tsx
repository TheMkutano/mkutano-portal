import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, body, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-4 text-center", className)}>
      {icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--brand-tint)]">
          <span className="text-[var(--brand-primary)] [&>svg]:h-6 [&>svg]:w-6">{icon}</span>
        </div>
      )}
      <div className="space-y-1">
        <p className="text-sm font-semibold text-[var(--brand-ink)]">{title}</p>
        {body && <p className="text-xs text-[var(--brand-text-secondary)] max-w-[260px]">{body}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
