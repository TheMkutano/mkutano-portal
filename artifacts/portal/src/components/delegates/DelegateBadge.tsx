import { QRCodeSVG } from "qrcode.react";
import type { Delegate } from "@workspace/api-client-react";
import { label } from "@/lib/labels";
import { PASS_STYLE, PASS_STYLE_FALLBACK } from "@/lib/passTypes";

interface DelegateBadgeProps {
  delegate: Delegate;
  conveningName?: string;
  /** Pre-resolved config label for the delegate's pass type.
   *  Falls back to labels.ts enum label when not provided. */
  passTypeLabel?: string;
}

export function DelegateBadge({ delegate, conveningName, passTypeLabel }: DelegateBadgeProps) {
  const ps = PASS_STYLE[delegate.passType] ?? PASS_STYLE_FALLBACK;
  const ptLabel = passTypeLabel ?? label(delegate.passType);

  return (
    <div
      className="delegate-badge flex bg-white rounded-lg overflow-hidden print:rounded-none"
      style={{
        width: 340,
        minHeight: 200,
        border: "1px solid var(--brand-border)",
        breakInside: "avoid",
        pageBreakInside: "avoid",
      }}
    >
      {/* Left: branding strip */}
      <div
        className="flex flex-col justify-between px-3 py-3"
        style={{ background: "var(--brand-navy)", width: 12, minWidth: 12 }}
      />

      {/* Centre: delegate info */}
      <div className="flex-1 px-4 py-3 flex flex-col justify-between gap-2">
        {/* Top: convening name */}
        {conveningName && (
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--brand-text-secondary)]">
            {conveningName}
          </p>
        )}

        {/* Name + designation */}
        <div>
          <p className="text-[17px] font-bold leading-tight text-[var(--brand-ink)]">{delegate.name}</p>
          {delegate.jobTitle && (
            <p className="text-[11px] text-[var(--brand-text-secondary)] mt-0.5">{delegate.jobTitle}</p>
          )}
          {delegate.organization && (
            <p className="text-[12px] font-medium text-[var(--brand-ink)] mt-0.5">{delegate.organization}</p>
          )}
        </div>

        {/* Constituency + country */}
        <div className="flex items-center gap-2 flex-wrap">
          {delegate.segment && (
            <span className="text-[10px] text-[var(--brand-text-secondary)]">{delegate.segment}</span>
          )}
          {delegate.segment && delegate.country && (
            <span className="text-[10px] text-[var(--brand-text-secondary)]">·</span>
          )}
          {delegate.country && (
            <span className="text-[10px] text-[var(--brand-text-secondary)]">{delegate.country}</span>
          )}
        </div>

        {/* Pass type badge */}
        <div>
          <span
            className="inline-flex items-center px-2 py-0.5 text-[9px] font-bold rounded-[4px] uppercase tracking-[0.06em]"
            style={{ background: ps.bg, color: ps.fg }}
          >
            {ptLabel}
          </span>
        </div>
      </div>

      {/* Right: QR code */}
      <div className="flex items-center justify-center px-3 py-3 shrink-0">
        {delegate.qrCode && (
          <QRCodeSVG
            value={delegate.qrCode}
            size={72}
            level="M"
            includeMargin={false}
          />
        )}
      </div>
    </div>
  );
}
