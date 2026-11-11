import { useMemo, useState } from "react";
import { Search, ArrowDownWideNarrow, ArrowUpNarrowWide } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { Station } from "@/lib/types";
import { NETWORK_META, colorFor, fmtAge, fmtDay, fmtValue, freshnessFor, slug, valueOf, type ParamDef } from "@/lib/meteo";
import { cn } from "@/lib/utils";

interface Props {
  stations: Station[]; // already network-filtered
  param: ParamDef;
  selectedId: string | null;
  onPick: (s: Station) => void;
  networks: Record<string, boolean>;
  onToggleNetwork: (key: string) => void;
  onSetAllNetworks: (enabled: boolean) => void;
  counts: Record<string, number>;
  loading: boolean;
}

export default function StationList({ stations, param, selectedId, onPick, networks, onToggleNetwork, onSetAllNetworks, counts, loading }: Props) {
  const [q, setQ] = useState("");
  const [desc, setDesc] = useState(true);
  const networkKeys = Array.from(new Set([...Object.keys(NETWORK_META), ...Object.keys(counts)]));
  const anyActive = networkKeys.some((key) => networks[key] !== false);

  // Searchable independently of what the map can draw at the current scale.
  const rows = useMemo(() => {
    if (!anyActive) return [];
    const needle = q.trim().toLowerCase();
    const list = stations.filter((s) => !needle || s.name.toLowerCase().includes(needle));
    return list
      .map((s) => ({ s, v: valueOf(s, param), f: freshnessFor(s, param) }))
      .sort((a, b) => {
        if (a.v === null && b.v === null) return a.s.name.localeCompare(b.s.name);
        if (a.v === null) return 1;
        if (b.v === null) return -1;
        // current values first; daily values from past days always last
        const rank = (x: typeof a) => (x.f === "historic" ? 1 : 0) + (param.dayBound && !x.s.is_today ? 2 : 0);
        const ah = rank(a), bh = rank(b);
        if (ah !== bh) return ah - bh;
        return desc ? b.v - a.v : a.v - b.v;
      });
  }, [stations, param, q, desc, anyActive]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 px-3 pt-3">
        <span className="text-xs font-medium text-slate-300">Reti di stazioni</span>
        <button
          type="button"
          data-testid="network-toggle-all"
          aria-label={anyActive ? "Disattiva tutte le reti di stazioni" : "Attiva tutte le reti di stazioni"}
          onClick={() => onSetAllNetworks(!anyActive)}
          className="inline-flex h-8 shrink-0 items-center rounded-md border border-slate-600 bg-slate-800 px-3 text-xs font-semibold text-slate-100 transition-colors hover:border-sky-500 hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
        >
          {anyActive ? "Disattiva tutte" : "Attiva tutte"}
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5 px-3 pt-2">
        {networkKeys.map((k) => (
          <button
            key={k}
            type="button"
            data-testid={`network-filter-${k}`}
            aria-pressed={networks[k] !== false}
            onClick={() => onToggleNetwork(k)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors duration-150",
              networks[k] !== false ? "border-slate-600 bg-slate-800 text-slate-100" : "border-slate-800 bg-transparent text-slate-500 line-through",
            )}
          >
            <span className="size-1.5 rounded-full" style={{ background: NETWORK_META[k]?.color ?? "#94A3B8" }} />
            {NETWORK_META[k]?.short ?? k}
            <span className="font-num text-slate-400">{counts[k] ?? 0}</span>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-500" />
          <Input
            data-testid="station-search-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cerca stazione…"
            className="h-8 border-slate-700 bg-slate-950/60 pl-8 text-sm"
          />
        </div>
        <button
          data-testid="station-sort-select"
          onClick={() => setDesc((d) => !d)}
          title={desc ? "Ordine decrescente" : "Ordine crescente"}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-700 bg-slate-950/60 px-2 text-[11px] text-slate-300 transition-colors hover:bg-slate-800 hover:text-sky-300"
        >
          {desc ? <ArrowDownWideNarrow className="size-3.5" /> : <ArrowUpNarrowWide className="size-3.5" />}
          {desc ? "Decr." : "Cresc."}
        </button>
      </div>
      <div className="flex items-center justify-between px-3 pb-1 text-[10px] uppercase tracking-[0.18em] text-slate-500">
        <span>{param.label}</span>
        <span data-testid="station-list-count" className="font-num normal-case tracking-normal">{rows.length} stazioni</span>
      </div>
      <ul data-testid="station-list-container" className="thin-scroll min-h-0 flex-1 divide-y divide-slate-800/60 overflow-y-auto">
        {!anyActive && (
          <li className="p-4 text-xs text-slate-400" data-testid="station-list-empty">Tutte le reti sono disattivate.</li>
        )}
        {anyActive && loading && !stations.length && Array.from({ length: 8 }).map((_, i) => (
          <li key={i} className="mx-3 my-2 h-8 animate-pulse rounded bg-slate-800/50" />
        ))}
        {anyActive && !loading && !stations.length && (
          <li className="p-4 text-xs text-slate-500" data-testid="station-list-empty">Nessun dato stazioni disponibile al momento.</li>
        )}
        {rows.map(({ s, v, f }) => (
          <li key={s.id}>
            <button
              data-testid={`station-item-${slug(s.id)}`}
              onClick={() => onPick(s)}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors duration-100 hover:bg-slate-800/70",
                s.id === selectedId && "bg-sky-950/60",
              )}
            >
              <span className="size-1.5 shrink-0 rounded-full" style={{ background: NETWORK_META[s.network]?.color }} />
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate text-[13px]", f === "historic" ? "text-slate-400" : "text-slate-100")}>{s.name}</span>
                <span className="block font-num text-[10px] text-slate-500">
                  {NETWORK_META[s.network]?.short} · {param.dayBound && !s.is_today ? `del ${fmtDay(s.obs_day).slice(0, 5)}` : fmtAge(s.age_min)}{s.elev != null ? ` · ${Math.round(s.elev)} m` : ""}
                </span>
              </span>
              {v !== null ? (
                <span
                  className={cn("rounded-full px-2 py-0.5 font-num text-xs font-semibold text-white", f === "historic" && "text-slate-200")}
                  style={{ background: f === "fresh" ? colorFor(param, v) : `color-mix(in srgb, ${colorFor(param, v)} ${f === "stale" ? 85 : 62}%, #1F2937)` }}
                >
                  {fmtValue(v, param)}
                </span>
              ) : (
                <span className="text-[10px] text-slate-600">non misurato</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
