import { useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DelegateBadge } from "./DelegateBadge";
import type { Delegate } from "@workspace/api-client-react";
import { Printer, X } from "lucide-react";

interface BadgeSheetProps {
  open: boolean;
  onClose: () => void;
  delegates: Delegate[];
  conveningName?: string;
  /** Resolved pass-type labels keyed by passType enum value.
   *  Comes from passTypeConfigs so printed badges show the config label. */
  configLabelByType?: Record<string, string>;
}

export function BadgeSheet({ open, onClose, delegates, conveningName, configLabelByType }: BadgeSheetProps) {
  const printRef = useRef<HTMLDivElement>(null);

  function handlePrint() {
    const style = document.createElement("style");
    style.id = "__badge-print-style";
    style.textContent = `
      @media print {
        body > * { display: none !important; }
        #badge-print-portal { display: block !important; }
        #badge-print-portal .delegate-badge {
          border: 1px solid #ccc !important;
          break-inside: avoid;
          page-break-inside: avoid;
        }
      }
    `;
    document.head.appendChild(style);

    const portal = document.createElement("div");
    portal.id = "badge-print-portal";
    portal.style.display = "none";
    portal.style.position = "fixed";
    portal.style.inset = "0";
    portal.style.background = "white";
    portal.style.zIndex = "99999";
    portal.style.padding = "16px";

    const grid = document.createElement("div");
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = "repeat(2, auto)";
    grid.style.gap = "12px";
    grid.style.justifyContent = "start";

    if (printRef.current) {
      const badges = printRef.current.querySelectorAll(".delegate-badge");
      badges.forEach((b) => {
        const clone = b.cloneNode(true) as HTMLElement;
        grid.appendChild(clone);
      });
    }
    portal.appendChild(grid);
    document.body.appendChild(portal);

    window.print();

    setTimeout(() => {
      document.head.removeChild(style);
      document.body.removeChild(portal);
    }, 1000);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="flex flex-row items-center justify-between px-6 py-4 border-b border-[var(--brand-border)] shrink-0">
          <DialogTitle className="text-[16px] font-semibold text-[var(--brand-ink)]">
            Delegate Badges
            <span className="ml-2 text-[13px] font-normal text-[var(--brand-text-secondary)]">
              {delegates.length} badge{delegates.length !== 1 ? "s" : ""}
            </span>
          </DialogTitle>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="gap-2 bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-dark)] text-white"
              onClick={handlePrint}
            >
              <Printer className="h-4 w-4" /> Print all
            </Button>
            <button
              onClick={onClose}
              className="p-1.5 rounded text-[var(--brand-text-secondary)] hover:text-[var(--brand-ink)] hover:bg-[var(--brand-tint)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {delegates.length === 0 ? (
            <div className="py-16 text-center text-[13px] text-[var(--brand-text-secondary)]">
              No delegates to print.
            </div>
          ) : (
            <div
              ref={printRef}
              className="grid gap-3"
              style={{ gridTemplateColumns: "repeat(auto-fill, 340px)" }}
            >
              {delegates.map((d) => (
                <DelegateBadge
                  key={d.id}
                  delegate={d}
                  conveningName={conveningName}
                  passTypeLabel={configLabelByType?.[d.passType]}
                />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
