vi.mock("@/lib/clientData", () => ({ getSatellite: vi.fn() }));
import { expect, it, vi } from "vitest";
import { commonSatelliteFrames } from "./useSatelliteStack";
import type { SatelliteFrames } from "@/lib/types";
it("synchronizes 5/10/15 minute products only at actual shared timestamps", () => {
  const catalog = (step: number) => ({ frames: Array.from({length: 61/step|0}, (_, i) => new Date(Date.UTC(2026,10,15,12,i*step)).toISOString()) }) as SatelliteFrames;
  const shared = commonSatelliteFrames([catalog(5), catalog(10), catalog(15)]);
  expect(shared).toEqual(["2026-11-15T12:00:00.000Z", "2026-11-15T12:30:00.000Z"]);
  expect(commonSatelliteFrames([])).toEqual([]);
});
