import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import type { DisplayCurrency } from "@/lib/money";

interface CurrencyContextValue {
  displayCurrency: DisplayCurrency;
  setDisplayCurrency: (c: DisplayCurrency) => void;
  usdToUgxRate: number | null;
  setUsdToUgxRate: (r: number | null) => void;
}

const CurrencyContext = createContext<CurrencyContextValue>({
  displayCurrency: "USD",
  setDisplayCurrency: () => {},
  usdToUgxRate: null,
  setUsdToUgxRate: () => {},
});

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [displayCurrency, setDisplayCurrencyState] = useState<DisplayCurrency>(() => {
    return (localStorage.getItem("displayCurrency") as DisplayCurrency) ?? "USD";
  });
  const [usdToUgxRate, setUsdToUgxRate] = useState<number | null>(null);

  const setDisplayCurrency = (c: DisplayCurrency) => {
    localStorage.setItem("displayCurrency", c);
    setDisplayCurrencyState(c);
  };

  useEffect(() => {
    const stored = localStorage.getItem("displayCurrency") as DisplayCurrency | null;
    if (stored) setDisplayCurrencyState(stored);
  }, []);

  return (
    <CurrencyContext.Provider value={{ displayCurrency, setDisplayCurrency, usdToUgxRate, setUsdToUgxRate }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  return useContext(CurrencyContext);
}
