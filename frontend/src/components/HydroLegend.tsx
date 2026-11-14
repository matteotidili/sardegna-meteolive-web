import { HYDRO_DASHBOARD } from "@/lib/hydro";

const items = [
  ["#31a8d8", "Sotto S1"],
  ["#f1d54b", "S1 superata"],
  ["#f28c35", "S2 superata"],
  ["#dc3d3d", "S3 superata"],
  ["#8aa0ad", "Soglie assenti / dato non recente"],
] as const;

export default function HydroLegend({ count }: { count: number }) {
  return (
    <div data-testid="hydro-legend" className="pointer-events-auto mt-1.5 rounded-xl border border-slate-800 bg-slate-900/95 px-2.5 py-2 text-slate-200 shadow-xl backdrop-blur-xl">
      <div className="mb-1.5 flex justify-between gap-2 text-[10px] uppercase tracking-[0.14em] text-slate-300">
        <span>Idrometri ARPAS</span><span className="font-num normal-case">{count} sezioni</span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-300">
        {items.map(([color, label]) => (
          <span className="inline-flex items-center gap-1" key={label}>
            <span className="size-2.5 shrink-0 rounded-full border border-white" style={{ background: color }} />
            {label}
          </span>
        ))}
      </div>
      <p className="mt-1.5 text-[9px] text-slate-400">
        Soglie della singola sezione, non allerte territoriali.{" "}
        <a className="text-sky-300 underline" href={HYDRO_DASHBOARD} target="_blank" rel="noopener noreferrer">
          Fonte ufficiale ARPAS
        </a>
      </p>
    </div>
  );
}
