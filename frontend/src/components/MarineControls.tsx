import { Navigation } from "lucide-react";
import type { MarineCatalog, MarineForcing, MarineModel, MarineParameter } from "@/lib/marine";

export const MARINE_LABELS: Record<MarineParameter, { label: string; short: string; unit: string }> = {
  hs: { label: "Altezza significativa delle onde", short: "Altezza onde", unit: "m" },
  t01: { label: "Periodo medio delle onde", short: "Periodo medio", unit: "s" },
  wl: { label: "Livello del mare", short: "Livello mare", unit: "m" },
};

interface Props {
  model: MarineModel;
  onModel: (model: MarineModel) => void;
  parameter: MarineParameter;
  onParameter: (parameter: MarineParameter) => void;
  forcing: MarineForcing;
  onForcing: (forcing: MarineForcing) => void;
  catalog: MarineCatalog | undefined;
  loading: boolean;
  error: boolean;
  arrows: boolean;
  onArrows: (on: boolean) => void;
  onMediterranean: () => void;
  onSardinia: () => void;
}

const SELECT = "h-8 w-full rounded-md border border-slate-700 bg-slate-950 px-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500";

export default function MarineControls(p: Props) {
  const forcings = p.catalog?.model === "shyfem" ? p.catalog.availableForcings : [];
  return (
    <div className="space-y-2 px-1" data-testid="marine-controls">
      <label className="block space-y-1 text-[11px] text-slate-400">
        <span>Modello marino</span>
        <select data-testid="marine-model-select" aria-label="Modello marino" className={SELECT} value={p.model}
          onChange={(e) => p.onModel(e.target.value as MarineModel)}>
          <option value="ww3">WW3 MEDITA · onde</option>
          <option value="shyfem">SHYFEM · livello del mare</option>
        </select>
      </label>
      <label className="block space-y-1 text-[11px] text-slate-400">
        <span>Parametro</span>
        <select data-testid="marine-parameter-select" aria-label="Parametro marino" className={SELECT} value={p.parameter}
          onChange={(e) => p.onParameter(e.target.value as MarineParameter)}>
          {(p.model === "ww3" ? ["hs", "t01"] : ["wl"]).map((key) => (
            <option key={key} value={key}>{MARINE_LABELS[key as MarineParameter].label} ({MARINE_LABELS[key as MarineParameter].unit})</option>
          ))}
        </select>
      </label>
      {p.model === "shyfem" && forcings.length > 0 && (
        <label className="block space-y-1 text-[11px] text-slate-400">
          <span>Forzante atmosferica</span>
          <select data-testid="marine-forcing-select" aria-label="Forzante SHYFEM" className={SELECT}
            value={p.catalog?.forcing ?? p.forcing} onChange={(e) => p.onForcing(e.target.value as MarineForcing)}>
            {forcings.map((f) => <option key={f} value={f}>{f === "ICON" ? "ICON-2I" : f}</option>)}
          </select>
        </label>
      )}
      {p.model === "ww3" && (
        <button data-testid="marine-directions-toggle" aria-pressed={p.arrows} onClick={() => p.onArrows(!p.arrows)}
          className="flex w-full items-center gap-2 rounded-md border border-slate-700 bg-slate-950/50 px-2 py-2 text-left text-xs text-slate-200 hover:border-sky-700">
          <Navigation className="size-3.5 text-sky-300" /><span className="flex-1">Direzione delle onde</span>
          <span className="font-num text-[10px] text-sky-300">{p.arrows ? "ON" : "OFF"}</span>
        </button>
      )}
      <div className="grid grid-cols-2 gap-1.5">
        <button data-testid="marine-fit-mediterranean" onClick={p.onMediterranean}
          className="rounded-md border border-sky-800 bg-sky-950/60 px-2 py-2 text-xs text-sky-200 hover:bg-sky-900/60">Mediterraneo</button>
        <button data-testid="marine-fit-sardinia" onClick={p.onSardinia}
          className="rounded-md border border-slate-700 bg-slate-950/50 px-2 py-2 text-xs text-slate-200 hover:bg-slate-800">Sardegna</button>
      </div>
      {p.loading && <p data-testid="marine-catalog-loading" className="text-[10px] text-slate-400">Verifica della corsa e delle scadenze disponibili…</p>}
      {p.error && <p data-testid="marine-catalog-warning" className="text-[10px] text-amber-200">Aggiornamento del modello non disponibile. Puoi riprovare fra poco.</p>}
      <p className="text-[10px] leading-relaxed text-slate-400">
        {p.model === "ww3" ? "Previsione delle onde sul Mediterraneo · passi orari fino a H+72. Frecce secondo la convenzione MeteoHub."
          : "Previsione del livello del mare sul Mediterraneo · sono mostrate le forzanti disponibili per la corsa pubblicata."}
      </p>
    </div>
  );
}

export function MarineAttribution({ catalog }: { catalog: MarineCatalog }) {
  return (
    <p data-testid="marine-attribution" className="mt-1 text-[9px] leading-relaxed text-slate-400">
      {catalog.attribution}. Mappa: Agenzia ItaliaMeteo – CINECA.{" "}
      <a href={catalog.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-sky-300 underline">MeteoHub</a>{" · "}
      <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer" className="text-sky-300 underline">CC BY 4.0</a>
    </p>
  );
}
