import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../api/client";
import type { Athlete, Unit } from "../api/types";

/** Keeps the list of athletes and which one is selected (remembered per browser). */
interface Ctx {
  athletes: Athlete[];
  athlete: Athlete | null;
  unit: Unit;
  loading: boolean;
  error: string | null;
  select: (id: number) => void;
  refresh: () => Promise<Athlete[]>;
}

const AthleteContext = createContext<Ctx | null>(null);
const KEY = "plc.selectedAthleteId";

function readSelected(): number | null {
  try {
    const v = localStorage.getItem(KEY);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

export function AthleteProvider({ children }: { children: ReactNode }) {
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(readSelected);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await api.listAthletes();
      setAthletes(list);
      setError(null);
      return list;
    } catch (e) {
      setError((e as Error).message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const select = useCallback((id: number) => {
    setSelectedId(id);
    try {
      localStorage.setItem(KEY, String(id));
    } catch {
      /* storage unavailable: selection just won't persist */
    }
  }, []);

  // Fall back to the first real (non-demo) athlete if the remembered one is gone.
  const athlete = useMemo(
    () => athletes.find((a) => a.id === selectedId) ?? athletes.find((a) => !a.is_demo) ?? athletes[0] ?? null,
    [athletes, selectedId],
  );

  const value: Ctx = { athletes, athlete, unit: athlete?.preferred_unit ?? "kg", loading, error, select, refresh };
  return <AthleteContext.Provider value={value}>{children}</AthleteContext.Provider>;
}

export function useAthlete() {
  const ctx = useContext(AthleteContext);
  if (!ctx) throw new Error("useAthlete must be used inside AthleteProvider");
  return ctx;
}

/** Same as useAthlete but guarantees an athlete (pages render only once one exists). */
export function useCurrentAthlete() {
  const ctx = useAthlete();
  if (!ctx.athlete) throw new Error("No athlete selected");
  return { ...ctx, athlete: ctx.athlete };
}
