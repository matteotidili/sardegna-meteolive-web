import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { getSatellite } from "@/lib/clientData";
import type { SatelliteFrames } from "@/lib/types";

export function commonSatelliteFrames(catalogs: SatelliteFrames[]): string[] {
  if (!catalogs.length) return [];
  const sets = catalogs.map((c) => new Set(c.frames.map(Date.parse)));
  return catalogs[0].frames.filter((t) => sets.every((set) => set.has(Date.parse(t))));
}

export function useSatelliteStack(products: string[], enabled: boolean) {
  const queries = useQueries({ queries: products.map((product) => ({
    queryKey: ["satellite", product], queryFn: () => getSatellite(product), enabled,
    refetchInterval: 5 * 60_000, staleTime: 3 * 60_000, retry: 1,
  })) });
  const signature = JSON.stringify(queries.map((q) => q.data ?? null));
  const catalogs = useMemo(() => queries.every((q) => !!q.data) ? queries.map((q) => q.data!) : [], [signature]);
  const data = useMemo((): SatelliteFrames | undefined => {
    if (!catalogs.length) return undefined;
    const frames = commonSatelliteFrames(catalogs);
    if (!frames.length) return undefined;
    const bounds: [number, number][] = [
      [Math.min(...catalogs.map((c) => c.bounds[0][0])), Math.min(...catalogs.map((c) => c.bounds[0][1]))],
      [Math.max(...catalogs.map((c) => c.bounds[1][0])), Math.max(...catalogs.map((c) => c.bounds[1][1]))],
    ];
    return { ...catalogs[0], label: catalogs.map((c) => c.label).join(" + "), frames, bounds,
      latest: frames.at(-1)!, step_minutes: frames.length > 1 ? (Date.parse(frames[1])-Date.parse(frames[0]))/60000 : catalogs[0].step_minutes,
      daytime_only: catalogs.every((c) => c.daytime_only) };
  }, [catalogs]);
  return { data, catalogs, isError: queries.some((q) => q.isError) || (!!catalogs.length && !data), isLoading: queries.some((q) => q.isLoading) };
}
