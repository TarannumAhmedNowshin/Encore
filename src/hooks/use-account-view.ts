import { useEffect, useState } from "react";

export type AccountView = "orbit" | "quadrant" | "list";
export const ACCOUNT_ORBIT_EVENT = "encore:show-account-orbit";

export function useAccountView(analysisId: string) {
  const [view, setView] = useState<AccountView>("orbit");
  const key = `encore:account-view:${analysisId}`;

  useEffect(() => {
    let saved: string | null = null;
    try { saved = sessionStorage.getItem(key); } catch { /* Storage may be unavailable. */ }
    setView(saved === "list" || saved === "quadrant" ? saved : "orbit");
    const showOrbit = () => setView("orbit");
    window.addEventListener(ACCOUNT_ORBIT_EVENT, showOrbit);
    return () => window.removeEventListener(ACCOUNT_ORBIT_EVENT, showOrbit);
  }, [key]);

  const chooseView = (next: AccountView) => {
    setView(next);
    try { sessionStorage.setItem(key, next); } catch { /* The choice still works without storage. */ }
  };

  return [view, chooseView] as const;
}