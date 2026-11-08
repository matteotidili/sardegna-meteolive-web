import { useCallback, useEffect, useState } from "react";

const PREFIX = "smm2:";

/** useState mirrored to localStorage (map centre, zoom, layers…). Corrupt entries fall back to the default. */
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw == null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const v = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        try {
          localStorage.setItem(PREFIX + key, JSON.stringify(v));
        } catch {
          /* quota / private mode: keep in memory only */
        }
        return v;
      });
    },
    [key],
  );
  return [value, set] as const;
}

export function useIsDesktop() {
  const q = "(min-width: 1024px)";
  const [is, setIs] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = (e: MediaQueryListEvent) => setIs(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return is;
}
