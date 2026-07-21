"use client";

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";

interface CampaignState {
  active: boolean;
  setActive: (v: boolean) => void;
}

const CampaignCtx = createContext<CampaignState | null>(null);

export function CampaignProvider({
  initialActive,
  children,
}: {
  initialActive: boolean;
  children: ReactNode;
}) {
  const [active, setActive] = useState(initialActive);
  return (
    <CampaignCtx.Provider value={{ active, setActive }}>
      {children}
    </CampaignCtx.Provider>
  );
}

export function useCampaign(): CampaignState {
  const ctx = useContext(CampaignCtx);
  if (!ctx) throw new Error("useCampaign must be used within CampaignProvider");
  return ctx;
}
