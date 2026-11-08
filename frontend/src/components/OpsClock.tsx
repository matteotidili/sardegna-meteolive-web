import { useEffect, useState } from "react";

const fmt = (d: Date, tz: string) =>
  d.toLocaleTimeString("it-IT", { timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

/** Wall clock for the operations room: Italian local time + UTC (radar/model times are UTC-based). */
export default function OpsClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div data-testid="ops-clock" className="hidden shrink-0 items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1 font-num lg:flex">
      <div className="leading-none">
        <div className="text-[9px] uppercase tracking-[0.16em] text-slate-500">Ora locale</div>
        <div data-testid="ops-clock-local" className="text-[15px] font-semibold tabular-nums text-slate-50">{fmt(now, "Europe/Rome")}</div>
      </div>
      <div className="h-6 w-px bg-slate-800" />
      <div className="leading-none">
        <div className="text-[9px] uppercase tracking-[0.16em] text-slate-500">UTC</div>
        <div data-testid="ops-clock-utc" className="text-[15px] font-semibold tabular-nums text-sky-300">{fmt(now, "UTC")}</div>
      </div>
    </div>
  );
}
