import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { decodeWind } from "@/lib/windFlow";
import {
  getAlerts, getArome, getFrp, getModelPoint, getRadar, getRain48, getSatellite, getStations, getWindMeta,
} from "@/lib/clientData";
import type { RadarFrames, WindGrid } from "@/lib/types";

// All data is read directly by the browser (works as a static site on GitHub Pages).
// Observations: fast polling while the app is open; immediate refetch on tab focus
// (mobile reopen) and on network reconnect.
export const useStations = () =>
  useQuery({
    queryKey: ["stations"],
    queryFn: getStations,
    refetchInterval: 60_000,
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
    retry: 1,
  });

export const useAlerts = () =>
  useQuery({ queryKey: ["alerts"], queryFn: getAlerts, refetchInterval: 5 * 60_000, refetchOnWindowFocus: "always", retry: 1 });

export const useArome = (enabled = true) =>
  useQuery({ queryKey: ["arome"], queryFn: getArome, refetchInterval: 15 * 60_000, enabled, retry: 1 });

export const useRadar = (product: string | null) =>
  useQuery({
    queryKey: ["radar", product],
    // direct DPC API (allowed for the GitHub Pages origin); same-origin /api as fallback where a backend exists
    queryFn: () => getRadar(product!).catch(() => apiGet<RadarFrames>(`/radar/${product}`)),
    enabled: !!product,
    refetchInterval: 2 * 60_000,
    refetchOnWindowFocus: "always",
    retry: 1,
  });

export const useFrp = (enabled: boolean) =>
  useQuery({ queryKey: ["frp"], queryFn: getFrp, enabled, refetchInterval: 10 * 60_000, retry: 1 });

export const useRain48 = () => useQuery({ queryKey: ["rain48"], queryFn: getRain48, retry: 1 });

export const useWindMeta = (enabled: boolean) =>
  useQuery({ queryKey: ["windMeta"], queryFn: getWindMeta, enabled, refetchInterval: 15 * 60_000, retry: 1 });

/** Raw U/V binary for one lead (static file on the data repo). */
export const useWindField = (url: string | null, grid: WindGrid | undefined) =>
  useQuery({
    queryKey: ["windBin", url],
    enabled: !!url && !!grid,
    staleTime: Infinity,
    retry: 1,
    queryFn: async () => {
      const r = await fetch(url!);
      if (!r.ok) throw new Error(`vento ${r.status}`);
      return decodeWind(await r.arrayBuffer(), grid!);
    },
  });

export const useModelPoint = (s: { lat: number; lon: number; last: string | null; id: string } | null) =>
  useQuery({
    queryKey: ["modelPoint", s?.id, s?.last],
    enabled: !!s?.last,
    staleTime: 10 * 60_000,
    retry: false,
    queryFn: () => getModelPoint(s!.lat, s!.lon, s!.last!),
  });

export const useSatellite = (product: string | null) =>
  useQuery({
    queryKey: ["satellite", product],
    queryFn: () => getSatellite(product!),
    enabled: !!product,
    refetchInterval: 5 * 60_000,
    staleTime: 3 * 60_000,
    refetchOnWindowFocus: "always",
    retry: false,
  });
