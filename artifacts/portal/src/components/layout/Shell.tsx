import { ReactNode } from "react";
import Sidebar from "./Sidebar";
import { EventCountdown } from "./EventCountdown";
import { useConvening } from "@/contexts/ConveningContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useListConvenings } from "@workspace/api-client-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Sheet } from "lucide-react";

function todayLabel() {
  return new Date().toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function Shell({ children }: { children: ReactNode }) {
  const { activeConveningId, setActiveConveningId, activeConvening } = useConvening();
  const { displayCurrency, setDisplayCurrency } = useCurrency();
  const { data: convenings = [] } = useListConvenings();

  return (
    <div className="flex min-h-screen" style={{ background: "var(--brand-page-bg)" }}>
      <Sidebar />

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* ── Top bar ── */}
        <div
          className="flex items-center gap-4 px-6 h-12 border-b shrink-0 bg-white"
          style={{ borderColor: "var(--brand-border)" }}
        >
          {/* Convening switcher */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium text-[var(--brand-ink)] hover:bg-[var(--brand-tint)] transition-colors max-w-[220px]"
              >
                <span className="truncate">
                  {activeConvening ? activeConvening.name : "Select convening"}
                </span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--brand-text-secondary)]" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {convenings.map((c) => (
                <DropdownMenuItem
                  key={c.id}
                  onClick={() => setActiveConveningId(c.id)}
                  className={c.id === activeConveningId ? "font-semibold" : ""}
                >
                  {c.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Google Sheet quick-link — shown only when a sheet has been synced */}
          {activeConvening?.googleSheetId && (
            <a
              href={`https://docs.google.com/spreadsheets/d/${activeConvening.googleSheetId}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Open in Google Sheets"
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold text-[#0F9D58] hover:bg-[#E8F5E9] transition-colors whitespace-nowrap"
            >
              <Sheet className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">Open in Sheets</span>
            </a>
          )}

          <div className="flex-1" />

          {/* Event countdown */}
          <EventCountdown startDate={activeConvening?.startDate} />

          {/* Separator */}
          <div className="h-4 w-px bg-[var(--brand-border)]" />

          {/* Today's date */}
          <span className="text-xs text-[var(--brand-text-secondary)] tabular-nums whitespace-nowrap">
            {todayLabel()}
          </span>

          {/* Separator */}
          <div className="h-4 w-px bg-[var(--brand-border)]" />

          {/* Currency toggle — ONE place in the whole app */}
          <div className="flex items-center rounded-md border border-[var(--brand-border)] overflow-hidden text-[11px] font-semibold">
            {(["USD", "UGX"] as const).map((cur) => (
              <button
                key={cur}
                onClick={() => setDisplayCurrency(cur)}
                className={`px-2.5 py-1 transition-colors ${
                  displayCurrency === cur
                    ? "bg-[var(--brand-primary)] text-white"
                    : "text-[var(--brand-text-secondary)] hover:bg-[var(--brand-tint)]"
                }`}
              >
                {cur}
              </button>
            ))}
          </div>
        </div>

        {/* ── No-convening banner ── */}
        {!activeConveningId && (
          <div
            className="border-b px-6 py-2.5 text-sm font-medium flex items-center justify-center"
            style={{
              background: "#FFFBEB",
              borderColor: "#FDE68A",
              color: "#92400E",
            }}
          >
            No active convening selected — choose one from the switcher above.
          </div>
        )}

        {/* ── Page content ── */}
        <div className="flex-1 overflow-auto">
          <div className="mx-auto max-w-7xl px-6 py-8 lg:px-10 lg:py-10">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
