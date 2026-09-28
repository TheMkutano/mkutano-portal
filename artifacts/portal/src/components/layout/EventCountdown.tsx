import { useMemo } from "react";
import { CalendarClock } from "lucide-react";

interface EventCountdownProps {
  startDate: string | null | undefined;
  eventName?: string;
}

export function EventCountdown({ startDate }: EventCountdownProps) {
  const label = useMemo(() => {
    if (!startDate) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(startDate);
    target.setHours(0, 0, 0, 0);
    const diff = Math.round((target.getTime() - today.getTime()) / 86_400_000);
    if (diff > 1)  return { text: `${diff} days to go`, accent: false };
    if (diff === 1) return { text: "Tomorrow", accent: true };
    if (diff === 0) return { text: "Today!", accent: true };
    if (diff === -1) return { text: "Started yesterday", accent: false };
    return { text: `${Math.abs(diff)}d in progress`, accent: false };
  }, [startDate]);

  if (!label) return null;

  return (
    <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--brand-text-secondary)]">
      <CalendarClock className="h-3.5 w-3.5 shrink-0" />
      <span className={label.accent ? "text-[var(--brand-primary)] font-semibold" : ""}>{label.text}</span>
    </div>
  );
}
