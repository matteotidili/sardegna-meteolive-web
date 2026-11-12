/** Keep a small margin around the rounded map viewport, clipped to the model's sea domain. */
export function marineViewportBounds(domain: [number, number][], viewport: [number, number, number, number] | null): [number, number][] {
  if (!viewport || !viewport.every(Number.isFinite)) return domain;
  const [north, east, south, west] = viewport;
  if (north < south || east < west) return domain;
  const [[s, w], [n, e]] = domain;
  const clipped: [number, number][] = [[Math.max(s, south - 0.15), Math.max(w, west - 0.15)], [Math.min(n, north + 0.15), Math.min(e, east + 0.15)]];
  return clipped[0][0] < clipped[1][0] && clipped[0][1] < clipped[1][1] ? clipped : domain;
}
