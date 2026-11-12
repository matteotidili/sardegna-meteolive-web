import { useQuery } from "@tanstack/react-query";
import { getMarineCatalog, getMarineScale, getMarineVectors, marineVectorZoom, type MarineForcing, type MarineModel, type MarineParameter } from "@/lib/marine";

export const useMarineCatalog = (model: MarineModel, forcing: MarineForcing, enabled: boolean) =>
  useQuery({
    queryKey: ["marineCatalog", model, forcing],
    queryFn: ({ signal }) => getMarineCatalog(model, forcing, signal),
    enabled,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    refetchInterval: enabled ? (model === "shyfem" ? 5 : 10) * 60_000 : false,
    refetchOnWindowFocus: true,
    retry: 1,
  });

export const useMarineVectors = (time: string | null, zoom: number, enabled: boolean, runTime?: string) =>
  useQuery({
    queryKey: ["marineVectors", runTime, time, marineVectorZoom(zoom)],
    queryFn: ({ signal }) => getMarineVectors(time!, zoom, signal, runTime),
    enabled: enabled && !!time,
    staleTime: 2 * 60_000,
    // Dense GeoJSON stays only while this frame is observed; HTTP cache is keyed by run.
    gcTime: 0,
    retry: 1,
  });

export const useMarineScale = (parameter: MarineParameter, enabled: boolean) =>
  useQuery({
    queryKey: ["marineScale", parameter],
    queryFn: ({ signal }) => getMarineScale(parameter, signal),
    enabled,
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  });
