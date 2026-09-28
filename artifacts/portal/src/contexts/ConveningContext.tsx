import { createContext, useContext, useState, useEffect, ReactNode, Fragment } from "react";
import { useListConvenings, getListConveningsQueryKey, type Convening } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

const STORAGE_KEY = "mkutano:activeConveningId";

interface ConveningContextType {
  activeConveningId: string | null;
  setActiveConveningId: (id: string | null) => void;
  activeConvening: Convening | null;
}

const ConveningContext = createContext<ConveningContextType | undefined>(undefined);

export function ConveningProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [activeConveningId, setActiveConveningIdState] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY),
  );

  const { data: convenings } = useListConvenings();

  useEffect(() => {
    if (!convenings) return;
    if (convenings.length === 0) {
      setActiveConveningIdState(null);
      localStorage.removeItem(STORAGE_KEY);
      return;
    }

    const storedId = activeConveningId;
    const isValid  = storedId && convenings.some((c) => c.id === storedId);

    if (!isValid) {
      const fallback = convenings[0].id;
      setActiveConveningIdState(fallback);
      localStorage.setItem(STORAGE_KEY, fallback);
    }
  }, [convenings, activeConveningId]);

  const setActiveConveningId = (id: string | null) => {
    // A create mutation may update the cached list immediately before selecting
    // its new ID; this render's `convenings` can still be the previous snapshot.
    const latest = queryClient.getQueryData<Convening[]>(getListConveningsQueryKey()) ?? convenings;
    if (id && !latest?.some((c) => c.id === id)) return;
    setActiveConveningIdState(id);
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  };

  const activeConvening = convenings?.find((c) => c.id === activeConveningId) || null;
  // Never expose an unverified persisted selection to project-scoped requests.
  const verifiedId = activeConvening?.id ?? null;

  return (
    <ConveningContext.Provider value={{ activeConveningId: verifiedId, setActiveConveningId, activeConvening }}>
      <Fragment key={verifiedId ?? "no-project"}>{children}</Fragment>
    </ConveningContext.Provider>
  );
}

const CONVENING_FALLBACK: ConveningContextType = {
  activeConveningId: null,
  setActiveConveningId: () => {},
  activeConvening: null,
};

export function useConvening() {
  // Return safe defaults during HMR remounts when the provider is briefly unavailable.
  // In production the provider is always present; this guard only fires transiently.
  return useContext(ConveningContext) ?? CONVENING_FALLBACK;
}
