import { Pause, Play, SkipBack, SkipForward, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  labels: string[];
  index: number;
  setIndex: (i: number) => void;
  playing: boolean;
  setPlaying: (b: boolean) => void;
  speed: number;
  setSpeed: (n: number) => void;
  loading: boolean;
  legend?: React.ReactNode;
  note?: string;
}

export default function TimelinePlayer(p: Props) {
  const n = p.labels.length;
  if (!n) return null;
  const step = (d: number) => { p.setPlaying(false); p.setIndex((p.index + d + n) % n); };
  return (
    <div data-testid="timeline-player" className="hud-in pointer-events-auto rounded-2xl border border-slate-800 bg-slate-900/95 p-3 text-slate-100 shadow-2xl shadow-black/60 backdrop-blur-xl">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-[0.18em] text-sky-300" data-testid="timeline-title">{p.title}</span>
        {p.loading && <Loader2 className="size-3 animate-spin text-slate-400" data-testid="timeline-loading" />}
        <span className="ml-auto font-num text-sm font-medium" data-testid="timeline-current-label">{p.labels[p.index]}</span>
      </div>
      <div className="mt-1 flex items-center gap-1.5">
        <button data-testid="timeline-prev-btn" onClick={() => step(-1)} aria-label="Precedente" className="rounded-md p-1.5 text-slate-300 transition-colors hover:bg-slate-800 hover:text-sky-300 active:scale-95"><SkipBack className="size-4" /></button>
        <button data-testid="radar-timeline-play-btn" onClick={() => p.setPlaying(!p.playing)} aria-label={p.playing ? "Pausa" : "Riproduci"}
          className="grid size-9 place-items-center rounded-full bg-sky-600 text-white shadow-lg shadow-sky-600/30 transition-transform hover:bg-sky-500 active:scale-95">
          {p.playing ? <Pause className="size-4" /> : <Play className="ml-0.5 size-4" />}
        </button>
        <button data-testid="timeline-next-btn" onClick={() => step(1)} aria-label="Successivo" className="rounded-md p-1.5 text-slate-300 transition-colors hover:bg-slate-800 hover:text-sky-300 active:scale-95"><SkipForward className="size-4" /></button>
        <input data-testid="radar-timeline-slider" type="range" min={0} max={n - 1} step={1} value={p.index}
          onChange={(e) => { p.setPlaying(false); p.setIndex(Number(e.target.value)); }} className="meteo-range mx-1 flex-1" aria-label="Timeline" />
        <button data-testid="radar-speed-btn" onClick={() => p.setSpeed(p.speed >= 3 ? 1 : p.speed + 1)}
          className={cn("rounded-md border border-slate-700 px-2 py-1 font-num text-xs transition-colors hover:bg-slate-800", p.speed > 1 && "text-sky-300")}>
          {p.speed}×
        </button>
      </div>
      {p.legend}
      {p.note && <p className="mt-1 text-[10px] leading-snug text-slate-500" data-testid="timeline-note">{p.note}</p>}
    </div>
  );
}
