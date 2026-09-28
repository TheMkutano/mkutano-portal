import { createContext, useContext, useEffect, useRef, ReactNode } from "react";
import { useConvening } from "./ConveningContext";

const DEFAULT_PRIMARY = "#2A6FB0";
const DEFAULT_ACCENT = "#1B9DD9";

interface BrandingContextType {
  primaryColor: string;
  accentColor: string;
  logoUrl: string | null;
  isWhiteLabel: boolean;
}

const BrandingContext = createContext<BrandingContextType>({
  primaryColor: DEFAULT_PRIMARY,
  accentColor: DEFAULT_ACCENT,
  logoUrl: null,
  isWhiteLabel: false,
});

export function BrandingProvider({ children }: { children: ReactNode }) {
  const { activeConvening } = useConvening();
  const rootRef = useRef<HTMLDivElement>(null);

  const primary = activeConvening?.brandPrimaryColor ?? DEFAULT_PRIMARY;
  const accent = activeConvening?.brandAccentColor ?? DEFAULT_ACCENT;
  const logoUrl = activeConvening?.brandLogoUrl ?? null;
  const isWhiteLabel = activeConvening?.whiteLabel ?? false;

  useEffect(() => {
    const el = document.documentElement;
    el.style.setProperty("--brand-primary", primary);
    el.style.setProperty("--brand-accent", accent);
  }, [primary, accent]);

  return (
    <BrandingContext.Provider
      value={{ primaryColor: primary, accentColor: accent, logoUrl, isWhiteLabel }}
    >
      <div ref={rootRef}>{children}</div>
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  return useContext(BrandingContext);
}
