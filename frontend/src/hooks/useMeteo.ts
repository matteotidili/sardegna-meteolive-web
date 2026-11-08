import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import type {
  AlertsResponse, AromeResponse, FrpResponse, RadarFrames, Rain48Response, StationsResponse,
} from "@/lib/types";

// Observations: fast polling while the app is open; refetch immediately on tab focus
// (mobile reopen) and on network reconnect. Backend caches upstream for 60 s.
export const useStations = () =>
  useQuery({
    queryKey: ["stations"],
    queryFn: () => apiGet<StationsResponse>("/stations"),
    refetchInterval: 60_000,
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
    retry: 1,
  });

export const useAlerts = () =>
  useQuery({
    queryKey: ["alerts"],
    queryFn: () => apiGet<AlertsResponse>("/alerts"),
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: "always",
    retry: 1,
  });

export const useArome = (enabled = true) =>
  useQuery({
    queryKey: ["arome"],
    queryFn: () => apiGet<AromeResponse>("/arome"),
    refetchInterval: 15 * 60_000,
    enabled,
    retry: 1,
  });

export const useRadar = (product: string | null) =>
  useQuery({
    queryKey: ["radar", product],
    queryFn: () => apiGet<RadarFrames>(`/radar/${product}`),
    enabled: !!product,
    refetchInterval: 2 * 60_000,
    refetchOnWindowFocus: "always",
    retry: 1,
  });

export const useFrp = (enabled: boolean) =>
  useQuery({
    queryKey: ["frp"],
    queryFn: () => apiGet<FrpResponse>("/frp"),
    enabled,
    refetchInterval: 10 * 60_000,
    retry: 1,
  });

export const useRain48 = () =>
  useQuery({ queryKey: ["rain48"], queryFn: () => apiGet<Rain48Response>("/rain48"), retry: 1 });
